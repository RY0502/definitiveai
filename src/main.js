import fetch from 'node-fetch';

const API_TIMEOUT = 3 * 60 * 1000; // 3 minutes in milliseconds

export default async function ({ req, res }) {

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
  const YOUR_SITE_URL = process.env.YOUR_SITE_URL || 'Definitive AI'; // Replace with your site URL
  const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;
  const YOUR_SITE_NAME = process.env.YOUR_SITE_NAME || 'Definitive AI'; // Replace with your site name
  
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
      // Extract text from the first part of the first candidate
      try {
        const textResponse = data.candidates[0].content.parts[0].text;
        return { source: 'Gemini', status: 'succeeded', response: textResponse };
      } catch (parseError) {
        console.error('Error parsing Gemini API response:', parseError.message);
        return { source: 'Gemini', status: 'failed', error: 'Failed to parse Gemini response.' };
      }
    } catch (error) {
      console.error('Error calling Gemini API:', error.message);
      return { source: 'Gemini', status: 'failed', error: error.message };    }
  };

  const callPerplexity = async (prompt) => {
      const startTime = Date.now();
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
          if (response.ok && data && data.choices && data.choices.length > 0 && data.choices[0].message && data.choices[0].message.content) {
              const textResponse = data.choices[0].message.content;
              return { source: 'Perplexity', status: 'succeeded', response: textResponse };
          } else {
              console.error('Error parsing Perplexity API response:', data);
              const endTime = Date.now();
              console.log(`Perplexity API call failed. Duration: ${endTime - startTime}ms`);
              return { source: 'Perplexity', status: 'failed', error: 'Failed to parse Perplexity response or response not OK.', duration: endTime - startTime };
          }

      } catch (error) {
          clearTimeout(timeoutId);
          const endTime = Date.now();
          console.error(`Error calling Perplexity API: ${error.message}. Duration: ${endTime - startTime}ms`);
          return { source: 'Perplexity', status: 'failed', error: error.message, duration: endTime - startTime };
      }
  }

  const callOpenRouter = async (prompt, model, isSummaryCall = false) => {
    const startTime = Date.now();
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
      if (data && data.choices && data.choices.length > 0 && data.choices[0].message && data.choices[0].message.content) {
        console.log(`OpenRouter API call for model ${model} success. Duration: ${endTime - startTime}ms`);
        const textResponse = data.choices[0].message.content;
        return { source: model, status: 'succeeded', response: textResponse };
      } else {
        console.error('Error parsing OpenRouter API response:', data);
        const endTime = Date.now();
        console.log(`OpenRouter API call for model ${model} failed. Duration: ${endTime - startTime}ms`);
        return { source: model, status: 'failed', error: 'Failed to parse OpenRouter response or response not OK.', duration: endTime - startTime };
      }
    } catch (error) {
      clearTimeout(timeoutId);
      const endTime = Date.now();
      if (error.name === 'AbortError') {
        console.error(`OpenRouter API call for model ${model} timed out. Duration: ${endTime - startTime}ms`);
        return { source: model, status: 'failed', error: 'Request timed out', duration: endTime - startTime };
      }
      console.error(`Error calling OpenRouter API for model ${model}: ${error.message}. Duration: ${endTime - startTime}ms`);
      return { source: model, status: 'failed', error: error.message, duration: endTime - startTime };
    }
  };

  // Log the start of the API calls
  console.log(`Starting API calls for prompt: ${prompt.substring(0, 100)}...`);

  const apiCalls = [
    //callGemini(prompt),
    callPerplexity(prompt),
    callOpenRouter(prompt, 'mistralai/mistral-small-3.2-24b-instruct:free'),
    //callOpenRouter(prompt, 'moonshotai/kimi-k2:free'),
    callOpenRouter(prompt, 'meta-llama/llama-3.2-3b-instruct:free'),
  ];

  const results = await Promise.all(apiCalls);

  // Log the results of each API call
  results.forEach(result => {
      console.log(`API Call Result - Source: ${result.source}, Status: ${result.status}${result.duration ? `, Duration: ${result.duration}ms` : ''}`);
  });
  const successfulResults = results.filter(result => result.status === 'succeeded');

  const sourceText = successfulResults.map((result, index) => {
    return `#Source${index + 1}\n${JSON.stringify(result.response)}\n----------------------`;
  }).join('\n');

  const finalPrompt = `${prompt}.\nTo answer this query you have ${successfulResults.length} sources. \n${sourceText}\nGenerate a definitive & comprehensive summary on the basis of these sources. Please don't include any planning or reasoning text which you use. Simply provide the actual summary. The response should be in html format which can be rendered directly on a web page. Once the html is formed, please remove the text between <think> tags from the final html response..`;

  const finalResult = await callOpenRouter(finalPrompt, 'openai/gpt-oss-20b:free');
  //const finalResult = {"status":"succeeded"};

  if (finalResult.status === 'succeeded') {
    return res.json({ status: 200, json: sourceText || 'Could not generate summary.' }, 200, {
      'Access-Control-Allow-Origin': '*',
    });
  }  else {
    return res.json({ status: 500, json: { error: 'Failed to generate final summary.', details: finalResult.error } }, 500, {
      'Access-Control-Allow-Origin': '*',
    });
  }

}