const https = require('https');

// Supabase REST API helper — без SDK, через прямые HTTP запросы
// Нужны env переменные: SUPABASE_URL, SUPABASE_ANON_KEY

function getSupabaseConfig() {
  const url = (process.env.SUPABASE_URL      || '').trim();
  const key = (process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY || '').trim();
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
async function saveAnalysis({ clientKey, area, product, segment, description, geography, price, competitors, email }) {
  const cfg = getSupabaseConfig();
  if (!cfg) return null;

  try {
    // 1. Upsert клиента — игнорируем дубликат если уже есть
    const clientRes = await supabaseRequest('POST', '/clients?on_conflict=client_key', { client_key: clientKey }, cfg.key, cfg.hostname);
    if (clientRes.status >= 400 && clientRes.status !== 409) {
      console.warn('Supabase clients insert status:', clientRes.status, JSON.stringify(clientRes.data).substring(0, 200));
    }

    // 2. Вставляем анализ
    const analysisRes = await supabaseRequest('POST', '/analyses', {
      client_key: clientKey,
      area, product, segment, description,
      geography: geography || [],
      price, email: email || null,
      competitor_count: competitors ? competitors.length : 0
    }, cfg.key, cfg.hostname);

    console.log('Supabase analyses insert status:', analysisRes.status, JSON.stringify(analysisRes.data).substring(0, 300));
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

// Получить конкурентов + метаданные конкретного анализа (для share-ссылки и повторного запуска)
async function getAnalysisById(analysisId) {
  const cfg = getSupabaseConfig();
  if (!cfg) return null;

  try {
    // Получаем анализ с конкурентами одним запросом
    const path = `/analyses?id=eq.${encodeURIComponent(analysisId)}&select=id,area,product,segment,description,geography,price,ai_cache,cipher_competitors(name,url,preview,why)`;
    const res = await supabaseRequest('GET', path, null, cfg.key, cfg.hostname);
    if (res.status >= 300 || !Array.isArray(res.data) || !res.data[0]) return null;
    const row = res.data[0];
    return {
      id: row.id,
      area: row.area,
      product: row.product,
      segment: row.segment,
      description: row.description,
      geography: row.geography,
      price: row.price,
      aiCache: row.ai_cache || null,
      competitors: row.cipher_competitors || []
    };
  } catch(e) {
    console.warn('Supabase getAnalysisById error:', e.message);
    return null;
  }
}

// Получить конкурентов конкретного анализа (для повторного запуска)
async function getAnalysisCompetitors(analysisId) {
  const data = await getAnalysisById(analysisId);
  return data ? data.competitors : [];
}

// Обновить кеш вкладки в ai_cache (fire-and-forget, не блокирует ответ)
// Использует service role key — anon key не имеет прав на PATCH
async function updateAiCache(analysisId, tabId, tabData) {
  const url = (process.env.SUPABASE_URL                || '').trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY   || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY || '').trim();
  if (!url || !key || !analysisId || !tabId || !tabData) return;
  let hostname;
  try { hostname = new URL(url).hostname; } catch(e) { return; }

  try {
    // Читаем текущий кеш
    const getRes = await supabaseRequest('GET', `/analyses?id=eq.${encodeURIComponent(analysisId)}&select=ai_cache`, null, key, hostname);
    const current = (Array.isArray(getRes.data) && getRes.data[0]) ? (getRes.data[0].ai_cache || {}) : {};
    // Мержим и сохраняем
    const updated = { ...current, [tabId]: tabData };
    const patchRes = await supabaseRequest('PATCH', `/analyses?id=eq.${encodeURIComponent(analysisId)}`, { ai_cache: updated }, key, hostname);
    if (patchRes.status >= 300) console.warn('updateAiCache PATCH status:', patchRes.status, JSON.stringify(patchRes.data).substring(0, 100));
  } catch(e) {
    console.warn('updateAiCache error:', e.message);
  }
}

// Получить последний анализ по email (для share-ссылки через email)
async function getLatestAnalysisByEmail(email) {
  const cfg = getSupabaseConfig();
  if (!cfg) return null;

  try {
    const path = `/analyses?email=eq.${encodeURIComponent(email)}&order=created_at.desc&limit=1&select=id,area,product,segment,description,geography,price,ai_cache,cipher_competitors(name,url,preview,why)`;
    const res = await supabaseRequest('GET', path, null, cfg.key, cfg.hostname);
    if (res.status >= 300 || !Array.isArray(res.data) || !res.data[0]) return null;
    const row = res.data[0];
    return {
      id: row.id,
      area: row.area,
      product: row.product,
      segment: row.segment,
      description: row.description,
      geography: row.geography,
      price: row.price,
      aiCache: row.ai_cache || null,
      competitors: row.cipher_competitors || []
    };
  } catch(e) {
    console.warn('Supabase getLatestAnalysisByEmail error:', e.message);
    return null;
  }
}

module.exports = { saveAnalysis, getHistory, getAnalysisById, getAnalysisCompetitors, getLatestAnalysisByEmail, updateAiCache, getSupabaseConfig };
