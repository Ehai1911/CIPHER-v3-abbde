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
async function analysisAgent(area, segment, product, description, geo, adv, price, searchContext, apiKey) {
  const contextBlock = '';

  const prompt = `Ты эксперт по конкурентному анализу. Пользователь описал свой продукт:
- Сфера: ${area}
- Сегмент клиентов: ${segment}
- Название продукта: ${product}
- Описание: ${description}
- География: ${geo}
- Преимущества: ${adv}
- Ценовой диапазон: ${price}
${contextBlock}
Найди TOP 5 реальных конкурентов для сферы "${area}" и географии "${geo}".
НЕ используй CRM компании если сфера не CRM. Подбери конкурентов релевантных описанию.

Верни ТОЛЬКО валидный JSON (без markdown) в таком формате:

{
  "market": {
    "headers": ["Компания","Доля рынка","Рост рынка (CAGR)","Позиция в категории","Тренд"],
    "rows": [["К1","XX%","XX%","позиция","↑ Растёт"],["К2","XX%","XX%","позиция","→ Стабильно"],["К3","XX%","XX%","позиция","↑ Растёт"],["К4","XX%","XX%","позиция","↑ Растёт"],["К5","XX%","XX%","позиция","→ Стабильно"]],
    "summary": ["вывод 1","вывод 2","вывод 3"],
    "bestCompany": "компания",
    "bestAdvice": "совет"
  },
  "audience": {
    "headers": ["Компания","Сегмент","Ключевые роли","Ключевая боль","Зрелость рынка"],
    "rows": [["К1","сегмент","роли","боль","уровень"],["К2","сегмент","роли","боль","уровень"],["К3","сегмент","роли","боль","уровень"],["К4","сегмент","роли","боль","уровень"],["К5","сегмент","роли","боль","уровень"]],
    "summary": ["вывод 1","вывод 2","вывод 3"],
    "bestCompany": "компания",
    "bestAdvice": "совет"
  },
  "pricing": {
    "headers": ["Компания","Модель","Стартовая цена","Бесплатный тариф","Пробный период","Скидки"],
    "rows": [["К1","SaaS/Freemium","$XX/мес","✅/❌","XX дней","условие"],["К2","SaaS/Freemium","$XX/мес","✅/❌","XX дней","условие"],["К3","SaaS/Freemium","$XX/мес","✅/❌","XX дней","условие"],["К4","SaaS/Freemium","$XX/мес","✅/❌","XX дней","условие"],["К5","SaaS/Freemium","$XX/мес","✅/❌","XX дней","условие"]],
    "summary": ["вывод 1","вывод 2","вывод 3"],
    "bestCompany": "компания",
    "bestAdvice": "совет"
  },
  "channels": {
    "headers": ["Компания","Модель роста","Органика (SEO)","Платный трафик","Соцсети","Email-маркетинг"],
    "rows": [["К1","PLG/SLG/MLG","XX%","XX%","XX%","XX%"],["К2","PLG/SLG/MLG","XX%","XX%","XX%","XX%"],["К3","PLG/SLG/MLG","XX%","XX%","XX%","XX%"],["К4","PLG/SLG/MLG","XX%","XX%","XX%","XX%"],["К5","PLG/SLG/MLG","XX%","XX%","XX%","XX%"]],
    "summary": ["вывод 1","вывод 2","вывод 3"],
    "bestCompany": "компания",
    "bestAdvice": "совет"
  },
  "product": {
    "headers": ["Компания","Ключевые функции","ИИ-автоматизация","Кол-во интеграций","Моб. приложение","Барьер переключения"],
    "rows": [["К1","функции","✅/❌/⚠️ Базовый","число+","✅/❌","🔴/🟡/🟢 уровень"],["К2","функции","✅/❌/⚠️ Базовый","число+","✅/❌","🔴/🟡/🟢 уровень"],["К3","функции","✅/❌/⚠️ Базовый","число+","✅/❌","🔴/🟡/🟢 уровень"],["К4","функции","✅/❌/⚠️ Базовый","число+","✅/❌","🔴/🟡/🟢 уровень"],["К5","функции","✅/❌/⚠️ Базовый","число+","✅/❌","🔴/🟡/🟢 уровень"]],
    "summary": ["вывод 1","вывод 2","вывод 3"],
    "bestCompany": "компания",
    "bestAdvice": "совет"
  },
  "reputation": {
    "headers": ["Компания","Рейтинг G2","Кол-во отзывов","Главные жалобы","Оценка поддержки","PR активность"],
    "rows": [["К1","X.X/5","XXK","жалобы","X.X/5","🔴/🟡/🟢"],["К2","X.X/5","XXK","жалобы","X.X/5","🔴/🟡/🟢"],["К3","X.X/5","XXK","жалобы","X.X/5","🔴/🟡/🟢"],["К4","X.X/5","XXK","жалобы","X.X/5","🔴/🟡/🟢"],["К5","X.X/5","XXK","жалобы","X.X/5","🔴/🟡/🟢"]],
    "summary": ["вывод 1","вывод 2","вывод 3"],
    "bestCompany": "компания",
    "bestAdvice": "совет"
  },
  "offers": {
    "headers": ["Компания","Лид-магнит","Первое предложение","Программа лояльности","Скорость ответа"],
    "rows": [["К1","предложение","условие/скидка","программа","время"],["К2","предложение","условие/скидка","программа","время"],["К3","предложение","условие/скидка","программа","время"],["К4","предложение","условие/скидка","программа","время"],["К5","предложение","условие/скидка","программа","время"]],
    "summary": ["вывод 1","вывод 2","вывод 3"],
    "bestCompany": "компания",
    "bestAdvice": "совет"
  },
  "strategy": {
    "q1": {
      "goal": "цель Q1 для ${product} в ${geo}",
      "learnFrom": "Компания1 (что) + Компания2 (что)",
      "actions": [
        {"title": "действие 1","budget": "$XK","detail": "детали"},
        {"title": "действие 2","budget": "$XK","detail": "детали"},
        {"title": "действие 3","budget": "$XK","detail": "детали"}
      ],
      "metrics": "+XX% конверсии, +$XXXK ARR"
    },
    "q2": {
      "goal": "цель Q2",
      "learnFrom": "Компания1 (что) + Компания2 (что)",
      "actions": [{"title":"действие 1","budget":"$XK","detail":"детали"},{"title":"действие 2","budget":"$XK","detail":"детали"},{"title":"действие 3","budget":"$XK","detail":"детали"}],
      "metrics": "метрики"
    },
    "q3": {
      "goal": "цель Q3",
      "learnFrom": "Компания1 (что) + Компания2 (что)",
      "actions": [{"title":"действие 1","budget":"$XK","detail":"детали"},{"title":"действие 2","budget":"$XK","detail":"детали"},{"title":"действие 3","budget":"$XK","detail":"детали"}],
      "metrics": "метрики"
    },
    "q4": {
      "goal": "цель Q4",
      "learnFrom": "Компания1 (что) + Компания2 (что)",
      "actions": [{"title":"действие 1","budget":"$XK","detail":"детали"},{"title":"действие 2","budget":"$XK","detail":"детали"},{"title":"действие 3","budget":"$XK","detail":"детали"}],
      "metrics": "метрики"
    },
    "finance": {
      "totalInvest": "$XXXK",
      "arr": "$X.XM",
      "payback": "X-X месяцев",
      "roi": "XXXX%",
      "q1invest": "$XXK","q2invest": "$XXK","q3invest": "$XXK","q4invest": "$XXK",
      "q1revenue": "$XXXK","q2revenue": "$XXXK","q3revenue": "$XXXK","q4revenue": "$XXXK",
      "ltvCac": "Xx",
      "grossMargin": "XX%"
    },
    "criticalRec": "самое важное действие для ${product} прямо сейчас",
    "importantRec": "второе по важности действие"
  }
}`;

  const resp = await httpPost('api.openai.com', '/v1/chat/completions',
    { 'Authorization': `Bearer ${apiKey}` },
    {
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'Отвечай ТОЛЬКО валидным JSON без markdown. Используй реальные данные из контекста поиска.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 4000,
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
    const { area, segment, product, description, geography, advantages, price } = JSON.parse(event.body);
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return { statusCode: 500, body: JSON.stringify({ error: 'OPENAI_API_KEY not configured' }) };
    }

    const geo = Array.isArray(geography) ? geography.join(', ') : (geography || 'глобально');
    const adv = Array.isArray(advantages) ? advantages.join(', ') : (advantages || '');

    const analysis = await analysisAgent(area, segment, product, description, geo, adv, price, '', apiKey);

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
