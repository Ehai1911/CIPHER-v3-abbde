const https = require('https');

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
  const validUrls = (urls || []).filter(u => u && u.startsWith('http')).slice(0, 3);

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

const TAB_SCHEMAS = {
  market: `{"market":{"headers":["Компания","Доля рынка","Рост/год","Позиция","Тренд"],"rows":[["Н1","X%","X%","Лидер","↑"],["Н2","X%","X%","Претендент","→"],["Н3","X%","X%","Быстрорастущий","↑"],["Н4","X%","X%","Зрелый","↓"],["Н5","X%","X%","Нишевый","→"]],"summary":["конкретный вывод1","конкретный вывод2","конкретный вывод3"],"bestCompany":"Н","bestAdvice":"конкретный совет что делать с учётом анализа"},"competitors":["Н1","Н2","Н3","Н4","Н5"]}`,
  audience: `{"audience":{"headers":["Компания","Сегмент","Роли","Боль","Зрелость"],"rows":[["Н1","сег","роли","боль","ур"],["Н2","сег","роли","боль","ур"],["Н3","сег","роли","боль","ур"],["Н4","сег","роли","боль","ур"],["Н5","сег","роли","боль","ур"]],"summary":["в1","в2","в3"],"bestCompany":"Н","bestAdvice":"совет"}}`,
  pricing: `{"pricing":{"headers":["Компания","Модель","Старт цена","Бесплатно","Пробный период","Годовая скидка"],"rows":[["Н1","За пользователя","$X/мес","✅","14д","-20%"],["Н2","За пользователя","$X/мес","❌","7д","-18%"],["Н3","Бесплатный план","$X/мес","✅","—","-20%"],["Н4","За пользователя","$X/мес","❌","—","нет"],["Н5","Бесплатный план","$X/мес","✅","—","-45%"]],"summary":["конкретный вывод1","конкретный вывод2","конкретный вывод3"],"bestCompany":"Н","bestAdvice":"совет","chart":[{"name":"Н1","url":"https://competitor1.com","start":10.99,"color":"#60a5fa"},{"name":"Н2","url":"https://competitor2.com","start":9,"color":"#a78bfa"},{"name":"Н3","url":"https://competitor3.com","start":8,"color":"#34d399"},{"name":"Н4","url":"https://competitor4.com","start":5,"color":"#f87171"},{"name":"Н5","url":"https://competitor5.com","start":7,"color":"#fbbf24"}],"recommendation":{"model":"Бесплатный план + Платный / За пользователя / Фиксированная и т.д. на русском","freeLimit":"X проектов, Y пользователей","startPrice":"$X/мес","annualDiscount":"-30%","why":"Конкретное объяснение: почему эта модель лучшая для данного рынка и чем выигрывает у конкурентов"}}}`,
  channels: `{"channels":{"headers":["Компания","Модель роста","Поиск","Реклама","Соцсети","Email"],"rows":[["Н1","Через продукт","40%","30%","20%","10%"],["Н2","Через продажи","30%","40%","20%","10%"],["Н3","Через маркетинг","50%","20%","20%","10%"],["Н4","Продукт+Маркетинг","35%","35%","20%","10%"],["Н5","Через продажи","25%","45%","20%","10%"]],"summary":["в1","в2","в3"],"bestCompany":"Н","bestAdvice":"совет"}}`,
  product: `{"product":{"headers":["Компания","Функции","ИИ","Интеграции","Мобильное","Удержание клиентов"],"rows":[["Н1","функции","✅","100+","✅","🟢 Высокий"],["Н2","функции","❌","50+","✅","🟡 Средний"],["Н3","функции","✅","200+","❌","🔴 Низкий"],["Н4","функции","⚠️","80+","✅","🟢 Высокий"],["Н5","функции","✅","150+","❌","🟡 Средний"]],"summary":["в1","в2","в3"],"bestCompany":"Н","bestAdvice":"совет"}}`,
  reputation: `{"reputation":{"headers":["Компания","Рейтинг G2","Отзывов","Главная жалоба","Поддержка","Медийность"],"rows":[["Н1","4.5/5","5K","жалоба","4.3/5","🟢"],["Н2","4.2/5","3K","жалоба","4.0/5","🟡"],["Н3","4.7/5","8K","жалоба","4.5/5","🟢"],["Н4","3.9/5","2K","жалоба","3.8/5","🔴"],["Н5","4.4/5","6K","жалоба","4.2/5","🟡"]],"summary":["в1","в2","в3"],"bestCompany":"Н","bestAdvice":"совет"}}`,
  offers: `{"offers":{"headers":["Компания","Лид-магнит","Главный оффер","Программа лояльности","Уникальность"],"rows":[["Н1","оффер","скидка","программа","🔥 Высокая"],["Н2","оффер","скидка","программа","⚡ Средняя"],["Н3","оффер","скидка","программа","🔥 Высокая"],["Н4","оффер","скидка","программа","💤 Слабая"],["Н5","оффер","скидка","программа","⚡ Средняя"]],"summary":["в1","в2","в3"],"bestCompany":"Н","bestAdvice":"совет"}}`,
  strategy: `{"strategy":{"q1":{"goal":"цель","actions":[{"title":"действие","detail":"детали"},{"title":"действие","detail":"детали"}],"metrics":"метрики"},"q2":{"goal":"цель","actions":[{"title":"действие","detail":"детали"},{"title":"действие","detail":"детали"}],"metrics":"метрики"},"q3":{"goal":"цель","actions":[{"title":"действие","detail":"детали"},{"title":"действие","detail":"детали"}],"metrics":"метрики"},"q4":{"goal":"цель","actions":[{"title":"действие","detail":"детали"},{"title":"действие","detail":"детали"}],"metrics":"метрики"},"criticalRec":"главное","importantRec":"второе","productIdeas":[{"name":"Название продукта или функции","problem":"Какую проблему решает и кому","missingAt":"У кого из конкурентов этого нет","demand":"🔥 Высокий","effort":"Низкая"},{"name":"Название продукта или функции","problem":"Какую проблему решает и кому","missingAt":"У кого из конкурентов этого нет","demand":"⚡ Средний","effort":"Средняя"},{"name":"Название продукта или функции","problem":"Какую проблему решает и кому","missingAt":"У кого из конкурентов этого нет","demand":"🔥 Высокий","effort":"Высокая"}]}}`,
  swot: `{"swot":{"strengths":["сильная сторона 1","сильная сторона 2","сильная сторона 3","сильная сторона 4"],"weaknesses":["слабость 1","слабость 2","слабость 3","слабость 4"],"opportunities":["возможность 1","возможность 2","возможность 3","возможность 4"],"threats":["угроза 1","угроза 2","угроза 3","угроза 4"]}}`,
  positioning: `{"positioning":{"xLabel":"Простота","xLabelEnd":"Сложность","yLabel":"Малый бизнес","yLabelEnd":"Крупный бизнес","competitors":[{"name":"Н1","url":"https://competitor1.com","x":50,"y":60,"color":"#60a5fa"},{"name":"Н2","url":"https://competitor2.com","x":70,"y":75,"color":"#a78bfa"},{"name":"Н3","url":"https://competitor3.com","x":35,"y":30,"color":"#34d399"},{"name":"Н4","url":"https://competitor4.com","x":20,"y":25,"color":"#f87171"},{"name":"Н5","url":"https://competitor5.com","x":80,"y":55,"color":"#fbbf24"},{"name":"НашПродукт","x":40,"y":35,"color":"#d4a843","isClient":true}],"insight":"Текст инсайта: какая ниша свободна и почему это точка входа"}}`,
  quickwins: `{"quickwins":[{"day":"День 1–2","title":"Название действия","action":"Конкретное описание что делать","effort":"Низкие","impact":"Высокий","why":"Почему это сработает"},{"day":"День 3–4","title":"Название действия","action":"Конкретное описание что делать","effort":"Низкие","impact":"Высокий","why":"Почему это сработает"},{"day":"День 5–7","title":"Название действия","action":"Конкретное описание что делать","effort":"Средние","impact":"Очень высокий","why":"Почему это сработает"}]}`,
  gaps: `{"gaps":[{"emoji":"💰","title":"Название пробела рынка","description":"Детальное описание пробела: что не делают конкуренты и почему это проблема","opportunity":"🔥 Очень высокая","who":"Целевой сегмент"},{"emoji":"🤖","title":"Название пробела рынка","description":"Детальное описание пробела с конкретными данными","opportunity":"🔥 Очень высокая","who":"Целевой сегмент"},{"emoji":"🌍","title":"Название пробела рынка","description":"Детальное описание пробела","opportunity":"⚡ Высокая","who":"Целевой сегмент"},{"emoji":"🎯","title":"Название пробела рынка","description":"Детальное описание пробела","opportunity":"⚡ Высокая","who":"Целевой сегмент"}]}`
};

