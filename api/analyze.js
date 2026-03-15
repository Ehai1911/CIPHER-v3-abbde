const https = require('https');

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
  market: `{"market":{"headers":["Компания","Доля рынка","Рост/год","Позиция","Тренд"],"rows":[["Н1","X%","X%","позиция","↑"],["Н2","X%","X%","позиция","→"],["Н3","X%","X%","позиция","↑"],["Н4","X%","X%","позиция","↑"],["Н5","X%","X%","позиция","→"]],"summary":["вывод1","вывод2","вывод3"],"bestCompany":"Н","bestAdvice":"совет"},"competitors":["Н1","Н2","Н3","Н4","Н5"]}`,
  audience: `{"audience":{"headers":["Компания","Сегмент","Роли","Боль","Зрелость"],"rows":[["Н1","сег","роли","боль","ур"],["Н2","сег","роли","боль","ур"],["Н3","сег","роли","боль","ур"],["Н4","сег","роли","боль","ур"],["Н5","сег","роли","боль","ур"]],"summary":["в1","в2","в3"],"bestCompany":"Н","bestAdvice":"совет"}}`,
  pricing: `{"pricing":{"headers":["Компания","Модель","Цена","Бесплатно","Пробный период","Скидки"],"rows":[["Н1","За пользователя","$X/мес","✅","14д","есть"],["Н2","За пользователя","$X/мес","❌","7д","нет"],["Н3","Бесплатный план","$X/мес","✅","30д","есть"],["Н4","За пользователя","$X/мес","❌","—","нет"],["Н5","Бесплатный план","$X/мес","✅","14д","есть"]],"summary":["в1","в2","в3"],"bestCompany":"Н","bestAdvice":"совет"}}`,
  channels: `{"channels":{"headers":["Компания","Модель роста","Поиск","Реклама","Соцсети","Email"],"rows":[["Н1","Через продукт","40%","30%","20%","10%"],["Н2","Через продажи","30%","40%","20%","10%"],["Н3","Через маркетинг","50%","20%","20%","10%"],["Н4","Продукт+Маркетинг","35%","35%","20%","10%"],["Н5","Через продажи","25%","45%","20%","10%"]],"summary":["в1","в2","в3"],"bestCompany":"Н","bestAdvice":"совет"}}`,
  product: `{"product":{"headers":["Компания","Функции","AI","Интеграции","Мобайл","Барьер"],"rows":[["Н1","функции","✅","100+","✅","🟢 Высокий"],["Н2","функции","❌","50+","✅","🟡 Средний"],["Н3","функции","✅","200+","❌","🔴 Низкий"],["Н4","функции","⚠️","80+","✅","🟢 Высокий"],["Н5","функции","✅","150+","❌","🟡 Средний"]],"summary":["в1","в2","в3"],"bestCompany":"Н","bestAdvice":"совет"}}`,
  reputation: `{"reputation":{"headers":["Компания","Рейтинг G2","Отзывов","Жалобы","Поддержка","PR"],"rows":[["Н1","4.5/5","5K","жалоба","4.3/5","🟢"],["Н2","4.2/5","3K","жалоба","4.0/5","🟡"],["Н3","4.7/5","8K","жалоба","4.5/5","🟢"],["Н4","3.9/5","2K","жалоба","3.8/5","🔴"],["Н5","4.4/5","6K","жалоба","4.2/5","🟡"]],"summary":["в1","в2","в3"],"bestCompany":"Н","bestAdvice":"совет"}}`,
  offers: `{"offers":{"headers":["Компания","Лид-магнит","Оффер","Лояльность","Ответ"],"rows":[["Н1","оффер","скидка","программа","2ч"],["Н2","оффер","скидка","программа","4ч"],["Н3","оффер","скидка","программа","1ч"],["Н4","оффер","скидка","программа","8ч"],["Н5","оффер","скидка","программа","3ч"]],"summary":["в1","в2","в3"],"bestCompany":"Н","bestAdvice":"совет"}}`,
  strategy: `{"strategy":{"q1":{"goal":"цель","actions":[{"title":"действие","budget":"$XK","detail":"детали"},{"title":"действие","budget":"$XK","detail":"детали"}],"metrics":"метрики"},"q2":{"goal":"цель","actions":[{"title":"действие","budget":"$XK","detail":"детали"},{"title":"действие","budget":"$XK","detail":"детали"}],"metrics":"метрики"},"q3":{"goal":"цель","actions":[{"title":"действие","budget":"$XK","detail":"детали"},{"title":"действие","budget":"$XK","detail":"детали"}],"metrics":"метрики"},"q4":{"goal":"цель","actions":[{"title":"действие","budget":"$XK","detail":"детали"},{"title":"действие","budget":"$XK","detail":"детали"}],"metrics":"метрики"},"finance":{"totalInvest":"$XK","arr":"$XM","payback":"X мес","roi":"X%"},"criticalRec":"главное","importantRec":"второе"}}`
};

async function fetchTab(tab, area, segment, product, description, geo, competitors, price, apiKey) {
  const compLine = competitors && competitors.length
    ? `Конкуренты: ${competitors.join(', ')}\n`
    : '';

  const prompt = `Продукт: ${product} | Сфера: ${area} | Сегмент: ${segment} | География: ${geo} | Цена: ${price}
Описание: ${description}
${compLine}Заполни JSON реальными данными для раздела "${tab}". Максимум 5 слов в ячейке.
Шаблон: ${TAB_SCHEMAS[tab]}`;

  const resp = await httpPost('api.openai.com', '/v1/chat/completions',
    { 'Authorization': `Bearer ${apiKey}` },
    {
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'Верни ТОЛЬКО валидный JSON без markdown. Заполни реальными данными.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 700,
      response_format: { type: 'json_object' }
    }
  );

  if (!resp.choices || !resp.choices[0]) throw new Error('No response from OpenAI');
  return JSON.parse(resp.choices[0].message.content);
}

// Vercel serverless function format
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method Not Allowed' }); return; }

  try {
    const { area, segment, product, description, geography, competitors, price, tab, competitorNames, apiKey: clientKey } = req.body;
    const apiKey = (clientKey && clientKey.startsWith('sk-') && clientKey.length > 20)
      ? clientKey
      : process.env.OPENAI_API_KEY;

    if (!apiKey) {
      res.status(500).json({ error: 'Нет ключа OpenAI. Вставь свой ключ в поле вверху страницы.' });
      return;
    }

    const geo = Array.isArray(geography) ? geography.join(', ') : (geography || 'глобально');
    const targetTab = tab || 'market';
    const knownCompetitors = competitorNames || (competitors ? [competitors] : []);

    const data = await fetchTab(targetTab, area, segment, product, description, geo, knownCompetitors, price, apiKey);
    res.status(200).json(data);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
