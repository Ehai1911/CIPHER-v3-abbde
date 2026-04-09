const https = require('https');
const { saveAnalysis } = require('./supabase');

// Проверка URL через Jina — возвращает true если сайт реально существует
function validateUrl(url) {
  return new Promise((resolve) => {
    try {
      const clean = url.trim().replace(/^https?:\/\//, '');
      const req = https.request({
        hostname: 'r.jina.ai', path: '/' + clean, method: 'GET',
        headers: { 'Accept': 'text/plain', 'X-Return-Format': 'text', 'User-Agent': 'Mozilla/5.0' }
      }, (res) => {
        let raw = '';
        res.on('data', c => raw += c);
        res.on('end', () => resolve(raw.length > 150));
      });
      req.on('error', () => resolve(false));
      req.setTimeout(8000, () => { req.destroy(); resolve(false); });
      req.end();
    } catch(e) { resolve(false); }
  });
}

// Jina Search — Brave поиск (хорошо для глобальных/западных рынков)
function searchJina(query) {
  return new Promise((resolve) => {
    try {
      const encoded = encodeURIComponent(query);
      const req = https.request({
        hostname: 's.jina.ai',
        path: '/' + encoded,
        method: 'GET',
        headers: { 'Accept': 'application/json', 'X-Return-Format': 'json', 'User-Agent': 'Mozilla/5.0' }
      }, (res) => {
        let raw = '';
        res.on('data', c => raw += c);
        res.on('end', () => {
          try {
            const json = JSON.parse(raw);
            const results = json.data || [];
            resolve(results.slice(0, 10).map(r => ({ url: r.url, title: r.title || '', description: r.description || r.content || '' })));
          } catch(e) { resolve([]); }
        });
      });
      req.on('error', () => resolve([]));
      req.setTimeout(10000, () => { req.destroy(); resolve([]); });
      req.end();
    } catch(e) { resolve([]); }
  });
}

// Поиск через скрапинг поисковика (Yandex/Google) — лучше для СНГ/Казахстан
function searchViaReader(searchUrl, timeoutMs) {
  return new Promise((resolve) => {
    try {
      const clean = searchUrl.replace(/^https?:\/\//, '');
      const req = https.request({
        hostname: 'r.jina.ai', path: '/' + clean, method: 'GET',
        headers: { 'Accept': 'text/plain', 'X-Return-Format': 'text', 'User-Agent': 'Mozilla/5.0' }
      }, (res) => {
        let raw = '';
        res.on('data', c => raw += c);
        res.on('end', () => resolve(raw));
      });
      req.on('error', () => resolve(''));
      req.setTimeout(timeoutMs || 15000, () => { req.destroy(); resolve(''); });
      req.end();
    } catch(e) { resolve(''); }
  });
}

// Извлекаем реальные URL из текста поисковой выдачи (Bing, Brave, etc.)
function extractUrlsFromText(text) {
  const SKIP = ['google.com','google.kz','google.ru','yandex.ru','yandex.kz','yandex.com',
    'youtube.com','facebook.com','instagram.com','wikipedia.org','twitter.com','t.me','vk.com',
    'ok.ru','2gis.ru','2gis.kz','avito.ru','hh.ru','goo.gl','bing.com','microsoft.com',
    'maps.google','support.google','accounts.google','translate.google','play.google',
    'apps.apple','linkedin.com','tiktok.com','msn.com','live.com'];
  const seen = new Set();
  const results = [];

  // Markdown ссылки вида [Название](https://url.com)
  const mdRegex = /\[([^\]]{2,100})\]\((https?:\/\/[^\s)]{5,120})\)/g;
  let m;
  while ((m = mdRegex.exec(text)) !== null) {
    try {
      const parsed = new URL(m[2]);
      const domain = parsed.hostname.replace('www.','');
      if (SKIP.some(s => domain.includes(s))) continue;
      if (seen.has(domain)) continue;
      seen.add(domain);
      results.push({ url: parsed.origin, title: m[1].trim(), description: '' });
    } catch(e) {}
  }

  // Plain URLs в тексте — Bing возвращает формат:
  //   domain.kz
  //   https://www.domain.kz › path
  //   Заголовок страницы — описание
  const urlRegex = /https?:\/\/([a-zA-Z0-9\-\.]+\.[a-zA-Z]{2,6})\b/g;
  const lines = text.split('\n');
  while ((m = urlRegex.exec(text)) !== null) {
    try {
      const domain = m[1].replace('www.','');
      if (SKIP.some(s => domain.includes(s))) continue;
      if (seen.has(domain)) continue;
      seen.add(domain);
      // Ищем строку с этим URL, берём следующую строку как заголовок (формат Bing)
      const urlLineIdx = lines.findIndex(l => l.includes(m[0].split('›')[0].trim()));
      const titleLine = urlLineIdx >= 0 ? (lines[urlLineIdx + 1] || lines[urlLineIdx - 1] || domain) : domain;
      const title = titleLine.replace(/https?:\/\/.*/,'').trim() || domain;
      results.push({ url: 'https://' + domain, title, description: '' });
    } catch(e) {}
  }

  return results;
}

// Определяем нужен ли поиск через СНГ-поисковики
function isCisGeo(geoArr) {
  const cis = ['казахстан','снг','россия','беларусь','узбекистан','кыргызстан','азербайджан','армения','грузия','украина'];
  return (geoArr || []).some(g => cis.some(c => g.toLowerCase().includes(c)));
}

// Поиск через DuckDuckGo HTML — работает для СНГ/Казахстан (Bing заблокирован Jina)
async function searchDDGRaw(queries, geo) {
  const geoLower = (geo || '').toLowerCase();
  const kl = geoLower.includes('казахстан') ? 'kz-kz' : geoLower.includes('россия') ? 'ru-ru' : 'us-en';
  const rawTexts = [];
  for (const q of queries) {
    const encoded = encodeURIComponent(q);
    const text = await searchViaReader(`https://html.duckduckgo.com/html/?q=${encoded}&kl=${kl}`);
    if (text && text.length > 300) rawTexts.push(text.substring(0, 3000));
  }
  return rawTexts.join('\n\n---\n\n');
}

