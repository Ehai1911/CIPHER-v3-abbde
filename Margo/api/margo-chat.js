// МАРГО — AI Чат-агент
// POST /api/margo-chat
// body: { messages, context, apiKey }

const SYSTEM_PROMPT = `Ты МАРГО — маркетинг-аналитик с 10 годами опыта в digital-маркетинге.
Специализация: конкурентный анализ, таргетированная реклама, контент-стратегия, воронки продаж.

Твои правила:
- Отвечай коротко и конкретно: 2-4 предложения
- Говори как практикующий маркетолог, не теоретик
- Всегда давай actionable совет — что именно сделать
- Ссылайся на данные анализа если они есть в контексте
- Используй цифры и конкретику, не общие фразы
- Отвечай на русском языке

Твои зоны экспертизы:
- Анализ сайтов конкурентов и их воронок
- Разбор отзывов и голоса клиентов
- Таргетированная реклама (Facebook, Instagram, Google)
- Контент-стратегия и контент-план
- Позиционирование и дифференциация
- Go-to-market стратегия`;

// Шаблоны контент-плана
function buildContentPlanPrompt(context, period = '4 недели') {
  return `На основе анализа конкурентов составь контент-план на ${period}.

Контекст анализа:
${context}

Верни контент-план в формате:
- Неделя 1-4: тема, формат, канал, цель (TOFU/MOFU/BOFU), CTA
- Для каждой недели 3-4 единицы контента
- Учти пробелы конкурентов

Формат ответа: структурированный список, не JSON.`;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { messages, context, apiKey, mode } = req.body;

  if (!messages || !apiKey) return res.status(400).json({ error: 'Missing required fields' });

  const isAnthropic = apiKey.startsWith('sk-ant');
  const isOpenAI = apiKey.startsWith('sk-') && !isAnthropic;

  // Специальный режим — генерация контент-плана
  const lastMessage = messages[messages.length - 1]?.content || '';
  const isContentPlanRequest = /контент.план|план.контент|распиши.план|составь.план/i.test(lastMessage);

  const systemPrompt = SYSTEM_PROMPT + (context ? `\n\nДанные анализа конкурентов:\n${context}` : '');

  try {
    let reply;

    if (isAnthropic) {
      const apiMessages = messages.map(m => ({ role: m.role, content: m.content }));

      // Если просят контент-план — добавляем специальный промпт
      if (isContentPlanRequest && context) {
        apiMessages[apiMessages.length - 1].content = buildContentPlanPrompt(context);
      }

      const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: isContentPlanRequest ? 1200 : 400,
          system: systemPrompt,
          messages: apiMessages
        })
      });
      const data = await apiRes.json();
      reply = data.content[0].text;
    }

    else if (isOpenAI) {
      const apiMessages = [
        { role: 'system', content: systemPrompt },
        ...messages.map(m => ({ role: m.role, content: m.content }))
      ];

      if (isContentPlanRequest && context) {
        apiMessages[apiMessages.length - 1].content = buildContentPlanPrompt(context);
      }

      const apiRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          max_tokens: isContentPlanRequest ? 1200 : 400,
          messages: apiMessages
        })
      });
      const data = await apiRes.json();
      reply = data.choices[0].message.content;
    }

    else {
      return res.status(400).json({ error: 'Invalid API key format' });
    }

    res.status(200).json({ reply });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