async function fetchTab(tab, area, segment, product, description, geo, competitors, price, apiKey, urls, analysisContext) {
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
    channels: `Опиши реальные каналы привлечения каждого конкурента на основе их публичной активности. Проценты — оценочные но реалистичные. summary — какой канал конкуренты недоиспользуют.`,
    product: `Сравни функциональность честно: что реально есть у каждого. AI — есть ли реальные AI-фичи, не маркетинг. Барьер переключения — насколько сложно уйти от продукта. summary — где у ${product} есть шанс выиграть.`,
    reputation: `Используй данные G2/Capterra если они есть в скрапинге. Жалобы — конкретные паттерны из отзывов (UX, поддержка, цена, баги). summary — какую жалобу конкурентов может решить ${product}.`,
    offers: `Опиши реальные офферы: что дают бесплатно для привлечения, какие скидки, программы лояльности. summary — какой оффер сработает лучше всего для ${product}.`,
    strategy: `Стратегия должна строиться на реальных слабостях конкурентов из анализа. Каждое действие — конкретный шаг который можно сделать, не абстрактное направление.`,
    quickwins: `Действия только те, что реально можно сделать за 1-2 дня самостоятельно. Основаны на реальных пробелах конкурентов. why — конкретный факт почему это сработает именно здесь.`,
    gaps: `Пробелы — реальные незакрытые потребности рынка которые НЕТ ни у одного из конкурентов. Не общие идеи, а конкретные незанятые ниши с описанием почему конкуренты их игнорируют.`
  };

  const tabHint = tabInstructions[tab] || '';

  const prompt = `Ты — ведущий аналитик конкурентной разведки. Продукт: ${product} | Сфера: ${area} | Сегмент: ${segment} | География: ${geo} | Цена: ${price}
Описание: ${description}
${compLine}
ЗАДАЧА: Заполни JSON для раздела "${tab}" реальными аналитическими данными.
${tabHint}
ПРАВИЛА:
- Замени Н1–Н5 на реальные названия компаний-конкурентов в сфере "${area}". НашПродукт → "${product}".
- Анализируй конкурентов из ВСЕХ указанных регионов — не только из первого. Покажи микс компаний из разных рынков.
- Никаких "Конкурент 1", "Компания А" и других заглушек — только реальные бренды.
- Максимум 5-7 слов в ячейке таблицы.
- summary — конкретные выводы с именами компаний и цифрами, не общие фразы.
- bestAdvice — одно конкретное действие для ${product} прямо сейчас.
${strategyExtra}${quickwinsExtra}${strategyRules}${scrapedContext}
Шаблон: ${TAB_SCHEMAS[tab]}`;

  const maxTokens = tab === 'pricing' ? (scrapedContext ? 1600 : 1100) : (scrapedContext ? 1400 : 900);

  const systemPrompt = 'Ты — ведущий аналитик конкурентной разведки с 15 годами опыта. Верни ТОЛЬКО валидный JSON без markdown, без комментариев, без обёртки. Используй реальные данные о компаниях, конкретные цифры и факты. Никаких заглушек — только реальные бренды и реальные данные.';

  const isAnthropic = apiKey.startsWith('sk-ant-');

  if (isAnthropic) {
    // Anthropic Claude API
    const resp = await httpPost('api.anthropic.com', '/v1/messages',
      { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: prompt }]
      }
    );
    if (resp.error) throw new Error('Anthropic: ' + (resp.error.message || JSON.stringify(resp.error)));
    if (!resp.content || !resp.content[0]) throw new Error('Anthropic вернул пустой ответ: ' + JSON.stringify(resp).substring(0, 200));
    return JSON.parse(resp.content[0].text);
  } else {
    // OpenAI API
    const resp = await httpPost('api.openai.com', '/v1/chat/completions',
      { 'Authorization': `Bearer ${apiKey}` },
      {
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        temperature: 0.4,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' }
      }
    );
    if (resp.error) throw new Error('OpenAI: ' + resp.error.message);
    if (!resp.choices || !resp.choices[0]) throw new Error('OpenAI вернул пустой ответ: ' + JSON.stringify(resp).substring(0, 200));
    return JSON.parse(resp.choices[0].message.content);
  }
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
    const { area, segment, product, description, geography, competitors, competitorUrls, price, tab, competitorNames, analysisContext, apiKey: clientKey } = body;
    const apiKey = (clientKey && (clientKey.startsWith('sk-ant-') || clientKey.startsWith('sk-')) && clientKey.length > 20)
      ? clientKey
      : process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      res.status(500).json({ error: 'Нет ключа OpenAI. Вставь свой ключ в поле вверху страницы.' });
      return;
    }

    const GEO_EXPAND = {
      'казахстан': 'Казахстан (локальные игроки: Kaspi, Kolesa, Chocofood, 2GIS)',
      'снг': 'СНГ — Россия, Казахстан, Беларусь, Украина, Узбекистан, Азербайджан, Армения, Молдова, Таджикистан, Кыргызстан (русскоязычный рынок)',
      'европа': 'Европа — Германия, Великобритания, Франция, Нидерланды, Польша, Испания, Швеция, Италия, Балтия (Латвия, Литва, Эстония)',
      'сша': 'США и Канада',
      'ближний восток': 'Ближний Восток — ОАЭ, Саудовская Аравия, Катар, Кувейт, Бахрейн, Оман, Израиль',
      'индия': 'Индия (локальные игроки: Zoho, Freshworks, Tata — учти ценообразование в рупиях)',
      'китай': 'Китай (закрытый рынок: Alibaba, Tencent, Baidu, ByteDance — WeChat основной канал)',
      'азия': 'Азия — Япония, Южная Корея, Вьетнам, Индонезия, Таиланд, Сингапур, Малайзия',
      'глобально': 'Глобально — США, Европа, СНГ, Индия, Юго-Восточная Азия, Ближний Восток',
    };
    const geoArr = Array.isArray(geography) ? geography : (geography ? [geography] : ['глобально']);
    const geoExpanded = geoArr.map(g => GEO_EXPAND[g.toLowerCase()] || g).join(' | ');
    const geo = geoExpanded;
    const targetTab = tab || 'market';
    const knownCompetitors = competitorNames || (competitors ? [competitors] : []);
    const urlList = Array.isArray(competitorUrls)
      ? competitorUrls
      : (typeof competitorUrls === 'string' ? competitorUrls.split(/[\n,]+/).map(u => u.trim()).filter(Boolean) : []);

    const data = await fetchTab(targetTab, area, segment, product, description, geo, knownCompetitors, price, apiKey, urlList, analysisContext);
    res.status(200).json(data);

  } catch (error) {
    console.error('analyze error:', error.message, error.stack);
    res.status(500).json({ error: error.message, stack: error.stack ? error.stack.split('\n')[0] : '' });
  }
};
