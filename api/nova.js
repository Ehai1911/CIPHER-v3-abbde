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
    req.setTimeout(20000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(data);
    req.end();
  });
}

// Вызов конкретного провайдера — возвращает текст ответа
async function callProvider(provider, apiKey, systemPrompt, userPrompt) {
  if (provider === 'deepseek') {
    const resp = await httpPost('api.deepseek.com', '/v1/chat/completions',
      { 'Authorization': `Bearer ${apiKey}` },
      { model: 'deepseek-chat', messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }], temperature: 0.7, max_tokens: 400 }
    );
    if (resp.error) throw new Error('DeepSeek: ' + resp.error.message);
    if (!resp.choices || !resp.choices[0]) throw new Error('DeepSeek empty');
    return resp.choices[0].message.content;
  }

  if (provider === 'anthropic') {
    const resp = await httpPost('api.anthropic.com', '/v1/messages',
      { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      { model: 'claude-haiku-4-5-20251001', max_tokens: 400, system: systemPrompt, messages: [{ role: 'user', content: userPrompt }] }
    );
    if (resp.error) throw new Error('Anthropic: ' + (resp.error.message || JSON.stringify(resp.error)));
    if (!resp.content || !resp.content[0]) throw new Error('Anthropic empty');
    return resp.content[0].text;
  }

  if (provider === 'zai') {
    const resp = await httpPost('open.bigmodel.cn', '/api/paas/v4/chat/completions',
      { 'Authorization': `Bearer ${apiKey}` },
      { model: 'glm-4-flash', messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }], temperature: 0.7, max_tokens: 400 }
    );
    if (resp.error) throw new Error('Z.ai: ' + (resp.error.message || JSON.stringify(resp.error)));
    if (!resp.choices || !resp.choices[0]) throw new Error('Z.ai empty');
    return resp.choices[0].message.content;
  }

  // openai
  const resp = await httpPost('api.openai.com', '/v1/chat/completions',
    { 'Authorization': `Bearer ${apiKey}` },
    { model: 'gpt-4o-mini', messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }], temperature: 0.7, max_tokens: 400 }
  );
  if (resp.error) throw new Error('OpenAI: ' + resp.error.message);
  if (!resp.choices || !resp.choices[0]) throw new Error('OpenAI empty');
  return resp.choices[0].message.content;
}

module.exports = async (req, res) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400'
  };
  Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method Not Allowed' }); return; }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { message, product, area, segment, geography, competitors, context, history } = body;

    if (!message || !message.trim()) {
      res.status(400).json({ error: 'Сообщение не указано' });
      return;
    }

    // Провайдеры в порядке приоритета (дешёвый + быстрый → мощный)
    const providerChain = [
      { provider: 'deepseek', key: (process.env.DEEPSEEK_API_KEY  || '').trim() },
      { provider: 'zai',      key: (process.env.ZAI_API_KEY       || '').trim() },
      { provider: 'anthropic', key: (process.env.ANTHROPIC_API_KEY || '').trim() },
      { provider: 'openai',   key: (process.env.OPENAI_API_KEY    || '').trim() },
    ].filter(p => p.key);

    if (providerChain.length === 0) {
      res.status(500).json({ error: 'Нет ключей API на сервере' });
      return;
    }

    const geoStr = Array.isArray(geography) ? geography.join(', ') : (geography || 'не указана');

    const systemPrompt = `Ты NOVA — умный бизнес-аналитик и стратегический советник. Ты помогаешь пользователю разобраться в конкурентном анализе его продукта и выстроить стратегию.

Контекст анализа:
- Продукт: ${product || 'не указан'}
- Сфера: ${area || 'не указана'}
- Сегмент: ${segment || 'не указан'}
- География: ${geoStr}
- Конкуренты: ${competitors || 'определены автоматически'}
${context ? `\nДанные из анализа:\n${context}` : ''}

Правила ответа:
- Отвечай только на русском языке
- Отвечай коротко и конкретно — 2–4 предложения
- Говори как умный консультант: конкретные факты, без воды и общих слов
- Если вопрос касается данных из анализа — ссылайся на конкретные вкладки (Рынок, Аудитория, SWOT, Стратегия и т.д.)
- Если данных нет — честно скажи что нужно запустить анализ, но постарайся дать полезный совет исходя из контекста
- Никогда не говори "спроси меня про метки" или похожие заготовленные фразы — отвечай на реальный вопрос`;

    let lastError;
    for (const { provider, key } of providerChain) {
      try {
        const reply = await callProvider(provider, key, systemPrompt, message);
        res.status(200).json({ reply: reply.trim() });
        return;
      } catch (e) {
        lastError = e;
        console.warn(`Nova: ${provider} failed — ${e.message}`);
      }
    }

    res.status(500).json({ error: `Сервис временно недоступен: ${lastError?.message || 'неизвестная ошибка'}` });

  } catch (error) {
    console.error('Nova error:', error.message);
    res.status(500).json({ error: error.message });
  }
};
