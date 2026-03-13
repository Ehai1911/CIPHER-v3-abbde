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

// ─── Агент 1: Поиск в интернете (OpenAI Responses API + web_search) ────────
async function searchAgent(area, segment, geo, product, description, apiKey) {
  const query = `Find TOP 5 real competitors for a "${area}" product called "${product}" — ${description}. Target segment: ${segment}, geography: ${geo}. For each competitor provide: pricing, market share, TAM, CAGR, CAC, LTV — real 2024-2025 data.`;

  try {
    const resp = await httpPost('api.openai.com', '/v1/chat/completions',
      { 'Authorization': `Bearer ${apiKey}` },
      {
        model: 'gpt-4o-search-preview',
        web_search_options: { search_context_size: 'medium' },
        messages: [{ role: 'user', content: query }]
      }
    );

    if (resp.choices && resp.choices[0] && resp.choices[0].message) {
      return resp.choices[0].message.content || '';
    }
  } catch (e) {
    console.error('Search agent error:', e.message);
    // Если поиск недоступен — продолжаем без него
  }
  return '';
}

// ─── Агент 2: Структурирование данных в JSON (GPT-4o Chat Completions) ─────
async function analysisAgent(area, segment, product, description, geo, adv, price, searchContext, apiKey) {
  const contextBlock = searchContext
    ? `\nРЕАЛЬНЫЕ ДАННЫЕ ИЗ ПОИСКА (используй их как основу):\n${searchContext}\n`
    : '';

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
    "headers": ["Компания","TAM","CAGR","Доля рынка","Позиция"],
    "rows": [["К1","$XXB","XX%","XX%","позиция"],["К2","$XXB","XX%","XX%","позиция"],["К3","$XXB","XX%","XX%","позиция"],["К4","$XXB","XX%","XX%","позиция"],["К5","$XXB","XX%","XX%","позиция"]],
    "summary": ["вывод 1","вывод 2","вывод 3"],
    "bestCompany": "компания",
    "bestAdvice": "совет"
  },
  "audience": {
    "headers": ["Компания","Сегмент","Ключевые роли","Jobs-to-be-done","Зрелость"],
    "rows": [["К1","сегмент","роли","jobs","уровень"],["К2","сегмент","роли","jobs","уровень"],["К3","сегмент","роли","jobs","уровень"],["К4","сегмент","роли","jobs","уровень"],["К5","сегмент","роли","jobs","уровень"]],
    "summary": ["вывод 1","вывод 2","вывод 3"],
    "bestCompany": "компания",
    "bestAdvice": "совет"
  },
  "economics": {
    "headers": ["Компания","Модель","Цена","LTV","CAC","Payback"],
    "rows": [["К1","модель","цена","LTV","CAC","период"],["К2","модель","цена","LTV","CAC","период"],["К3","модель","цена","LTV","CAC","период"],["К4","модель","цена","LTV","CAC","период"],["К5","модель","цена","LTV","CAC","период"]],
    "summary": ["вывод 1","вывод 2","вывод 3"],
    "bestCompany": "компания",
    "bestAdvice": "совет"
  },
  "channels": {
    "headers": ["Компания","Основной GTM","Вторичные","Контент","Бюджет"],
    "rows": [["К1","GTM","каналы","контент","High/Med/Low"],["К2","GTM","каналы","контент","High/Med/Low"],["К3","GTM","каналы","контент","High/Med/Low"],["К4","GTM","каналы","контент","High/Med/Low"],["К5","GTM","каналы","контент","High/Med/Low"]],
    "summary": ["вывод 1","вывод 2","вывод 3"],
    "bestCompany": "компания",
    "bestAdvice": "совет"
  },
  "product": {
    "headers": ["Компания","Ключевые фичи","AI","Интеграции","Mobile","Барьеры входа"],
    "rows": [["К1","фичи","Yes/No","кол-во","Yes/No","уровень"],["К2","фичи","Yes/No","кол-во","Yes/No","уровень"],["К3","фичи","Yes/No","кол-во","Yes/No","уровень"],["К4","фичи","Yes/No","кол-во","Yes/No","уровень"],["К5","фичи","Yes/No","кол-во","Yes/No","уровень"]],
    "summary": ["вывод 1","вывод 2","вывод 3"],
    "bestCompany": "компания",
    "bestAdvice": "совет"
  },
  "reputation": {
    "headers": ["Компания","Рейтинг G2","Отзывов","Главные жалобы","NPS","PR активность"],
    "rows": [["К1","X.X/5","XXK","жалобы","XX","High/Med/Low"],["К2","X.X/5","XXK","жалобы","XX","High/Med/Low"],["К3","X.X/5","XXK","жалобы","XX","High/Med/Low"],["К4","X.X/5","XXK","жалобы","XX","High/Med/Low"],["К5","X.X/5","XXK","жалобы","XX","High/Med/Low"]],
    "summary": ["вывод 1","вывод 2","вывод 3"],
    "bestCompany": "компания",
    "bestAdvice": "совет"
  },
  "macro": {
    "headers": ["Компания","GDPR","SOC2","Локализация","Хранение данных","Стандарты"],
    "rows": [["К1","Yes/No","Yes/No","регионы","Local/Global","стандарты"],["К2","Yes/No","Yes/No","регионы","Local/Global","стандарты"],["К3","Yes/No","Yes/No","регионы","Local/Global","стандарты"],["К4","Yes/No","Yes/No","регионы","Local/Global","стандарты"],["К5","Yes/No","Yes/No","регионы","Local/Global","стандарты"]],
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

    // Агент 1: ищем в интернете
    const searchContext = await searchAgent(area, segment, geo, product, description, apiKey);

    // Агент 2: структурируем в JSON
    const analysis = await analysisAgent(area, segment, product, description, geo, adv, price, searchContext, apiKey);

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