// Поиск через Яндекс — лучший источник для СНГ/Казахстан/Россия
async function searchYandexRaw(queries, geo) {
  const geoLower = (geo || '').toLowerCase();
  const baseUrl = geoLower.includes('россия') ? 'https://yandex.ru/search/?text=' : 'https://yandex.kz/search/?text=';
  const rawTexts = [];
  for (const q of queries.slice(0, 2)) {
    const encoded = encodeURIComponent(q);
    const text = await searchViaReader(`${baseUrl}${encoded}&lr=159`);
    if (text && text.length > 300) rawTexts.push(text.substring(0, 3000));
  }
  return rawTexts.join('\n\n---\n\n');
}

// Поиск локальных бизнесов через 2GIS — лучший источник для офлайн/локальных конкурентов (4.4)
async function search2GIS(businessType, city) {
  const CITY_SLUGS = {
    'алматы': 'almaty', 'алма-ата': 'almaty',
    'астана': 'astana', 'нур-султан': 'astana', 'акмола': 'astana',
    'шымкент': 'shymkent', 'шимкент': 'shymkent',
    'актобе': 'aktobe', 'актюбинск': 'aktobe',
    'павлодар': 'pavlodar',
    'семей': 'semey', 'семипалатинск': 'semey',
    'усть-каменогорск': 'ust-kamenogorsk', 'оскемен': 'ust-kamenogorsk',
    'тараз': 'taraz', 'жамбыл': 'taraz',
    'атырау': 'atyrau', 'гурьев': 'atyrau',
    'кызылорда': 'kyzylorda',
    'актау': 'aktau',
    'москва': 'moscow',
    'санкт-петербург': 'saint-petersburg', 'питер': 'saint-petersburg',
    'новосибирск': 'novosibirsk',
    'екатеринбург': 'yekaterinburg',
    'краснодар': 'krasnodar',
    'казань': 'kazan',
    'бишкек': 'bishkek',
    'алматинская': 'almaty',
  };
  const cityLower = (city || 'алматы').toLowerCase().trim();
  const citySlug = CITY_SLUGS[cityLower] || cityLower.replace(/\s+/g, '-');
  const base = cityLower.includes('москва') || cityLower.includes('питер') || cityLower.includes('санкт') || cityLower.includes('новосибирск') || cityLower.includes('екатеринбург') || cityLower.includes('краснодар') || cityLower.includes('казань')
    ? 'https://2gis.ru' : 'https://2gis.kz';

  const results = [];
  const queries = [
    `${base}/${citySlug}/search/${encodeURIComponent(businessType)}`,
    `${base}/${citySlug}/search/${encodeURIComponent(businessType + ' ' + city)}`
  ];
  for (const url of queries.slice(0, 2)) {
    const text = await searchViaReader(url, 15000);
    if (text && text.length > 300) {
      results.push(text.substring(0, 4000));
      break; // достаточно одного удачного результата
    }
  }
  return results.join('\n\n');
}

// Поиск через Яндекс Карты — хорошо показывает локальные офлайн бизнесы (4.4)
async function searchYandexMaps(businessType, city) {
  const query = encodeURIComponent(`${businessType} ${city}`);
  const text = await searchViaReader(`https://yandex.kz/maps/?text=${query}&lang=ru_RU`, 15000);
  return text && text.length > 300 ? text.substring(0, 4000) : '';
}

// Поиск через Google
async function searchGoogle(queries) {
  const allUrls = [];
  for (const q of queries) {
    const encoded = encodeURIComponent(q);
    const text = await searchViaReader(`https://www.google.com/search?q=${encoded}&num=20&hl=ru`);
    if (text && text.length > 200) {
      const found = extractUrlsFromText(text);
      allUrls.push(...found);
    }
  }
  return allUrls;
}

// Jina Reader — scrapes any URL and returns clean text, free, no API key
function fetchJina(url) {
  return new Promise((resolve) => {
    try {
      const clean = url.trim().replace(/^https?:\/\//, '');
      const req = https.request({
        hostname: 'r.jina.ai', path: '/' + clean, method: 'GET',
        headers: { 'Accept': 'text/plain', 'X-Return-Format': 'text', 'User-Agent': 'Mozilla/5.0' }
      }, (res) => {
        let raw = '';
        res.on('data', c => raw += c);
        res.on('end', () => resolve(raw.substring(0, 1500)));
      });
      req.on('error', () => resolve(''));
      req.setTimeout(6000, () => { req.destroy(); resolve(''); });
      req.end();
    } catch(e) { resolve(''); }
  });
}

function getBaseUrl(url) {
  try { return new URL(url).origin; } catch(e) { return null; }
}

// Smart per-tab scraping: pricing pages for pricing tab, G2 for reputation, homepage for others
async function scrapeForTab(tab, urls, competitorNames) {
  const validUrls = (urls || []).filter(u => u && u.startsWith('http')).slice(0, 8);

  // PRICING TAB → scrape /pricing pages
  if (tab === 'pricing') {
    const pricingTargets = validUrls.map(u => {
      const base = getBaseUrl(u);
      return base ? base + '/pricing' : null;
    }).filter(Boolean);
    if (!pricingTargets.length) return '';
    const results = await Promise.all(pricingTargets.map(async (url) => {
      const text = await fetchJina(url);
      return text && text.length > 150 ? `--- ${url} ---\n${text}` : '';
    }));
    const combined = results.filter(Boolean).join('\n\n');
    return combined
      ? `\n\nРЕАЛЬНЫЕ СТРАНИЦЫ ЦЕНЫ КОНКУРЕНТОВ (используй конкретные цифры цен, тарифы, условия из этих данных):\n${combined}`
      : '';
  }

  // REPUTATION TAB → scrape G2 search for each competitor name
  if (tab === 'reputation') {
    const names = (competitorNames || []).slice(0, 3).filter(Boolean);
    if (!names.length) return '';
    const g2Urls = names.map(n => `https://www.g2.com/search?query=${encodeURIComponent(n)}`);
    const results = await Promise.all(g2Urls.map(async (url) => {
      const text = await fetchJina(url);
      return text && text.length > 150 ? `--- G2: ${url} ---\n${text}` : '';
    }));
    const combined = results.filter(Boolean).join('\n\n');
    return combined
      ? `\n\nРЕАЛЬНЫЕ ДАННЫЕ G2 О КОНКУРЕНТАХ (используй реальные рейтинги, количество отзывов и жалобы из этих данных):\n${combined}`
      : '';
  }

  // ALL OTHER TABS → scrape provided homepages as before
  if (!validUrls.length) return '';
  const results = await Promise.all(validUrls.map(async (url) => {
    const text = await fetchJina(url);
    return text ? `--- ${url} ---\n${text}` : '';
  }));
  const combined = results.filter(Boolean).join('\n\n');
  return combined ? `\n\nРЕАЛЬНЫЕ ДАННЫЕ С САЙТОВ КОНКУРЕНТОВ (используй их в анализе):\n${combined}` : '';
}

function httpPost(hostname, path, headers, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request({
      hostname, path, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), ...headers }
    }, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch (e) { reject(new Error('Parse error: ' + raw.substring(0, 200))); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// Единая функция вызова AI — поддерживает Anthropic, OpenAI, DeepSeek, Z.ai (6.1, 6.2, 6.3)
// provider: 'anthropic' | 'openai' | 'deepseek' | 'zai'
async function callAI(provider, apiKey, systemPrompt, userPrompt, maxTokens) {
  if (provider === 'anthropic') {
    const resp = await httpPost('api.anthropic.com', '/v1/messages',
      { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      { model: 'claude-haiku-4-5-20251001', max_tokens: maxTokens, system: systemPrompt, messages: [{ role: 'user', content: userPrompt }] }
    );
    if (resp.error) throw new Error('Anthropic: ' + (resp.error.message || JSON.stringify(resp.error)));
    if (!resp.content || !resp.content[0]) throw new Error('Anthropic empty response');
    return resp.content[0].text;
  }

  if (provider === 'deepseek') {
    const resp = await httpPost('api.deepseek.com', '/v1/chat/completions',
      { 'Authorization': `Bearer ${apiKey}` },
      { model: 'deepseek-chat', messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }], temperature: 0.3, max_tokens: maxTokens }
    );
    if (resp.error) throw new Error('DeepSeek: ' + resp.error.message);
    if (!resp.choices || !resp.choices[0]) throw new Error('DeepSeek empty response');
    return resp.choices[0].message.content;
  }

  if (provider === 'zai') {
    const resp = await httpPost('open.bigmodel.cn', '/api/paas/v4/chat/completions',
      { 'Authorization': `Bearer ${apiKey}` },
      { model: 'glm-4-flash', messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }], temperature: 0.3, max_tokens: maxTokens }
    );
    if (resp.error) throw new Error('Z.ai: ' + (resp.error.message || JSON.stringify(resp.error)));
    if (!resp.choices || !resp.choices[0]) throw new Error('Z.ai empty response');
    return resp.choices[0].message.content;
  }

  // openai (default)
  const resp = await httpPost('api.openai.com', '/v1/chat/completions',
    { 'Authorization': `Bearer ${apiKey}` },
    { model: 'gpt-4o-mini', messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }], temperature: 0.4, max_tokens: maxTokens, response_format: { type: 'json_object' } }
  );
  if (resp.error) throw new Error('OpenAI: ' + resp.error.message);
  if (!resp.choices || !resp.choices[0]) throw new Error('OpenAI empty response');
  return resp.choices[0].message.content;
}

