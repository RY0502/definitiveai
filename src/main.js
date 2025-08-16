import fetch from 'node-fetch';
import Groq from 'groq-sdk';
 
const API_TIMEOUT = 3 * 60 * 1000; // 3 minutes in milliseconds
let requestCount = 0;

export default async function ({ req, res }) {

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
  const YOUR_SITE_URL = process.env.YOUR_SITE_URL || 'Definitive AI'; // Replace with your site URL
  const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;
  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  const YOUR_SITE_NAME = process.env.YOUR_SITE_NAME || 'Definitive AI'; // Replace with your site name
  const ANOTHER_OPENROUTER_API_KEY = process.env.ANOTHER_OPENROUTER_API_KEY;
  
  requestCount++;
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

  if (!GROQ_API_KEY) {
    console.error('GROQ_API_KEY is not set.');
    // Continue without Groq if key is missing, or return error depending on requirements
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
      if (!PERPLEXITY_API_KEY) {
          throw new Error('PERPLEXITY_API_KEY is not set.');
 return { source: 'Perplexity', status: 'failed', error: 'PERPLEXITY_API_KEY is not set.' };
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
              return { source: 'Perplexity', status: 'failed', error: 'Failed to parse Perplexity response or response not OK.', duration: duration };
          }

      } catch (error) {
          clearTimeout(timeoutId);
 return { source: 'Perplexity', status: 'failed', error: error.message };
      }
  }

  const callOpenRouter = async (prompt, model, isSummaryCall = false) => {
 const controller = new AbortController();
 const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

    try {
      const apiKey = requestCount % 2 === 0 ? OPENROUTER_API_KEY : ANOTHER_OPENROUTER_API_KEY; // Assuming ANOTHER_OPENROUTER_API_KEY is defined elsewhere
      const response = await fetch(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'HTTP-Referer': YOUR_SITE_URL ,
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


      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.text(); // Or response.json() if the error is JSON
 throw new Error(`HTTP error! status: ${response.status}, body: ${errorBody}`);
      }
      //console.log(response);
      const data = await response.json();
      if (data && data.choices && data.choices.length > 0 && data.choices[0].message && data.choices[0].message.content) {
        let textResponse = data.choices[0].message.content;
        const htmlRegex = /<html>(.*?)<\/html>/s;
        textResponse = textResponse.replace(/```html/g, '').trim();
        textResponse = textResponse.replace(/```/g, '').trim();
      const finalResponse = textResponse.match(htmlRegex);
      let resp;
  //console.log(textResponse);
  //console.log(finalResponse);
  if(finalResponse!=undefined && finalResponse!=null &&finalResponse.length>0){
      resp = finalResponse[0];
  } else {
    resp = textResponse;
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
        return { source: model, status: 'failed', error: 'Request timed out', duration: performance.now() - (error.cause?.duration || 0) };
      }
 return { source: model, status: 'failed', error: error.message };
    }
  };

  const callGroq = async (prompt) => {
    if (!GROQ_API_KEY) {
      return { source: 'Groq', status: 'failed', error: 'GROQ_API_KEY is not set.' };
    }

    const groq = new Groq({
      apiKey: GROQ_API_KEY,
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

    try {
      const response = await groq.chat.completions.create({
        messages: [
          {
            role: 'user',
            content: prompt+'Include only <html> part in final response. No search metdata',
          },
        ],
        model: 'openai/gpt-oss-20b', // Use an appropriate Groq model
        stream: false, // Set to false for non-streaming response
        temperature: 1,
  max_completion_tokens: 2048,
  top_p: 1,
  reasoning_effort: "low",
  stop: null,
  tool_choice: "required",
  tools: [
    {
      type: "browser_search"
    }
  ]
      });

      clearTimeout(timeoutId);
      const data =  response;

      if (data && data.choices && data.choices.length > 0 && data.choices[0].message && data.choices[0].message.content) {
        let textResponse = data.choices[0].message.content;
        const htmlRegex = /<html>(.*?)<\/html>/s;
        textResponse = textResponse.replace(/```html/g, '').trim();
        textResponse = textResponse.replace(/```/g, '').trim();
      const finalResponse = textResponse.match(htmlRegex);
      let resp;
  //console.log(textResponse);
  //console.log(finalResponse);
  if(finalResponse!=undefined && finalResponse!=null &&finalResponse.length>0){
      resp = finalResponse[0];
  } else {
    resp = textResponse;
  }
        return { source: 'Groq', status: 'succeeded', response: resp };
      } else {
        return { source: 'Groq', status: 'failed', error: 'Failed to parse Groq response.' };
      }
    } catch (error) {
      console.log(error);
      clearTimeout(timeoutId);
      return { source: 'Groq', status: 'failed', error: error.message };
    }
  };

  const words = ['current', 'currently', 'latest', 'now', 'today', 'at the moment', 'trends', 'trending',
    'recent', 'recently', 'trend', 'live', 'present', 'presently', 'happening', 'ongoing', 'new', 
    'fresh', 'newest', 'up to', 'upto', 'real time', 'realtime', 'this',  'upcoming', 'future',
    'imminent', 'impending', 'approaching', 'coming', 'likely', 'going to', 'date', 'next'];

    let finalPrompt = prompt.toLowerCase();
    if(finalPrompt.includes('query-')){
      const queryRegex = /query-([^.]*)\./;
      const match = finalPrompt.match(queryRegex);
      finalPrompt = match[1];
      //console.log(finalPrompt);
    }

    let apiCalls;
    if(words.some(word => finalPrompt.includes(word))){
      console.log("Search call invoked....");
      apiCalls = [
        //callGemini(prompt),
       // callPerplexity(prompt),
       // callOpenRouter(prompt, 'openai/gpt-oss-20b:free'),
        callGroq(prompt),
        //callOpenRouter(prompt, 'moonshotai/kimi-k2:free'),
        //callOpenRouter(prompt, 'meta-llama/llama-3.2-3b-instruct:free'),
      ];
    } else {
      console.log("Normal call invoked....");
      apiCalls = [
        //callGemini(prompt),
       // callPerplexity(prompt),
       callOpenRouter(prompt, 'mistralai/mistral-7b-instruct:free'),
       //callOpenRouter(prompt, 'openai/gpt-oss-20b:free'),
       // callGroq(prompt),
        //callOpenRouter(prompt, 'nousresearch/deephermes-3-llama-3-8b-preview:free'),
        //callOpenRouter(prompt, 'meta-llama/llama-3.2-3b-instruct:free'),
      ];
    }

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






