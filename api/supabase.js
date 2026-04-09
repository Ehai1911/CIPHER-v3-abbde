const https = require('https');

// Supabase REST API helper — без SDK, через прямые HTTP запросы
// Нужны env переменные: SUPABASE_URL, SUPABASE_ANON_KEY

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  try {
    const parsed = new URL(url);
    return { hostname: parsed.hostname, key };
  } catch(e) { return null; }
}

function supabaseRequest(method, path, body, key, hostname) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      'Prefer': method === 'POST' ? 'return=representation' : undefined
    };
    Object.keys(headers).forEach(k => headers[k] === undefined && delete headers[k]);
    if (data) headers['Content-Length'] = Buffer.byteLength(data);

    const req = https.request({
      hostname, path: `/rest/v1${path}`, method, headers
    }, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: raw ? JSON.parse(raw) : null }); }
        catch(e) { resolve({ status: res.statusCode, data: raw }); }
      });
    });
    req.on('error', reject);
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('Supabase timeout')); });
    if (data) req.write(data);
    req.end();
  });
}

// Сохранить анализ и конкурентов (вызывается после discover)
async function saveAnalysis({ clientKey, area, product, segment, description, geography, price, competitors }) {
  const cfg = getSupabaseConfig();
  if (!cfg) return null;

  try {
    // 1. Upsert клиента (Prefer: resolution=ignore-duplicates чтобы не падало на дубль)
    await supabaseRequest('POST', '/clients', { client_key: clientKey }, cfg.key, cfg.hostname);

    // 2. Вставляем анализ
    const analysisRes = await supabaseRequest('POST', '/analyses', {
      client_key: clientKey,
      area, product, segment, description,
      geography: geography || [],
      price,
      competitor_count: competitors ? competitors.length : 0
    }, cfg.key, cfg.hostname);

    if (!analysisRes.data || analysisRes.status >= 300) return null;
    const analysis = Array.isArray(analysisRes.data) ? analysisRes.data[0] : analysisRes.data;
    if (!analysis || !analysis.id) return null;

    // 3. Вставляем конкурентов пакетом в cipher_competitors
    if (competitors && competitors.length > 0) {
      const rows = competitors.map(c => ({
        analysis_id: analysis.id,
        name: c.name || '',
        url: c.url || '',
        preview: c.preview || c.why || '',
        why: c.why || ''
      }));
      await supabaseRequest('POST', '/cipher_competitors', rows, cfg.key, cfg.hostname);
    }

    return analysis.id;
  } catch(e) {
    console.warn('Supabase saveAnalysis error:', e.message);
    return null;
  }
}

// Получить историю анализов клиента (последние 10)
async function getHistory(clientKey) {
  const cfg = getSupabaseConfig();
  if (!cfg) return [];

  try {
    const path = `/analyses?client_key=eq.${encodeURIComponent(clientKey)}&order=created_at.desc&limit=10&select=id,area,product,geography,price,competitor_count,created_at,cipher_competitors(id,name,url,preview)`;
    const res = await supabaseRequest('GET', path, null, cfg.key, cfg.hostname);
    if (res.status >= 300 || !Array.isArray(res.data)) return [];
    return res.data;
  } catch(e) {
    console.warn('Supabase getHistory error:', e.message);
    return [];
  }
}

// Получить конкурентов конкретного анализа (для повторного запуска)
async function getAnalysisCompetitors(analysisId) {
  const cfg = getSupabaseConfig();
  if (!cfg) return [];

  try {
    const path = `/cipher_competitors?analysis_id=eq.${encodeURIComponent(analysisId)}&select=name,url,preview,why`;
    const res = await supabaseRequest('GET', path, null, cfg.key, cfg.hostname);
    if (res.status >= 300 || !Array.isArray(res.data)) return [];
    return res.data;
  } catch(e) {
    console.warn('Supabase getAnalysisCompetitors error:', e.message);
    return [];
  }
}

module.exports = { saveAnalysis, getHistory, getAnalysisCompetitors, getSupabaseConfig };