// Роутинг по задачам: discover → zai, простые табы → deepseek, аналитика → anthropic (6.4)
const COMPLEX_TABS = new Set(['strategy', 'swot', 'quickwins', 'gaps']);

function getProviders() {
  return {
    discover:  { provider: 'zai',       key: process.env.ZAI_API_KEY },
    simple:    { provider: 'deepseek',  key: process.env.DEEPSEEK_API_KEY },
    complex:   { provider: 'anthropic', key: process.env.ANTHROPIC_API_KEY },
  };
}

// Вызов с fallback цепочкой (6.5): если провайдер упал или вернул невалидный JSON → следующий
async function callAIWithFallback(role, systemPrompt, userPrompt, maxTokens) {
  const p = getProviders();

  // Цепочки fallback для каждой роли
  const openaiKey = process.env.OPENAI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  const chains = {
    discover: [
      p.discover,
      p.simple,
      { provider: 'anthropic', key: anthropicKey },
      { provider: 'openai',    key: openaiKey }
    ],
    simple: [
      p.simple,
      { provider: 'anthropic', key: anthropicKey },
      { provider: 'openai',    key: openaiKey }
    ],
    complex: [
      p.complex,
      p.simple,
      { provider: 'openai', key: openaiKey }
    ]
  };

  const chain = chains[role] || chains.simple;

  for (const { provider, key } of chain) {
    if (!key) continue; // ключ не задан — пропускаем
    try {
      const raw = await callAI(provider, key, systemPrompt, userPrompt, maxTokens);
      // Валидируем что вернулся JSON (для tabов и discover)
      const match = raw.match(/[\[{][\s\S]*[\]}]/);
      if (!match) throw new Error(`${provider}: не найден JSON в ответе`);
      return JSON.parse(match[0]);
    } catch(e) {
      console.warn(`callAI fallback: ${provider} failed — ${e.message}`);
      // продолжаем к следующему в цепочке
    }
  }
  throw new Error('Все провайдеры недоступны');
}

