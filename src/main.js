import fetch from 'node-fetch';

const API_TIMEOUT = 3 * 60 * 1000; // 3 minutes in milliseconds

export default async function ({ req, res }) {

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
  const YOUR_SITE_URL = process.env.YOUR_SITE_URL || 'Definitive AI'; // Replace with your site URL
  const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;
  const YOUR_SITE_NAME = process.env.YOUR_SITE_NAME || 'Definitive AI'; // Replace with your site name
  
  if (req.method === 'GET') {
    return res.text('Only POST requests are supported.', 200, {'content-type': 'text/plain'});
  }


  const prompt = req.body; // Appwrite passes the body directly

  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required in the request body.' });
  }

  if (!GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY is not set.');
    // Continue without Gemini if key is missing, or return error depending on requirements
  }

  if (!PERPLEXITY_API_KEY) {
      console.error('PERPLEXITY_API_KEY is not set.');
    }

  if (!OPENROUTER_API_KEY) {
    console.error('OPENROUTER_API_KEY is not set.');
 return res.json({ status: 500, json: { error: 'OPENROUTER_API_KEY is not set.' } });
  }

  const callGemini = async (prompt) => {
    if (!GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is not set.');
    }
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`,
        {
          method: 'POST',
          headers: {
            'x-goog-api-key': `${GEMINI_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            tools: [{ google_search: {} }],
          }),
          signal: controller.signal,
        },
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      return { source: 'Gemini', status: 'success', response: data };
    } catch (error) {
      console.error('Error calling Gemini API:', error.message);
      return { source: 'Gemini', status: 'failed', error: error.message };    }
  };

  const callPerplexity = async (prompt) => {
      if (!PERPLEXITY_API_KEY) {
          throw new Error('PERPLEXITY_API_KEY is not set.');
      }
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

      try {
          const response = await fetch('https://api.perplexity.ai/chat/completions', {
              method: 'POST',
              headers: {
                  'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
                  'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                  model: 'sonar',
                  messages: [{
                      role: 'user',
                      content: prompt,
                  }],
              }),
              signal: controller.signal
          });

          clearTimeout(timeoutId);
          const data = await response.json();
          return { source: 'Perplexity', status: response.ok ? 'succeeded' : 'failed', response: data };
      } catch (error) {
          clearTimeout(timeoutId);
          return { source: 'Perplexity', status: 'failed', error: error.message };
      }
  }

  const callOpenRouter = async (prompt, model, isSummaryCall = false) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

    try {
      const response = await fetch(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${OPENROUTER_API_KEY}`,
            'HTTP-Referer': YOUR_SITE_URL,
            'X-Title': YOUR_SITE_NAME,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: model,
            messages: [
              {
                role: 'user',
                content: isSummaryCall ? prompt : `${prompt}. Use web search to generate more accurate result`,
              },
            ],
          }),
          signal: controller.signal,
        },
      );


      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.text(); // Or response.json() if the error is JSON
        throw new Error(`HTTP error! status: ${response.status}, body: ${errorBody}`);
      }
      const data = await response.json();
      return { source: model, status: 'succeeded', response: data };
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        console.error(`OpenRouter API call for model ${model} timed out.`);
        return { source: model, status: 'failed', error: 'Request timed out' };
      }
      console.error(`Error calling OpenRouter API for model ${model}:`, error.message);
      return { source: model, status: 'failed', error: error.message };
    }
  };

  const apiCalls = [
    callGemini(prompt),
    callPerplexity(prompt),
    callOpenRouter(prompt, 'deepseek/deepseek-chat-v3-0324:free'),
    callOpenRouter(prompt, 'moonshotai/kimi-k2:free'),
    callOpenRouter(prompt, 'openai/gpt-oss-20b:free'),
  ];

  const results = await Promise.all(apiCalls);
  const successfulResults = results.filter(result => result.status === 'succeeded');

  const sourceText = successfulResults.map((result, index) => {
    return `#Source${index + 1}\n${JSON.stringify(result.response)}\n----------------------`;
  }).join('\n');

  const finalPrompt = `${prompt}.\nTo answer this query you have ${successfulResults.length} sources. \n${sourceText}\nGenerate a definitive summary on the basis of these sources in html format.`;

  const finalResult = await callOpenRouter(finalPrompt, 'qwen/qwen3-235b-a22b:free');

  if (finalResult.status === 'succeeded') {
    return res.json({ status: 200, json: finalResult.response.choices[0]?.message?.content || 'Could not generate summary.' }, {
      'Access-Control-Allow-Origin': '*',
    });
  }  else {
    return res.json({ status: 500, json: { error: 'Failed to generate final summary.', details: finalResult.error } }, {
      'Access-Control-Allow-Origin': '*',
    });
  }

}