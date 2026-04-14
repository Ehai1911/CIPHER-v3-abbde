const https = require('https');

// Читает URL через Jina Reader — возвращает чистый текст
function fetchJinaUrl(url) {
  return new Promise((resolve) => {
    try {
      const clean = url.replace(/^https?:\/\//, '');
      const req = https.request({
        hostname: 'r.jina.ai', path: '/' + clean, method: 'GET',
        headers: { 'Accept': 'text/plain', 'X-Return-Format': 'text', 'User-Agent': 'Mozilla/5.0' }
      }, (res) => {
        let raw = '';
        res.on('data', c => raw += c);
        res.on('end', () => resolve(raw.substring(0, 8000)));
      });
      req.on('error', () => resolve(''));
      req.setTimeout(15000, () => { req.destroy(); resolve(''); });
      req.end();
    } catch(e) { resolve(''); }
  });
}

// AI вызов для извлечения данных из текста
function callAI(systemPrompt, userPrompt, maxTokens) {
  return new Promise((resolve, reject) => {
    const providers = [];
    if ((process.env.ANTHROPIC_API_KEY || '').trim()) providers.push('anthropic');
    if ((process.env.ZAI_API_KEY       || '').trim()) providers.push('zai');
    if ((process.env.DEEPSEEK_API_KEY  || '').trim()) providers.push('deepseek');

    async function tryNext(i) {
      if (i >= providers.length) { reject(new Error('No AI providers available')); return; }
      const p = providers[i];
      try {
        let result;
        if (p === 'anthropic') result = await callAnthropic(systemPrompt, userPrompt, maxTokens);
        else if (p === 'zai') result = await callOpenAIStyle('https://api.zai.ac/v1/chat/completions', (process.env.ZAI_API_KEY || '').trim(), 'claude-3-5-haiku-20241022', systemPrompt, userPrompt, maxTokens);
        else if (p === 'deepseek') result = await callOpenAIStyle('https://api.deepseek.com/v1/chat/completions', (process.env.DEEPSEEK_API_KEY || '').trim(), 'deepseek-chat', systemPrompt, userPrompt, maxTokens);
        if (result) { resolve(result); return; }
      } catch(e) {}
      tryNext(i + 1);
    }
    tryNext(0);
  });
}

function callAnthropic(systemPrompt, userPrompt, maxTokens) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: maxTokens, system: systemPrompt, messages: [{ role: 'user', content: userPrompt }] });
    const req = https.request({
      hostname: 'api.anthropic.com', path: '/v1/messages', method: 'POST',
      headers: { 'x-api-key': (process.env.ANTHROPIC_API_KEY || '').trim(), 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { const d = JSON.parse(raw); resolve(d.content?.[0]?.text || ''); } catch(e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(); reject(new Error('timeout')); });
    req.write(body); req.end();
  });
}

function callOpenAIStyle(url, apiKey, model, systemPrompt, userPrompt, maxTokens) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const body = JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }] });
    const req = https.request({
      hostname: parsed.hostname, path: parsed.pathname, method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { const d = JSON.parse(raw); resolve(d.choices?.[0]?.message?.content || ''); } catch(e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(); reject(new Error('timeout')); });
    req.write(body); req.end();
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).end(); return; }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const { url, text } = body;

    // Получаем текст — либо из URL (Jina читает PDF/DOC/сайт), либо напрямую
    let content = text || '';
    if (url && !content) {
      content = await fetchJinaUrl(url);
    }

    if (!content || content.length < 50) {
      res.status(200).json({ error: 'Не удалось прочитать файл. Попробуй скопировать текст вручную.' });
      return;
    }

    const systemPrompt = `Ты извлекаешь структурированные данные о продукте из текста документа. Верни ТОЛЬКО JSON без markdown.`;
    const userPrompt = `Из текста ниже извлеки данные о продукте/компании.

ТЕКСТ:
${content.substring(0, 6000)}

Верни JSON:
{
  "area": "ниша/сфера продукта (5-7 слов, например: 'SaaS для управления задачами')",
  "product": "название продукта или компании",
  "description": "краткое описание что делает продукт (1-2 предложения)",
  "segment": "целевой клиент: Частные лица | Малый и средний бизнес | Крупный бизнес",
  "competitors": "конкуренты через запятую если упомянуты, иначе пустая строка",
  "price": "ценовой диапазон если упомянут, иначе пустая строка"
}`;

    const aiText = await callAI(systemPrompt, userPrompt, 600);

    // Извлекаем JSON из ответа
    let parsed = null;
    try {
      const match = aiText.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
    } catch(e) {}

    if (!parsed) {
      res.status(200).json({ error: 'AI не смог разобрать документ. Попробуй другой файл.' });
      return;
    }

    res.status(200).json({ ok: true, data: parsed });

  } catch(e) {
    console.error('parse-file error:', e.message);
    res.status(500).json({ error: e.message });
  }
};