const TAB_SCHEMAS = {
  market: `{"market":{"headers":["Компания","Доля рынка","Рост/год","Позиция","Тренд"],"rows":[["Н1","X%","X%","Лидер","↑"],["Н2","X%","X%","Претендент","→"],["Н3","X%","X%","Быстрорастущий","↑"],["Н4","X%","X%","Зрелый","↓"],["Н5","X%","X%","Нишевый","→"],["Н6","X%","X%","Нишевый","↑"],["Н7","X%","X%","Нишевый","→"],["Н8","X%","X%","Нишевый","↑"]],"summary":["конкретный вывод1","конкретный вывод2","конкретный вывод3"],"bestCompany":"Н","bestAdvice":"конкретный совет что делать с учётом анализа"},"competitors":["Н1","Н2","Н3","Н4","Н5","Н6","Н7","Н8"]}`,
  audience: `{"audience":{"headers":["Компания","Сегмент","Роли","Боль","Зрелость"],"rows":[["Н1","сег","роли","боль","ур"],["Н2","сег","роли","боль","ур"],["Н3","сег","роли","боль","ур"],["Н4","сег","роли","боль","ур"],["Н5","сег","роли","боль","ур"]],"summary":["в1","в2","в3"],"bestCompany":"Н","bestAdvice":"совет"}}`,
  pricing: `{"pricing":{"headers":["Компания","Модель","Старт цена","Бесплатно","Пробный период","Годовая скидка"],"rows":[["Н1","За пользователя","$X/мес","✅","14д","-20%"],["Н2","За пользователя","$X/мес","❌","7д","-18%"],["Н3","Бесплатный план","$X/мес","✅","—","-20%"],["Н4","За пользователя","$X/мес","❌","—","нет"],["Н5","Бесплатный план","$X/мес","✅","—","-45%"]],"summary":["конкретный вывод1","конкретный вывод2","конкретный вывод3"],"bestCompany":"Н","bestAdvice":"совет","chart":[{"name":"Н1","url":"https://competitor1.com","start":10.99,"color":"#60a5fa"},{"name":"Н2","url":"https://competitor2.com","start":9,"color":"#a78bfa"},{"name":"Н3","url":"https://competitor3.com","start":8,"color":"#34d399"},{"name":"Н4","url":"https://competitor4.com","start":5,"color":"#f87171"},{"name":"Н5","url":"https://competitor5.com","start":7,"color":"#fbbf24"}],"recommendation":{"model":"Бесплатный план + Платный / За пользователя / Фиксированная и т.д. на русском","freeLimit":"X проектов, Y пользователей","startPrice":"$X/мес","annualDiscount":"-30%","why":"Конкретное объяснение: почему эта модель лучшая для данного рынка и чем выигрывает у конкурентов"}}}`,
  channels: `{"channels":{"headers":["Компания","Модель роста","Поиск","Реклама","Соцсети","Email"],"rows":[["Н1","Через продукт","40%","30%","20%","10%"],["Н2","Через продажи","30%","40%","20%","10%"],["Н3","Через маркетинг","50%","20%","20%","10%"],["Н4","Продукт+Маркетинг","35%","35%","20%","10%"],["Н5","Через продажи","25%","45%","20%","10%"]],"summary":["в1","в2","в3"],"bestCompany":"Н","bestAdvice":"совет"}}`,
  product: `{"product":{"headers":["Компания","Функции","ИИ","Интеграции","Мобильное","Удержание клиентов"],"rows":[["Н1","функции","✅","100+","✅","🟢 Высокий"],["Н2","функции","❌","50+","✅","🟡 Средний"],["Н3","функции","✅","200+","❌","🔴 Низкий"],["Н4","функции","⚠️","80+","✅","🟢 Высокий"],["Н5","функции","✅","150+","❌","🟡 Средний"]],"summary":["в1","в2","в3"],"bestCompany":"Н","bestAdvice":"совет"}}`,
  reputation: `{"reputation":{"headers":["Компания","Рейтинг G2","Отзывов","Главная жалоба","Поддержка","Медийность"],"rows":[["Н1","4.5/5","5K","жалоба","4.3/5","🟢"],["Н2","4.2/5","3K","жалоба","4.0/5","🟡"],["Н3","4.7/5","8K","жалоба","4.5/5","🟢"],["Н4","3.9/5","2K","жалоба","3.8/5","🔴"],["Н5","4.4/5","6K","жалоба","4.2/5","🟡"]],"summary":["в1","в2","в3"],"bestCompany":"Н","bestAdvice":"совет"}}`,
  offers: `{"offers":{"headers":["Компания","Лид-магнит","Главный оффер","Программа лояльности","Уникальность"],"rows":[["Н1","оффер","скидка","программа","🔥 Высокая"],["Н2","оффер","скидка","программа","⚡ Средняя"],["Н3","оффер","скидка","программа","🔥 Высокая"],["Н4","оффер","скидка","программа","💤 Слабая"],["Н5","оффер","скидка","программа","⚡ Средняя"]],"summary":["в1","в2","в3"],"bestCompany":"Н","bestAdvice":"совет"}}`,
  strategy: `{"strategy":{"q1":{"goal":"цель","actions":[{"title":"действие","detail":"детали"},{"title":"действие","detail":"детали"}],"metrics":"метрики"},"q2":{"goal":"цель","actions":[{"title":"действие","detail":"детали"},{"title":"действие","detail":"детали"}],"metrics":"метрики"},"q3":{"goal":"цель","actions":[{"title":"действие","detail":"детали"},{"title":"действие","detail":"детали"}],"metrics":"метрики"},"q4":{"goal":"цель","actions":[{"title":"действие","detail":"детали"},{"title":"действие","detail":"детали"}],"metrics":"метрики"},"criticalRec":"главное","importantRec":"второе","productIdeas":[{"name":"Название продукта или функции","problem":"Какую проблему решает и кому","missingAt":"У кого из конкурентов этого нет","demand":"🔥 Высокий","effort":"Низкая"},{"name":"Название продукта или функции","problem":"Какую проблему решает и кому","missingAt":"У кого из конкурентов этого нет","demand":"⚡ Средний","effort":"Средняя"},{"name":"Название продукта или функции","problem":"Какую проблему решает и кому","missingAt":"У кого из конкурентов этого нет","demand":"🔥 Высокий","effort":"Высокая"}]}}`,
  swot: `{"swot":{"strengths":["сильная сторона 1","сильная сторона 2","сильная сторона 3","сильная сторона 4"],"weaknesses":["слабость 1","слабость 2","слабость 3","слабость 4"],"opportunities":["возможность 1","возможность 2","возможность 3","возможность 4"],"threats":["угроза 1","угроза 2","угроза 3","угроза 4"]}}`,
  positioning: `{"positioning":{"xLabel":"Простота","xLabelEnd":"Сложность","yLabel":"Малый бизнес","yLabelEnd":"Крупный бизнес","competitors":[{"name":"Н1","url":"https://competitor1.com","x":50,"y":60,"color":"#60a5fa"},{"name":"Н2","url":"https://competitor2.com","x":70,"y":75,"color":"#a78bfa"},{"name":"Н3","url":"https://competitor3.com","x":35,"y":30,"color":"#34d399"},{"name":"Н4","url":"https://competitor4.com","x":20,"y":25,"color":"#f87171"},{"name":"Н5","url":"https://competitor5.com","x":80,"y":55,"color":"#fbbf24"},{"name":"НашПродукт","x":40,"y":35,"color":"#d4a843","isClient":true}],"insight":"Текст инсайта: какая ниша свободна и почему это точка входа"}}`,
  pricingtiers: `{"pricingtiers":[{"company":"Н1","plans":[{"name":"Пакет 1","price":"X₸/мес","items":["что входит 1","что входит 2","что входит 3"]},{"name":"Пакет 2","price":"X₸/мес","items":["что входит 1","что входит 2","что входит 3"]}]},{"company":"Н2","plans":[{"name":"Пакет 1","price":"X₸/мес","items":["что входит 1","что входит 2","что входит 3"]},{"name":"Пакет 2","price":"X₸/мес","items":["что входит 1","что входит 2","что входит 3"]}]},{"company":"Н3","plans":[{"name":"Пакет 1","price":"X₸/мес","items":["что входит 1","что входит 2","что входит 3"]},{"name":"Пакет 2","price":"X₸/мес","items":["что входит 1","что входит 2","что входит 3"]}]},{"company":"Н4","plans":[{"name":"Пакет 1","price":"X₸/мес","items":["что входит 1","что входит 2","что входит 3"]},{"name":"Пакет 2","price":"X₸/мес","items":["что входит 1","что входит 2","что входит 3"]}]},{"company":"Н5","plans":[{"name":"Пакет 1","price":"X₸/мес","items":["что входит 1","что входит 2","что входит 3"]},{"name":"Пакет 2","price":"X₸/мес","items":["что входит 1","что входит 2","что входит 3"]}]}]}`,
  quickwins: `{"quickwins":[{"day":"День 1–2","title":"Название действия","action":"Конкретное описание что делать","effort":"Низкие","impact":"Высокий","why":"Почему это сработает"},{"day":"День 3–4","title":"Название действия","action":"Конкретное описание что делать","effort":"Низкие","impact":"Высокий","why":"Почему это сработает"},{"day":"День 5–7","title":"Название действия","action":"Конкретное описание что делать","effort":"Средние","impact":"Очень высокий","why":"Почему это сработает"}]}`,
  gaps: `{"gaps":[{"emoji":"💰","title":"Название пробела рынка","description":"Детальное описание пробела: что не делают конкуренты и почему это проблема","opportunity":"🔥 Очень высокая","who":"Целевой сегмент"},{"emoji":"🤖","title":"Название пробела рынка","description":"Детальное описание пробела с конкретными данными","opportunity":"🔥 Очень высокая","who":"Целевой сегмент"},{"emoji":"🌍","title":"Название пробела рынка","description":"Детальное описание пробела","opportunity":"⚡ Высокая","who":"Целевой сегмент"},{"emoji":"🎯","title":"Название пробела рынка","description":"Детальное описание пробела","opportunity":"⚡ Высокая","who":"Целевой сегмент"}]}`
};

