const https = require('https');

function supabaseRequest(method, path, body, key, hostname) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
    };
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
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')); });
    if (data) req.write(data);
    req.end();
  });
}

module.exports = async (req, res) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).end(); return; }

  const ADMIN_PASSWORD = (process.env.ADMIN_PASSWORD           || '').trim();
  const SUPABASE_URL   = (process.env.SUPABASE_URL             || '').trim();
  const SERVICE_KEY    = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

  if (!ADMIN_PASSWORD) {
    res.status(500).json({ error: 'ADMIN_PASSWORD не задан в env' });
    return;
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const { action, password, token } = body;

    // === LOGIN ===
    if (action === 'login') {
      if (!password || password !== ADMIN_PASSWORD) {
        res.status(401).json({ error: 'Неверный пароль' });
        return;
      }
      // Токен = хэш пароля (простой, достаточно для одного администратора)
      const token = Buffer.from(ADMIN_PASSWORD + ':cipher-admin').toString('base64');
      res.status(200).json({ token });
      return;
    }

    // === DATA — проверяем токен ===
    if (action === 'data') {
      const expectedToken = Buffer.from(ADMIN_PASSWORD + ':cipher-admin').toString('base64');
      if (!token || token !== expectedToken) {
        res.status(401).json({ error: 'Не авторизован' });
        return;
      }

      if (!SUPABASE_URL || !SERVICE_KEY) {
        res.status(200).json({ analyses: [], supabaseReady: false });
        return;
      }

      let hostname;
      try { hostname = new URL(SUPABASE_URL).hostname; } catch(e) {
        res.status(500).json({ error: 'Неверный SUPABASE_URL' });
        return;
      }

      // Получаем все анализы с конкурентами (service role — видит всё)
      const { page = 0 } = body;
      const limit = 50;
      const offset = page * limit;
      const path = `/analyses?order=created_at.desc&limit=${limit}&offset=${offset}&select=id,client_key,area,product,geography,price,competitor_count,created_at,email`;
      const result = await supabaseRequest('GET', path, null, SERVICE_KEY, hostname);

      if (result.status >= 300) {
        res.status(500).json({ error: 'Supabase error: ' + JSON.stringify(result.data).substring(0, 200) });
        return;
      }

      const analyses = Array.isArray(result.data) ? result.data : [];

      // Считаем уникальных клиентов и анализы за сегодня
      const today = new Date().toISOString().split('T')[0];
      const uniqueClients = new Set(analyses.map(a => a.client_key)).size;
      const todayCount = analyses.filter(a => a.created_at && a.created_at.startsWith(today)).length;

      // Топ-5 ниш
      const nicheCounts = {};
      analyses.forEach(a => { if (a.area) nicheCounts[a.area] = (nicheCounts[a.area] || 0) + 1; });
      const topNiches = Object.entries(nicheCounts).sort((a,b) => b[1]-a[1]).slice(0, 5);

      res.status(200).json({
        analyses,
        stats: { total: analyses.length, uniqueClients, todayCount, topNiches },
        supabaseReady: true,
        page,
        hasMore: analyses.length === limit
      });
      return;
    }

    res.status(400).json({ error: 'Неизвестный action' });

  } catch(error) {
    console.error('admin error:', error.message);
    res.status(500).json({ error: error.message });
  }
};
