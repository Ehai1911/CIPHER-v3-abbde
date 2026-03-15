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
  market: `{"market":{"headers":["Компания","Доля рынка","CAGR","Позиция","Тренд"],"rows":[["Н1","X%","X%","позиция","↑"],["Н2","X%","X%","позиция","→"],["Н3","X%","X%","позиция","↑"],["Н4","X%","X%","позиция","↑"],["Н5","X%","X%","позиция","→"]],"summary":["вывод1","вывод2","вывод3"],"bestCompany":"Н","bestAdvice":"совет"},"competitors":["Н1","Н2","Н3","Н4","Н5"]}`,
  audience: `{"audience":{"headers":["Компания","Сегмент","Роли","Боль","Зрелость"],"rows":[["Н1","сег","роли","боль","ур"],["Н2","сег","роли","боль","ур"],["Н3","сег","роли","боль","ур"],["Н4","сег","роли","боль","ур"],["Н5","сег","роли","боль","ур"]],"summary":["в1","в2","в3"],"bestCompany":"Н","bestAdvice":"совет"}}`,
  pricing: `{"pricing":{"headers":["Компания","Модель","Цена","Бесплатно","Триал","Скидки"],"rows":[["Н1","SaaS","$X/мес","✅","14д","есть"],["Н2","SaaS","$X/мес","❌","7д","нет"],["Н3","SaaS","$X/мес","✅","30д","есть"],["Н4","SaaS","$X/мес","❌","—","нет"],["Н5","SaaS","$X/мес","✅","14д","есть"]],"summary":["в1","в2","в3"],"bestCompany":"Н","bestAdvice":"совет"}}`,
  channels: `{"channels":{"headers":["Компания","Модель роста","SEO","Платный","Соцсети","Email"],"rows":[["Н1","PLG","40%","30%","20%","10%"],["Н2","SLG","30%","40%","20%","10%"],["Н3","MLG","50%","20%","20%","10%"],["Н4","PLG","35%","35%","20%","10%"],["Н5","SLG","25%","45%","20%","10%"]],"summary":["в1","в2","в3"],"bestCompany":"Н","bestAdvice":"совет"}}`,
  product: `{"product":{"headers":["Компания","Функции","AI","Интеграции","Мобайл","Барьер"],"rows":[["Н1","функции","✅","100+","✅","🟢 Высокий"],["Н2","функции","❌","50+","✅","🟡 Средний"],["Н3","функции","✅","200+","❌","🔴 Низкий"],["Н4","функции","⚠️","80+","✅","🟢 Высокий"],["Н5","функции","✅","150+","❌","🟡 Средний"]],"summary":["в1","в2","в3"],"bestCompany":"Н","bestAdvice":"совет"}}`,
  reputation: `{"reputation":{"headers":["Компания","Рейтинг G2","Отзывов","Жалобы","Поддержка","PR"],"rows":[["Н1","4.5/5","5K","жалоба","4.3/5","🟢"],["Н2","4.2/5","3K","жалоба","4.0/5","🟡"],["Н3","4.7/5","8K","жалоба","4.5/5","🟢"],["Н4","3.9/5","2K","жалоба","3.8/5","🔴"],["Н5","4.4/5","6K","жалоба","4.2/5","🟡"]],"summary":["в1","в2","в3"],"bestCompany":"Н","bestAdvice":"совет"}}`,
  offers: `{"offers":{"headers":["Компания","Лид-магнит","Оффер","Лояльность","Ответ"],"rows":[["Н1","оффер","скидка","программа","2ч"],["Н2","оффер","скидка","программа","4ч"],["Н3","оффер","скидка","программа","1ч"],["Н4","оффер","скидка","программа","8ч"],["Н5","оффер","скидка","программа","3ч"]],"summary":["в1","в2","в3"],"bestCompany":"Н","bestAdvice":"совет"}}`,
  strategy: `{"strategy":{"q1":{"goal":"цель","actions":[{"title":"действие","budget":"$XK","detail":"детали"},{"title":"действие","budget":"$XK","detail":"детали"}],"metrics":"метрики"},"q2":{"goal":"цель","actions":[{"title":"действие","budget":"$XK","detail":"детали"},{"title":"действие","budget":"$XK","detail":"детали"}],"metrics":"метрики"},"q3":{"goal":"цель","actions":[{"title":"действие","budget":"$XK","detail":"детали"},{"title":"действие","budget":"$XK","detail":"детали"}],"metrics":"метрики"},"q4":{"goal":"цель","actions":[{"title":"действие","budget":"$XK","detail":"детали"},{"title":"действие","budget":"$XK","detail":"детали"}],"metrics":"метрики"},"finance":{"totalInvest":"$XK","arr":"$XM","payback":"X мес","roi":"X%"},"criticalRec":"главное","importantRec":"второе"}}`,
  swot: `{"swot":{"strengths":["сильная сторона 1","сильная сторона 2","сильная сторона 3","сильная сторона 4"],"weaknesses":["слабость 1","слабость 2","слабость 3","слабость 4"],"opportunities":["возможность 1","возможность 2","возможность 3","возможность 4"],"threats":["угроза 1","угроза 2","угроза 3","угроза 4"]}}`,
  positioning: `{"positioning":{"xLabel":"Простота","xLabelEnd":"Сложность","yLabel":"Малый бизнес","yLabelEnd":"Крупный бизнес","competitors":[{"name":"Н1","x":50,"y":60,"color":"#60a5fa"},{"name":"Н2","x":70,"y":75,"color":"#a78bfa"},{"name":"Н3","x":35,"y":30,"color":"#34d399"},{"name":"Н4","x":20,"y":25,"color":"#f87171"},{"name":"Н5","x":80,"y":55,"color":"#fbbf24"},{"name":"НашПродукт","x":40,"y":35,"color":"#d4a843","isClient":true}],"insight":"Текст инсайта: какая ниша свободна и почему это точка входа"}}`,
  quickwins: `{"quickwins":[{"day":"День 1–2","title":"Название действия","action":"Конкретное описание что делать","effort":"Низкие","impact":"Высокий","why":"Почему это сработает"},{"day":"День 3–4","title":"Название действия","action":"Конкретное описание что делать","effort":"Низкие","impact":"Высокий","why":"Почему это сработает"},{"day":"День 5–7","title":"Название действия","action":"Конкретное описание что делать","effort":"Средние","impact":"Очень высокий","why":"Почему это сработает"}]}`,
  gaps: `{"gaps":[{"emoji":"💰","title":"Название пробела рынка","description":"Детальное описание пробела: что не делают конкуренты и почему это проблема","opportunity":"🔥 Очень высокая","who":"Целевой сегмент"},{"emoji":"🤖","title":"Название пробела рынка","description":"Детальное описание пробела с конкретными данными","opportunity":"🔥 Очень высокая","who":"Целевой сегмент"},{"emoji":"🌍","title":"Название пробела рынка","description":"Детальное описание пробела","opportunity":"⚡ Высокая","who":"Целевой сегмент"},{"emoji":"🎯","title":"Название пробела рынка","description":"Детальное описание пробела","opportunity":"⚡ Высокая","who":"Целевой сегмент"}]}`
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

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { area, segment, product, description, geography, competitors, price, tab, competitorNames, apiKey: clientKey } = JSON.parse(event.body);
    const apiKey = (clientKey && clientKey.startsWith('sk-') && clientKey.length > 20)
      ? clientKey
      : process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return { statusCode: 500, body: JSON.stringify({ error: 'Нет ключа OpenAI. Вставь свой ключ в поле вверху страницы или обратись к администратору.' }) };
    }

    const geo = Array.isArray(geography) ? geography.join(', ') : (geography || 'глобально');
    const targetTab = tab || 'market';
    const knownCompetitors = competitorNames || (competitors ? [competitors] : []);

    const data = await fetchTab(targetTab, area, segment, product, description, geo, knownCompetitors, price, apiKey);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(data)
    };

  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