async function fetchTab(tab, area, segment, product, description, geo, competitors, price, urls, analysisContext, searchContext, margoContext) {
  const compLine = competitors && competitors.length
    ? `Конкуренты: ${competitors.join(', ')}\n`
    : '';

  const scrapedContext = await scrapeForTab(tab, urls, competitors);

  const quickwinsExtra = tab === 'quickwins' ? `
ВАЖНО для quickwins: давай только конкретные действия которые основатель делает сам за 1-2 дня.
НЕ ДАВАЙ задачи на исследование: "изучить рынок", "провести анализ", "использовать SimilarWeb" — анализ уже сделан.
ДАВАЙ готовые шаги: создать страницу, написать письма конкретным людям, запустить оффер, опубликовать пост.
Поле "action": простым языком как другу — что именно открыть, написать, запустить. Пример: "Создай страницу /vs/[конкурент] с честной таблицей сравнения по цене и функциям — люди которые ищут замену [конкуренту] сами на неё придут".
Поле "why": одна конкретная цифра или факт почему это работает именно для этого продукта и ниши.` : '';

  const strategyExtra = (tab === 'strategy' || tab === 'quickwins') && analysisContext ? `
ДАННЫЕ ИЗ АНАЛИЗА КОНКУРЕНТОВ (используй их как основу — не выдумывай, опирайся на эти факты):
${analysisContext}` : '';

  const strategyRules = tab === 'strategy' ? `
ВАЖНО для strategy: давай конкретные действия, не абстрактные ("улучшение продукта", "агрессивный маркетинг" — не подходят).
Поле "goal" каждого квартала — измеримая цель с числом (например "50 платящих клиентов", "выручка $10K/мес").
Поле "detail" каждого действия — конкретно что делать: какую страницу создать, кому написать, что запустить.
Поле "criticalRec" — одно самое важное действие прямо сейчас, конкретное и срочное.
Поле "importantRec" — второй по важности шаг.
Поле "productIdeas" — ровно 3 конкретных идеи продуктов или функций которых НЕТ ни у одного конкурента, основанных на реальных пробелах рынка из анализа. Поле "name" — конкретное название. Поле "problem" — кому нужно и какую боль закрывает. Поле "missingAt" — перечисли 2-3 конкурентов у которых этого нет. Поле "demand" — только 🔥 Высокий / ⚡ Средний. Поле "effort" — только Низкая / Средняя / Высокая.` : '';

  const tabInstructions = {
    market: `Покажи реальную картину рынка: кто лидер, кто растёт быстро, какие тренды. Доля рынка и темп роста — реалистичные оценки на основе открытых данных. summary — конкретные выводы что это значит для продукта ${product}.`,
    positioning: `Расставь конкурентов на карте честно: кто реально простой vs сложный, кто для малого vs крупного бизнеса. insight — конкретно какая ниша свободна и почему именно там стоит занять позицию ${product}.`,
    swot: `SWOT именно для ${product} на фоне этих конкурентов. Strengths/Weaknesses — честная оценка продукта, не общие слова. Opportunities/Threats — конкретные рыночные факторы прямо сейчас.`,
    audience: `Опиши реальные сегменты аудитории у каждого конкурента: кто покупает, какие роли принимают решение, какую боль закрывает продукт. summary — какой сегмент недоохвачен конкурентами.`,
    pricing: `Используй реальные данные о ценах если они есть в скрапинге. Модели: per seat, usage-based, flat fee, freemium. summary — конкретный вывод как ${product} должен ценообразоваться чтобы выиграть.`,
    pricingtiers: `СТРОГО соблюдай формат: каждый объект содержит ТОЛЬКО поля "company" (строка) и "plans" (массив). НЕТ других полей! plans — массив из 2-3 объектов с полями "name", "price", "items". Пример одного объекта: {"company":"Simbios","plans":[{"name":"Старт","price":"150 000 ₸","items":["Настройка CRM","Обучение 3ч","Поддержка 1 мес"]},{"name":"Под ключ","price":"400 000 ₸","items":["Полное внедрение","Обучение команды","Поддержка 6 мес"]}]}. Интегратор → пакеты внедрения в ₸. SaaS → планы подписки в ₸/мес. Для ВСЕХ 5 конкурентов.`,
    channels: `Опиши реальные каналы привлечения каждого конкурента на основе их публичной активности. Проценты — оценочные но реалистичные. summary — какой канал конкуренты недоиспользуют.`,
    product: `Сравни функциональность честно: что реально есть у каждого. AI — есть ли реальные AI-фичи, не маркетинг. Барьер переключения — насколько сложно уйти от продукта. summary — где у ${product} есть шанс выиграть.`,
    reputation: `Используй данные G2/Capterra если они есть в скрапинге. Жалобы — конкретные паттерны из отзывов (UX, поддержка, цена, баги). summary — какую жалобу конкурентов может решить ${product}.`,
    offers: `Опиши реальные офферы: что дают бесплатно для привлечения, какие скидки, программы лояльности. summary — какой оффер сработает лучше всего для ${product}.`,
    strategy: `Стратегия должна строиться на реальных слабостях конкурентов из анализа. Каждое действие — конкретный шаг который можно сделать, не абстрактное направление.`,
    quickwins: `Действия только те, что реально можно сделать за 1-2 дня самостоятельно. Основаны на реальных пробелах конкурентов. why — конкретный факт почему это сработает именно здесь.`,
    gaps: `Пробелы — реальные незакрытые потребности рынка которые НЕТ ни у одного из конкурентов. Не общие идеи, а конкретные незанятые ниши с описанием почему конкуренты их игнорируют.`
  };

  const tabHint = tabInstructions[tab] || '';

  // Если есть реальные скрапированные данные — строго запрещаем выдумывать компании
  const hasRealData = scrapedContext && scrapedContext.length > 100;
  const realDataRule = hasRealData
    ? `КРИТИЧНО: У тебя есть реальные данные с сайтов конкурентов (см. ниже).
- ИСПОЛЬЗУЙ ТОЛЬКО компании из этих данных — их реальные названия, услуги, позиционирование.
- НЕ ВЫДУМЫВАЙ других компаний которых нет в данных.
- Покажи ВСЕ компании из данных — может быть 5, 6, 7, 8 строк, сколько реально найдено.
- ИСКЛЮЧИ из таблицы сам продукт клиента "${product}" — он не конкурент себе.
- Используй реальные названия из данных, не переименовывай их.`
    : `- Замени Н1–Н5 на реальные названия компаний-конкурентов в сфере "${area}". НашПродукт → "${product}".
- Анализируй конкурентов из ВСЕХ указанных регионов — не только из первого. Покажи микс компаний из разных рынков.
- Если в указанных регионах нет сильных локальных конкурентов — показывай глобальных игроков которые присутствуют на этих рынках. В поле summary обязательно отметь: "Локальный рынок [регион] не заполнен — это прямая возможность для входа."`;

  // Данные из Margo — реальные UVP, отзывы, реклама (приоритетный источник)
  const MARGO_TABS = ['reputation','offers','channels','market','gaps','swot','strategy','quickwins'];
  const margoSection = margoContext && margoContext.length > 50 && MARGO_TABS.includes(tab)
    ? `\n\nДАННЫЕ ИЗ МАРГО-РАЗВЕДКИ (реальные данные собранные о конкурентах — используй как приоритетный источник, они важнее догадок):\n${margoContext}`
    : '';

  const prompt = `Ты — ведущий аналитик конкурентной разведки. Продукт: ${product} | Сфера: ${area} | Сегмент: ${segment} | География: ${geo} | Цена: ${price}
Описание: ${description}
${compLine}
ЗАДАЧА: Заполни JSON для раздела "${tab}" реальными аналитическими данными.
${tabHint}
ПРАВИЛА:
${realDataRule}
- Никаких "Конкурент 1", "Компания А" и других заглушек — только реальные бренды.
- Максимум 5-7 слов в ячейке таблицы.
- summary — конкретные выводы с именами компаний и цифрами, не общие фразы.
- bestAdvice — одно конкретное действие для ${product} прямо сейчас.
${strategyExtra}${quickwinsExtra}${strategyRules}${scrapedContext}${margoSection}${searchContext && tab === 'market' ? `\n\nРЕАЛЬНЫЕ РЕЗУЛЬТАТЫ ПОИСКА (используй только компании из этого текста, не выдумывай других):\n${searchContext}` : ''}
Шаблон: ${TAB_SCHEMAS[tab]}`;

  const maxTokens = tab === 'pricing' ? (scrapedContext ? 1600 : 1100) : (scrapedContext ? 1400 : 900);
  const systemPrompt = 'Ты — ведущий аналитик конкурентной разведки с 15 годами опыта. Верни ТОЛЬКО валидный JSON без markdown, без комментариев, без обёртки. Используй реальные данные о компаниях, конкретные цифры и факты. Никаких заглушек — только реальные бренды и реальные данные.';

  // Роутинг: аналитические табы → Haiku (качество), простые → DeepSeek (дёшево) (6.4)
  const role = COMPLEX_TABS.has(tab) ? 'complex' : 'simple';
  return callAIWithFallback(role, systemPrompt, prompt, maxTokens);
}

