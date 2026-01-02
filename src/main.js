import fetch from 'node-fetch';

const API_TIMEOUT = 3 * 60 * 1000; // 3 minutes in milliseconds

export default async function ({ req, res }) {
  const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;
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


  let prompt = req.bodyText; // Appwrite passes the body directly

  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required in the request body.' });
  }

  prompt = prompt + ' If html is not possible, provide response in markdown format. Do not include any extra commentary other than the asked question response.'

  if (!PERPLEXITY_API_KEY) {
    console.error('PERPLEXITY_API_KEY is not set.');
    return res.json({ status: 500, json: { error: 'PERPLEXITY_API_KEY is not set.' } });
  }

  const callPerplexity = async (prompt) => {
    if (!PERPLEXITY_API_KEY) {
      throw new Error('PERPLEXITY_API_KEY is not set.');
      return { source: 'Perplexity', status: 'failed', error: 'PERPLEXITY_API_KEY is not set.' };
    }
    const startTime = Date.now();
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
      const endTime = Date.now();
      const duration = (endTime - startTime) / 1000;

      clearTimeout(timeoutId);
      const data = await response.json();

      if (response.ok && data && data.choices && data.choices.length > 0 && data.choices[0].message && data.choices[0].message.content) {
        let textResponse = data.choices[0].message.content;
        const timeString = `<p style=\"text-align:center;\">Perplexity search took - ${duration.toFixed(2)} s</p>`;
        const htmlRegex = /<html>(.*?)<\/html>/s;
        textResponse = textResponse.replace(/```html/g, '').trim();
        textResponse = textResponse.replace(/```/g, '').trim();
        const finalResponse = textResponse.match(htmlRegex);
        let resp;

        if (finalResponse != undefined && finalResponse != null && finalResponse.length > 0) {
          resp = finalResponse[0];
          if (resp.includes('</body>')) {
            resp = resp.replace('</body>', `<br/><i><b>${timeString}</i></b></body>`);
          } else {
            resp += timeString;
          }
        } else {
          resp = textResponse + timeString;
        }
        return { source: 'Perplexity', status: 'succeeded', response: resp };
      } else {
        console.error('Error parsing Perplexity API response:', data);
        return { source: 'Perplexity', status: 'failed', error: 'Failed to parse Perplexity response or response not OK.' };
      }

    } catch (error) {
      clearTimeout(timeoutId);
      return { source: 'Perplexity', status: 'failed', error: error.message };
    }
  }

  const apiCalls = [
    callPerplexity(prompt),
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





