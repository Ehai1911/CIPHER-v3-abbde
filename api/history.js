const { getHistory, getAnalysisCompetitors, getSupabaseConfig } = require('./supabase');

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
    const { clientKey, analysisId } = body;

    if (!clientKey) {
      res.status(400).json({ error: 'clientKey обязателен' });
      return;
    }

    // Режим: загрузить конкурентов конкретного анализа (для повторного запуска — 5.4)
    if (analysisId) {
      const competitors = await getAnalysisCompetitors(analysisId);
      res.status(200).json({ competitors });
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
