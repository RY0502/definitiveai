import fetch from 'node-fetch';

const API_TIMEOUT = 3 * 60 * 1000; // 3 minutes in milliseconds
let requestCount = 0;

export default async function ({ req, res }) {

  const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
  const YOUR_SITE_URL = process.env.YOUR_SITE_URL || 'Definitive AI';
  const YOUR_SITE_NAME = process.env.YOUR_SITE_NAME || 'Definitive AI';
  const ANOTHER_OPENROUTER_API_KEY = process.env.ANOTHER_OPENROUTER_API_KEY;

  requestCount++;
  if (req.method === 'GET') {
    return res.text('Only POST requests are supported.', 200, { 'content-type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
  }

  if (req.method === 'OPTIONS') {
    return res.send('', 200, {
      'Access-Control-Allow-Origin': '*', // Or '*' for all origins (use with caution)
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', // Or include all methods your function uses
      'Access-Control-Allow-Headers': '*', // Or include all headers your requests send
    });
  }


  const prompt = req.bodyText; // Appwrite passes the body directly

  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required in the request body.' });
  }

  if (!OPENROUTER_API_KEY) {
    console.error('OPENROUTER_API_KEY is not set.');
    return res.json({ status: 500, json: { error: 'OPENROUTER_API_KEY is not set.' } });
  }

  const callOpenRouter = async (prompt, model) => {
    const startTime = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

    try {
      const apiKey = (requestCount % 2 === 0 || !ANOTHER_OPENROUTER_API_KEY)
        ? OPENROUTER_API_KEY
        : ANOTHER_OPENROUTER_API_KEY;
      const response = await fetch(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'HTTP-Referer': YOUR_SITE_URL,
            'X-Title': YOUR_SITE_NAME,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: model,
            messages: [
              {
                role: 'user',
                content: prompt,
              },
            ],
          }),
          signal: controller.signal,
        },
      );

      const endTime = Date.now();
      const duration = (endTime - startTime) / 1000;
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.text(); // Or response.json() if the error is JSON
        throw new Error(`HTTP error! status: ${response.status}, body: ${errorBody}`);
      }

      const data = await response.json();
      if (data && data.choices && data.choices.length > 0 && data.choices[0].message && data.choices[0].message.content) {
        let textResponse = data.choices[0].message.content;
        const modelMatch = model.match(/\/([^:]+):/);
        const modelName = modelMatch && modelMatch[1] ? modelMatch[1] : model;
        const timeString = `<p style="text-align:center;">${modelName} pretrained took - ${duration.toFixed(2)} s</p>`;

        const htmlRegex = /<html>(.*?)<\/html>/s;
        textResponse = textResponse.replace(/```html/g, '').trim();
        textResponse = textResponse.replace(/```/g, '').trim();
        const finalResponse = textResponse.match(htmlRegex);
        let resp;

        if (finalResponse != undefined && finalResponse != null && finalResponse.length > 0) {
          resp = finalResponse[0];
          if (resp.includes('</body>')) {
            resp = resp.replace('</body>', `<br/><b><i>${timeString}</i></b></body>`);
          } else {
            resp += timeString;
          }
        } else {
          resp = textResponse + timeString;
        }
        return { source: model, status: 'succeeded', response: resp };
      } else {
        console.error('Error parsing OpenRouter API response:', data);
        return { source: model, status: 'failed', error: 'Failed to parse OpenRouter response or response not OK.' };
      }
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        console.error(`OpenRouter API call for model ${model} timed out.`);
        return { source: model, status: 'failed', error: 'Request timed out' };
      }
      return { source: model, status: 'failed', error: error.message };
    }
  };

  const apiCalls = [
    // callOpenRouter(prompt, 'mistralai/mistral-7b-instruct:free'),
    // callOpenRouter(prompt, 'openai/gpt-oss-20b:free'),
    //callOpenRouter(prompt, 'qwen/qwen-2.5-vl-7b-instruct:free'),
     callOpenRouter(prompt, 'meta-llama/llama-3.3-8b-instruct:free'),
    // callOpenRouter(prompt, 'nousresearch/deephermes-3-llama-3-8b-preview:free'),
  ];

  const results = await Promise.all(apiCalls);

  const successfulResults = results.filter(result => result.status === 'succeeded');

  if (successfulResults != undefined && successfulResults.length > 0) {
    return res.json({ status: 200, json: successfulResults[0].response }, 200, {
      'Access-Control-Allow-Origin': '*',
    });
  } else {
    return res.json({ status: 200, json: 'Unable to generate answer from this source. Results will be available from other sources shortly' }, 200, {
      'Access-Control-Allow-Origin': '*',
    });
  }
}
