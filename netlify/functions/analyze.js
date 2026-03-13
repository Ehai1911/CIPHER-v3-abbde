const https = require('https');

// ─── Утилита: HTTP POST → Promise ──────────────────────────────────────────
function httpPost(hostname, path, headers, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request({
      hostname,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        ...headers
      }
    }, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch (e) { reject(new Error('Parse error: ' + raw.substring(0, 300))); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// ─── Анализ: GPT-4o генерирует конкурентный анализ ─────────────────────────
async function analysisAgent(area, segment, product, description, geo, competitors, price, searchContext, apiKey) {
  const competitorsBlock = competitors
    ? `\nИЗВЕСТНЫЕ КОНКУРЕНТЫ (пользователь назвал их сам — обязательно включи их в анализ):\n${competitors}\n`
    : '';

  const prompt = `Конкурентный анализ для продукта:
Сфера: ${area} | Сегмент: ${segment} | Продукт: ${product}
Описание: ${description}
География: ${geo} | Цена: ${price}
${competitorsBlock}
Найди TOP 5 реальных конкурентов. Каждое значение в ячейке — максимум 4 слова. Будь краток.

JSON-структура (верни только JSON, без markdown):
{"market":{"headers":["Компания","Доля рынка","CAGR","Позиция","Тренд"],"rows":[["Н1","X%","X%","позиция","↑"],["Н2","X%","X%","позиция","→"],["Н3","X%","X%","позиция","↑"],["Н4","X%","X%","позиция","↑"],["Н5","X%","X%","позиция","→"]],"summary":["вывод1","вывод2","вывод3"],"bestCompany":"Н","bestAdvice":"совет"},"audience":{"headers":["Компания","Сегмент","Роли","Боль","Зрелость"],"rows":[["Н1","сег","роли","боль","ур"],["Н2","сег","роли","боль","ур"],["Н3","сег","роли","боль","ур"],["Н4","сег","роли","боль","ур"],["Н5","сег","роли","боль","ур"]],"summary":["в1","в2","в3"],"bestCompany":"Н","bestAdvice":"совет"},"pricing":{"headers":["Компания","Модель","Цена","Бесплатно","Триал","Скидки"],"rows":[["Н1","SaaS","$X/мес","✅","14д","условие"],["Н2","SaaS","$X/мес","❌","7д","условие"],["Н3","SaaS","$X/мес","✅","30д","условие"],["Н4","SaaS","$X/мес","❌","—","условие"],["Н5","SaaS","$X/мес","✅","14д","условие"]],"summary":["в1","в2","в3"],"bestCompany":"Н","bestAdvice":"совет"},"channels":{"headers":["Компания","Модель роста","SEO","Платный","Соцсети","Email"],"rows":[["Н1","PLG","40%","30%","20%","10%"],["Н2","SLG","30%","40%","20%","10%"],["Н3","MLG","50%","20%","20%","10%"],["Н4","PLG","35%","35%","20%","10%"],["Н5","SLG","25%","45%","20%","10%"]],"summary":["в1","в2","в3"],"bestCompany":"Н","bestAdvice":"совет"},"product":{"headers":["Компания","Функции","AI","Интеграции","Мобайл","Барьер"],"rows":[["Н1","функции","✅","100+","✅","🟢 Высокий"],["Н2","функции","❌","50+","✅","🟡 Средний"],["Н3","функции","✅","200+","❌","🔴 Низкий"],["Н4","функции","⚠️","80+","✅","🟢 Высокий"],["Н5","функции","✅","150+","❌","🟡 Средний"]],"summary":["в1","в2","в3"],"bestCompany":"Н","bestAdvice":"совет"},"reputation":{"headers":["Компания","Рейтинг G2","Отзывов","Жалобы","Поддержка","PR"],"rows":[["Н1","4.5/5","5K","жалоба","4.3/5","🟢"],["Н2","4.2/5","3K","жалоба","4.0/5","🟡"],["Н3","4.7/5","8K","жалоба","4.5/5","🟢"],["Н4","3.9/5","2K","жалоба","3.8/5","🔴"],["Н5","4.4/5","6K","жалоба","4.2/5","🟡"]],"summary":["в1","в2","в3"],"bestCompany":"Н","bestAdvice":"совет"},"offers":{"headers":["Компания","Лид-магнит","Оффер","Лояльность","Ответ"],"rows":[["Н1","оффер","скидка","программа","2ч"],["Н2","оффер","скидка","программа","4ч"],["Н3","оффер","скидка","программа","1ч"],["Н4","оффер","скидка","программа","8ч"],["Н5","оффер","скидка","программа","3ч"]],"summary":["в1","в2","в3"],"bestCompany":"Н","bestAdvice":"совет"},"strategy":{"q1":{"goal":"цель Q1","learnFrom":"Н1+Н2","actions":[{"title":"действие","budget":"$XK","detail":"детали"},{"title":"действие","budget":"$XK","detail":"детали"},{"title":"действие","budget":"$XK","detail":"детали"}],"metrics":"метрики"},"q2":{"goal":"цель Q2","learnFrom":"Н2+Н3","actions":[{"title":"действие","budget":"$XK","detail":"детали"},{"title":"действие","budget":"$XK","detail":"детали"},{"title":"действие","budget":"$XK","detail":"детали"}],"metrics":"метрики"},"q3":{"goal":"цель Q3","learnFrom":"Н3+Н4","actions":[{"title":"действие","budget":"$XK","detail":"детали"},{"title":"действие","budget":"$XK","detail":"детали"},{"title":"действие","budget":"$XK","detail":"детали"}],"metrics":"метрики"},"q4":{"goal":"цель Q4","learnFrom":"Н4+Н5","actions":[{"title":"действие","budget":"$XK","detail":"детали"},{"title":"действие","budget":"$XK","detail":"детали"},{"title":"действие","budget":"$XK","detail":"детали"}],"metrics":"метрики"},"finance":{"totalInvest":"$XK","arr":"$XM","payback":"X мес","roi":"X%","q1invest":"$XK","q2invest":"$XK","q3invest":"$XK","q4invest":"$XK","q1revenue":"$XK","q2revenue":"$XK","q3revenue":"$XK","q4revenue":"$XK","ltvCac":"Xx","grossMargin":"X%"},"criticalRec":"главное действие","importantRec":"второе действие"}}`;

  const resp = await httpPost('api.openai.com', '/v1/chat/completions',
    { 'Authorization': `Bearer ${apiKey}` },
    {
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'Ты эксперт по конкурентному анализу. Заполни JSON реальными данными. Отвечай ТОЛЬКО валидным JSON без markdown. Каждое значение — максимум 4 слова.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 1800,
      response_format: { type: 'json_object' }
    }
  );

  if (!resp.choices || !resp.choices[0]) throw new Error('No response from OpenAI');
  return JSON.parse(resp.choices[0].message.content);
}

// ─── Основной обработчик ───────────────────────────────────────────────────
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { area, segment, product, description, geography, competitors, price } = JSON.parse(event.body);
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return { statusCode: 500, body: JSON.stringify({ error: 'OPENAI_API_KEY not configured' }) };
    }

    const geo = Array.isArray(geography) ? geography.join(', ') : (geography || 'глобально');

    const analysis = await analysisAgent(area, segment, product, description, geo, competitors || '', price, '', apiKey);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(analysis)
    };

  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
