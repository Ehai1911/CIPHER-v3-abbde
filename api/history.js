const { getHistory, getAnalysisById, getAnalysisCompetitors, getLatestAnalysisByEmail, getSupabaseConfig } = require('./supabase');

module.exports = async (req, res) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  if (!getSupabaseConfig()) {
    res.status(200).json({ history: [], enabled: false });
    return;
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const { clientKey, analysisId, email } = body;

    // Режим: загрузить последний анализ по email (share-ссылка через email)
    if (email) {
      const analysis = await getLatestAnalysisByEmail(email);
      const competitors = analysis ? analysis.competitors : [];
      const analysisData = analysis ? {
        area: analysis.area, product: analysis.product,
        segment: analysis.segment, description: analysis.description,
        geography: analysis.geography, price: analysis.price
      } : null;
      res.status(200).json({ competitors, analysisData, analysisId: analysis ? analysis.id : null, aiCache: analysis ? analysis.aiCache : null });
      return;
    }

    if (!clientKey) {
      res.status(400).json({ error: 'clientKey обязателен' });
      return;
    }

    // Режим: загрузить анализ по ID (share-ссылка или повторный запуск — 5.4)
    if (analysisId) {
      const analysis = await getAnalysisById(analysisId);
      const competitors = analysis ? analysis.competitors : [];
      const analysisData = analysis ? {
        area: analysis.area, product: analysis.product,
        segment: analysis.segment, description: analysis.description,
        geography: analysis.geography, price: analysis.price
      } : null;
      res.status(200).json({ competitors, analysisData, aiCache: analysis ? analysis.aiCache : null });
      return;
    }

    // Режим: вернуть историю последних 10 анализов клиента (5.5)
    const history = await getHistory(clientKey);
    res.status(200).json({ history, enabled: true });

  } catch(error) {
    console.error('history error:', error.message);
    res.status(500).json({ error: error.message });
  }
};