// Vercel serverless function format
module.exports = async (req, res) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400'
  };
  Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method Not Allowed' }); return; }

  try {
    if (!req.body) {
      res.status(400).json({ error: 'Пустой запрос — тело не получено' });
      return;
    }
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { area, segment, product, description, geography, competitors, competitorUrls, price, tab, competitorNames, analysisContext, searchContext, margoContext } = body;

    // Проверяем наличие хотя бы одного ключа (6.7)
    const hasAnyKey = process.env.ZAI_API_KEY || process.env.DEEPSEEK_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY;
    if (!hasAnyKey) {
      res.status(500).json({ error: 'Сервис временно недоступен. Обратитесь к администратору.' });
      return;
    }

    const GEO_EXPAND = {
      'казахстан': 'Казахстан',
      'снг': 'СНГ (Россия, Казахстан, Беларусь, Украина, Узбекистан, Азербайджан, Армения, Молдова, Таджикистан, Кыргызстан)',
      'европа': 'Европа (Германия, Великобритания, Франция, Нидерланды, Польша, Испания, Швеция, Италия, Латвия, Литва, Эстония)',
      'сша': 'США и Канада',
      'ближний восток': 'Ближний Восток (ОАЭ, Саудовская Аравия, Катар, Кувейт, Бахрейн, Оман, Израиль)',
      'индия': 'Индия',
      'китай': 'Китай',
      'азия': 'Азия (Япония, Южная Корея, Вьетнам, Индонезия, Таиланд, Сингапур, Малайзия)',
      'глобально': 'США, Европа, СНГ, Индия, Юго-Восточная Азия, Ближний Восток',
    };
    const geoArr = Array.isArray(geography) ? geography : (geography ? [geography] : ['глобально']);
    const geoExpanded = geoArr.map(g => GEO_EXPAND[g.toLowerCase()] || g).join(' | ');
    const geo = geoExpanded;
    const targetTab = tab || 'market';
    const knownCompetitors = competitorNames || (competitors ? [competitors] : []);
    const urlList = Array.isArray(competitorUrls)
      ? competitorUrls
      : (typeof competitorUrls === 'string' ? competitorUrls.split(/[\n,]+/).map(u => u.trim()).filter(Boolean) : []);

    // DISCOVER MODE: реальный поиск конкурентов через Yandex/Google + Brave
    if (targetTab === 'discover') {
      const geoStr = geoArr[0] || 'Казахстан';
      const useCis = isCisGeo(geoArr);

      // Шаг 1: Строим точные поисковые запросы
      const stopWords = new Set(['это','для','что','как','или','при','где','которые','также','своих','своей','через','после','перед','между']);
      const descKeywords = (description || '').split(/\s+/)
        .filter(w => w.length > 4 && !stopWords.has(w.toLowerCase()))
        .slice(0, 5).join(' ');

      // Для CIS-поиска: более короткие запросы дают лучшие результаты с реальными сайтами
      const areaShort = area.split(' ').slice(0, 2).join(' '); // "Абилитационный центр" (без доп. слов)
      const queries = useCis ? [
        `${areaShort} ${geoStr}`,                                                    // Короткий + гео
        `${area} ${geoStr}`,                                                         // Полный + гео
        `${areaShort} Алматы Астана`,                                                // Короткий + города
        descKeywords ? `${descKeywords} ${geoStr}` : `${area} услуги ${geoStr}`,    // Ключевые слова
        `топ ${areaShort} ${geoStr}`,                                                // Топ-списки (1.9)
        `лучшие ${areaShort} компании ${geoStr}`                                     // Рейтинги (1.9)
      ] : [
        `${area} ${geoStr}`,
        `${area} ${segment || ''} ${geoStr}`.trim(),
        descKeywords ? `${descKeywords} ${geoStr}` : `${area} platform ${geoStr}`,
        `top ${area} companies ${geoStr}`,                                           // Топ для глобального (1.9)
        `best ${area} ${geoStr}`                                                     // Лучшие для глобального (1.9)
      ];

      // Шаг 2: Параллельный поиск — получаем сырой текст из всех источников
      let rawSearchText = '';
      if (useCis) {
        // DDG + Яндекс + Google + Brave — все параллельно для максимального охвата
        const [ddgRaw, yandexRaw, googleUrls, braveR1, braveR2] = await Promise.all([
          searchDDGRaw(queries.slice(0, 4), geoStr),                                 // +1 запрос (1.9)
          searchYandexRaw([queries[0], queries[4]].filter(Boolean), geoStr),         // топ-запрос (1.9)
          searchGoogle(queries.slice(0, 2)),
          searchJina(queries[0]),
          searchJina(queries[2] || queries[1] || queries[0])
        ]);
        const braveText = [...braveR1, ...braveR2].map(r => `${r.url} — ${r.title} — ${r.description}`).join('\n');
        const googleText = googleUrls.map(r => `${r.url} — ${r.title}`).join('\n');
        rawSearchText = [ddgRaw, yandexRaw, googleText, braveText].filter(Boolean).join('\n\n---\n\n');
      } else {
        // Для глобальных рынков: Google + Brave + Яндекс (СНГ аналоги) + топ-запросы
        const cisQuery = `${areaShort} СНГ Казахстан аналог`;
        const [googleUrls, googleTop, braveR1, braveR2, yandexRaw] = await Promise.all([
          searchGoogle(queries.slice(0, 2)),
          searchGoogle([queries[3], queries[4]].filter(Boolean)),
          searchJina(queries[0]),
          searchJina(queries[1] || queries[0]),
          searchYandexRaw([cisQuery, `${areaShort} Казахстан`], 'Казахстан')        // СНГ/KZ аналоги
        ]);
        const braveText = [...braveR1, ...braveR2].map(r => `${r.url} — ${r.title} — ${r.description}`).join('\n');
        const googleText = [...googleUrls, ...googleTop].map(r => `${r.url} — ${r.title}`).join('\n');
        rawSearchText = [googleText, braveText, yandexRaw].filter(Boolean).join('\n\n---\n\n');
      }

      // Шаг 3: AI извлекает и фильтрует конкурентов из всего найденного текста
      let candidates = [];
      if (rawSearchText.length > 100) {
        const filterPrompt = `Продукт клиента: "${product}"
Ниша: "${area}"
Описание: "${description}"
Регион: "${geoStr}"

Ниже — сырой текст поисковых результатов (DDG, Яндекс, Google, Brave).
Найди в этом тексте РЕАЛЬНЫЕ сайты компаний — прямых конкурентов клиента в нише "${area}" в регионе "${geoStr}".

ПРАВИЛА:
- Используй ТОЛЬКО URL которые реально есть в тексте ниже. Не придумывай URL.
- ИСКЛЮЧИ: новостные, форумы, агрегаторы, Wikipedia, госорганы, поисковики, сайт клиента ("${product}"), нерелевантные ниши.
- Для названия — используй заголовок рядом с URL в тексте.
- Верни КАК МОЖНО БОЛЬШЕ реальных конкурентов — до 15 штук.
- Если прямых конкурентов < 3 — верни сколько нашёл. Если 0 — верни [].

ТЕКСТ ПОИСКА:
${rawSearchText.substring(0, 8000)}

Верни ТОЛЬКО JSON массив:
[{"name":"Название из текста","url":"https://домен-из-текста.kz","why":"чем занимается, 8-10 слов"}]`;

        try {
          const sysPrompt = 'Ты извлекаешь URL компаний из текста поисковых результатов. Верни ТОЛЬКО JSON массив без markdown. Не придумывай URL — только те что реально есть в тексте. Возвращай максимально возможное количество реальных конкурентов.';
          // Z.ai (бесплатно) → DeepSeek → Haiku (6.4, 6.8)
          const parsed = await callAIWithFallback('discover', sysPrompt, filterPrompt, 1500);
          const SKIP_DOMAINS = ['vk.com','instagram','facebook','youtube','telegram','t.me',
            'wikipedia','avito','hh.ru','gosuslugi','gov.kz','egov.kz','pomogi.kz','inbusiness.kz',
            'el.kz','qazaqstanhalqyna.kz','medelement.com','smart.allart.kz','fnn.kz','allart.kz'];

          // Нормализация URL + фильтр SKIP_DOMAINS
          const normalized = Array.isArray(parsed) ? parsed
            .filter(c => c && c.url)
            .map(c => {
              let url = c.url.trim();
              if (!url.startsWith('http')) url = 'https://' + url;
              try { const u = new URL(url); url = u.origin; } catch(e) {}
              return { ...c, url };
            })
            .filter(c => !SKIP_DOMAINS.some(s => c.url.includes(s)))
            : [];

          // Дедупликация по домену — убираем одинаковые сайты из разных источников (1.8)
          const seenDomains = new Set();
          candidates = normalized.filter(c => {
            try {
              const domain = new URL(c.url).hostname.replace('www.', '');
              if (seenDomains.has(domain)) return false;
              seenDomains.add(domain);
              return true;
            } catch(e) { return false; }
          });

        } catch(e) { candidates = []; }
      }

      // Шаг 4: Пре-скрап — проверяем живые сайты и обогащаем описания реальным контентом (1.6 + 1.7)
      if (candidates.length > 0) {
        const scrapeResults = await Promise.all(
          candidates.slice(0, 12).map(async (c) => {
            const content = await fetchJina(c.url);
            if (!content || content.length < 30) return null; // сайт мёртвый или недоступен (1.7)
            // Берём первые 300 символов — там обычно название, описание компании (1.6)
            const preview = content.replace(/\s+/g, ' ').trim().substring(0, 300);
            return { ...c, preview };
          })
        );
        candidates = scrapeResults.filter(Boolean); // убираем null (недоступные сайты)
      }

      const finalCandidates = candidates.slice(0, 15);

      // Сохраняем анализ в Supabase (5.3) — await чтобы Vercel не убил запрос до завершения
      const clientKey = body.clientKey || null;
      if (clientKey) {
        try {
          await saveAnalysis({ clientKey, area, product, segment, description, geography: geoArr, price, competitors: finalCandidates });
        } catch(e) {
          console.warn('Supabase save error:', e.message);
        }
      }

      res.status(200).json({
        competitors: finalCandidates,
        searchUsed: rawSearchText.length > 100,
        searchContext: '',
        debug: { rawLen: rawSearchText.length, engine: useCis ? 'ddg+yandex+google+brave' : 'google+brave', useCis }
      });
      return;
    }

    // DISCOVER-LOCAL MODE: поиск офлайн конкурентов через 2GIS + Яндекс Карты (задача 4.4)
    if (targetTab === 'discover-local') {
      const city = geoArr[0] || 'Алматы';

      // Параллельный поиск: 2GIS + Яндекс Карты + DDG с городом
      const [twoGisRaw, yandexMapsRaw, ddgRaw, yandexSearchRaw] = await Promise.all([
        search2GIS(area, city),
        searchYandexMaps(area, city),
        searchDDGRaw([
          `${area} ${city}`,
          `${area} ${city} адрес телефон`
        ], city),
        searchYandexRaw([`${area} ${city}`, `топ ${area} ${city}`], city)
      ]);

      const rawText = [twoGisRaw, yandexMapsRaw, yandexSearchRaw, ddgRaw].filter(Boolean).join('\n\n---\n\n');

      let candidates = [];
      if (rawText.length > 100) {
        const localPrompt = `Продукт клиента: "${product}"
Тип бизнеса: "${area}"
Город: "${city}"

Ниже — сырой текст из 2GIS, Яндекс Карт и поисковых систем.
Найди в тексте реальные компании — офлайн конкурентов в нише "${area}" в городе "${city}".

ПРАВИЛА:
- ТОЛЬКО реальные компании которые есть в тексте. Не выдумывай.
- ИСКЛЮЧИ: сам 2GIS как сайт, агрегаторы, справочники, госорганы, нерелевантные ниши.
- Ищи: названия организаций, адреса рядом с ними, рейтинги (формат "4.8 ★" или "4.5 из 5"), количество отзывов.
- Если нашёл адрес рядом с названием — добавь его. Если нет — оставь пустую строку.
- Верни до 12 конкурентов.

ТЕКСТ:
${rawText.substring(0, 8000)}

Верни ТОЛЬКО JSON массив:
[{"name":"Название организации","address":"ул. Пример, 123 или пустая строка","phone":"+7 xxx xxx xx xx или пустая строка","rating":4.8,"reviews":50,"why":"краткое описание 8-10 слов"}]`;

        try {
          const sysPrompt = 'Ты извлекаешь данные о локальных бизнесах из текста 2GIS и Яндекс Карт. Верни ТОЛЬКО JSON массив без markdown. Только реальные организации из текста.';
          // Z.ai (бесплатно) → DeepSeek → Haiku (6.8)
          const parsed = await callAIWithFallback('discover', sysPrompt, localPrompt, 2000);
          candidates = Array.isArray(parsed) ? parsed.filter(c => c && c.name) : [];

        } catch(e) { candidates = []; }
      }

      // Пре-скрап Яндекс/2GIS ссылок или просто валидация — добавляем preview
      // Для локальных бизнесов preview берём из поля why (у них нет сайта)
      candidates = candidates.map(c => ({
        ...c,
        rating: typeof c.rating === 'number' ? c.rating : parseFloat(c.rating) || null,
        reviews: typeof c.reviews === 'number' ? c.reviews : parseInt(c.reviews) || null,
        preview: c.why || ''
      }));

      res.status(200).json({
        competitors: candidates.slice(0, 12),
        searchUsed: rawText.length > 100,
        searchContext: '',
        debug: { rawLen: rawText.length, engine: '2gis+yandex-maps+yandex+ddg', city }
      });
      return;
    }

    const data = await fetchTab(targetTab, area, segment, product, description, geo, knownCompetitors, price, urlList, analysisContext, searchContext, margoContext);
    res.status(200).json(data);

  } catch (error) {
    console.error('analyze error:', error.message, error.stack);
    res.status(500).json({ error: error.message, stack: error.stack ? error.stack.split('\n')[0] : '' });
  }
};
