// МАРГО — Модуль анализа рекламы
// POST /api/margo-ads
// body: { urls, apiKey }
// Источники: Facebook Ad Library (публичный), Google Ads Transparency

const JINA = 'https://r.jina.ai/';

function getDomain(url) {
  return url.replace(/https?:\/\/(www\.)?/, '').split('/')[0];
}

function getCompanyName(url) {
  return getDomain(url).split('.')[0];
}

// Facebook Ad Library — публичный поиск без API ключа
function fbAdsUrl(companyName) {
  return `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=RU&q=${encodeURIComponent(companyName)}&search_type=keyword_unordered`;
}

// Google Ads Transparency
function googleAdsUrl(domain) {
  return `https://adstransparency.google.com/advertiser/search?query=${encodeURIComponent(domain)}&region=RU`;
}

async function scrapeAdsSource(url) {
  try {
    const res = await fetch(JINA + url, {
      headers: { 'Accept': 'text/plain', 'X-Return-Format': 'text' },
      signal: AbortSignal.timeout(12000)
    });
    if (!res.ok) return '';
    const text = await res.text();
    return text.slice(0, 4000);
  } catch {
    return '';
  }
}

async function collectAdsData(urls) {
  const companies = urls.map(u => ({
    url: u,
    domain: getDomain(u),
    name: getCompanyName(u)
  }));

  const results = await Promise.all(
    companies.slice(0, 4).map(async (c) => {
      const [fbContent, googleContent] = await Promise.all([
        scrapeAdsSource(fbAdsUrl(c.name)),
        scrapeAdsSource(googleAdsUrl(c.domain))
      ]);
      return {
        ...c,
        facebook: fbContent,
        google: googleContent
      };
    })
  );

  return results;
}

async function analyzeAds(adsData, apiKey) {
  const prompt = `Ты — специалист по платному трафику и таргетированной рекламе. Проанализируй рекламу конкурентов.

Данные рекламных кабинетов:
${adsData.map(c => `=== ${c.domain} ===
Facebook Ads: ${c.facebook || 'нет данных'}
Google Ads: ${c.google || 'нет данных'}`).join('\n\n')}

Верни ТОЛЬКО валидный JSON без markdown:
{
  "totalAds": число (общее кол-во найденных объявлений),
  "topFormat": "Видео|Карусель|Статика|Текст",
  "mainPain": "главная боль которую все бьют в рекламе — 1 фраза",
  "ads": [
    {
      "company": "домен",
      "format": "Видео|Карусель|Статика",
      "formatColor": "purple|gold|blue|green",
      "headline": "заголовок объявления",
      "copy": "текст объявления (1-2 предложения)",
      "triggers": ["триггер1", "триггер2", "триггер3"],
      "cta": "текст кнопки →"
    }
  ],
  "gaps": "что НЕ используют конкуренты в рекламе — конкретная возможность для клиента (2-3 предложения)",
  "bestChannels": [
    {
      "channel": "Facebook|Instagram|Google|YouTube",
      "activity": "высокая|средняя|низкая",
      "note": "что делают в этом канале"
    }
  ],
  "targeting": {
    "audiences": ["аудитория1", "аудитория2"],
    "hooks": ["главный крючок 1", "главный крючок 2"],
    "weaknesses": "слабости в их таргете — где ты можешь зайти лучше"
  }
}

Правила:
- Если данных нет — генерируй реалистичный анализ на основе ниши компании
- ads — минимум 3 объявления для разных конкурентов
- gaps и targeting.weaknesses должны быть actionable советами`;

  const isAnthropic = apiKey && apiKey.startsWith('sk-ant');
  const isOpenAI = apiKey && apiKey.startsWith('sk-') && !isAnthropic;

  if (isAnthropic) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1400,
        system: 'Ты — эксперт по таргетированной рекламе и performance-маркетингу. Верни ТОЛЬКО валидный JSON.',
        messages: [{ role: 'user', content: prompt }]
      })
    });
    const data = await res.json();
    return JSON.parse(data.content[0].text);
  }

  if (isOpenAI) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 1400,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'Ты — эксперт по таргетированной рекламе. Верни ТОЛЬКО валидный JSON.' },
          { role: 'user', content: prompt }
        ]
      })
    });
    const data = await res.json();
    return JSON.parse(data.choices[0].message.content);
  }

  throw new Error('No valid API key');
}

// ===== HANDLER =====
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { urls, apiKey } = req.body;
  if (!urls || !urls.length) return res.status(400).json({ error: 'No URLs provided' });

  try {
    const adsData = await collectAdsData(urls);
    const result = await analyzeAds(adsData, apiKey);
    res.status(200).json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
