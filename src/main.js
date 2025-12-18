import fetch from 'node-fetch';

const API_TIMEOUT = 3 * 60 * 1000; // 3 minutes in milliseconds

export default async function ({ req, res }) {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (req.method === 'GET') {
    return res.text('Only POST requests are supported.', 200, {'content-type': 'text/plain', 'Access-Control-Allow-Origin': '*'});
  }

  if (req.method === 'OPTIONS') {
    return res.send('', 200, {
        'Access-Control-Allow-Origin': '*', // Or '*' for all origins (use with caution)
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', // Or include all methods your function uses
        'Access-Control-Allow-Headers': '*', // Or include all headers your requests send
    });
}


  const prompt = req.body; // Appwrite passes the body directly

  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required in the request body.' });
  }
  if (!GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY is not set.');
    return res.json({ status: 500, json: { error: 'GEMINI_API_KEY is not set.' } });
  }

  const callGemini = async (prompt) => {
    if (!GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is not set.');
    }
    const startTime = Date.now();
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
            generationConfig: {
                thinkingConfig: {
                thinkingBudget: 0
            }
        }
          }),
          signal: controller.signal,
        },
      );
      const endTime = Date.now();
      const duration = (endTime - startTime) / 1000;

      clearTimeout(timeoutId);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      // Extract text from the first part of the first candidate
      try {
        let textResponse = data.candidates[0].content.parts[0].text;
        const timeString = `<p style=\"text-align:center;\">Gemini with search took - ${duration.toFixed(2)} s</p>`;
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

        return { source: 'Gemini', status: 'succeeded', response: resp };
      } catch (parseError) {
        console.error('Error parsing Gemini API response:', parseError.message);
        return { source: 'Gemini', status: 'failed', error: 'Failed to parse Gemini response.' };
      }
    } catch (error) {
      console.error('Error calling Gemini API:', error.message);
      return { source: 'Gemini', status: 'failed', error: error.message };
    }
  };

  

  const apiCalls = [
    callGemini(prompt),
  ];

  const results = await Promise.all(apiCalls);

  const successfulResults = results.filter(result => result.status === 'succeeded');

  if (successfulResults != undefined && successfulResults.length > 0) {
    return res.json({ status: 200, json: successfulResults[0].response }, 200, {
      'Access-Control-Allow-Origin': '*',
    });
  }  else {
    return res.json({ status: 200, json:'Unable to generate answer from this source. Results will be available from other sources shortly' }, 200, {
      'Access-Control-Allow-Origin': '*',
    });
  }
}





