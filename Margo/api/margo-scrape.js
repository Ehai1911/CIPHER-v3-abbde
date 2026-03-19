// МАРГО — Модуль скрейпинга сайтов и отзывов
// POST /api/margo-scrape
// body: { urls, module: 'site'|'reviews', apiKey }

const JINA = 'https://r.jina.ai/';

// Домены для отзывов
const REVIEW_SOURCES = {
  g2: (name) => `https://www.g2.com/search?query=${encodeURIComponent(name)}`,
  trustpilot: (name) => `https://www.trustpilot.com/search?query=${encodeURIComponent(name)}`,
};

async function scrapeUrl(url) {
  try {
    const res = await fetch(JINA + url, {
      headers: { 'Accept': 'text/plain', 'X-Return-Format': 'text' },
      signal: AbortSignal.timeout(12000)
    });
    if (!res.ok) return '';
    const text = await res.text();
    return text.slice(0, 6000);
  } catch {
    return '';
  }
}

function getDomain(url) {
  return url.replace(/https?:\/\/(www\.)?/, '').split('/')[0];
}

function getCompanyName(url) {
  return getDomain(url).split('.')[0];
}

// ===== SITE ANALYSIS =====
async function analyzeSites(urls, apiKey) {
  const scraped = await Promise.all(
    urls.map(async (url) => ({
      url,
      domain: getDomain(url),
      name: getCompanyName(url),
      content: await scrapeUrl(url)
    }))
  );

  const validScraped = scraped.filter(s => s.content.length > 100);

  const prompt = `Ты маркетинг-аналитик. Проанализируй лендинги конкурентов и верни JSON.

Данные сайтов:
${validScraped.map(s => `=== ${s.domain} ===\n${s.content.slice(0, 2000)}`).join('\n\n')}

Верни ТОЛЬКО валидный JSON без markdown:
{
  "competitors": [
    {
      "name": "домен",
      "uvp": "главный оффер/ценностное предложение в 1 фразе",
      "cta": "текст главной кнопки",
      "socialProof": "цифры доверия (отзывы, клиенты, рейтинг)",
      "funnel": "модель входа (Free/Demo/Trial/Buy)",
      "score": число от 0 до 100 (сила лендинга)
    }
  ],
  "insights": [
    {
      "label": "название инсайта",
      "text": "конкретный вывод для маркетолога — что использовать или избегать",
      "tag": "ТРЕНД|ВОЗМОЖНОСТЬ|ФИШКА|РИСК",
      "tagClass": "tag-gold|tag-green|tag-purple|tag-red"
    }
  ]
}

Правила:
- Используй реальные данные с сайтов
- insights должны быть конкретными и actionable
- Минимум 3 конкурента, минимум 3 инсайта`;

  return await callAI(prompt, apiKey, 1200);
}

// ===== REVIEWS ANALYSIS =====
async function analyzeReviews(urls, apiKey) {
  const companies = urls.map(u => ({ url: u, name: getCompanyName(u), domain: getDomain(u) }));

  // Скрейпим G2 для каждого
  const reviewed = await Promise.all(
    companies.slice(0, 4).map(async (c) => {
      const g2Content = await scrapeUrl(REVIEW_SOURCES.g2(c.name));
      const tpContent = await scrapeUrl(REVIEW_SOURCES.trustpilot(c.name));
      return {
        ...c,
        g2: g2Content.slice(0, 1500),
        tp: tpContent.slice(0, 1500)
      };
    })
  );

  const prompt = `Ты маркетолог-аналитик. Проанализируй отзывы клиентов конкурентов.

Данные отзывов:
${reviewed.map(c => `=== ${c.domain} ===\nG2: ${c.g2 || 'нет данных'}\nTrustpilot: ${c.tp || 'нет данных'}`).join('\n\n')}

Верни ТОЛЬКО валидный JSON без markdown:
{
  "competitors": [
    {
      "name": "домен",
      "platform": "G2|TP|PS",
      "rating": "4.2",
      "positives": ["что хвалят 1", "что хвалят 2"],
      "negatives": ["на что жалуются 1", "на что жалуются 2"]
    }
  ],
  "opportunity": "конкретная возможность: какую боль клиентов конкурентов ты можешь закрыть лучше — 2-3 предложения"
}

Правила:
- positives и negatives — конкретные и цитатоподобные
- opportunity должна быть прямым маркетинговым инсайтом`;

  return await callAI(prompt, apiKey, 900);
}

// ===== AI CALL =====
async function callAI(prompt, apiKey, maxTokens) {
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
        max_tokens: maxTokens,
        system: 'Ты — опытный маркетинг-аналитик. Верни ТОЛЬКО валидный JSON без markdown и пояснений.',
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
        max_tokens: maxTokens,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'Ты — опытный маркетинг-аналитик. Верни ТОЛЬКО валидный JSON.' },
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

  const { urls, module, apiKey } = req.body;

  if (!urls || !urls.length) return res.status(400).json({ error: 'No URLs provided' });

  try {
    let result;
    if (module === 'site') {
      result = await analyzeSites(urls, apiKey);
    } else if (module === 'reviews') {
      result = await analyzeReviews(urls, apiKey);
    } else {
      return res.status(400).json({ error: 'Unknown module' });
    }
    res.status(200).json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
