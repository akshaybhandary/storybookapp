// Netlify serverless function to proxy OpenRouter API calls
// This hides your API key from the client

export async function handler(event) {
    const requestId = Date.now().toString(36);
    console.log(`[${requestId}] === NEW REQUEST ===`);
    console.log(`[${requestId}] Method: ${event.httpMethod}`);
    console.log(`[${requestId}] Origin: ${event.headers.origin}`);

    // Only allow POST
    if (event.httpMethod !== 'POST') {
        console.log(`[${requestId}] ERROR: Method not allowed`);
        return {
            statusCode: 405,
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    // Get API key from environment variable (set in Netlify dashboard)
    const apiKey = process.env.OPENROUTER_API_KEY;

    console.log(`[${requestId}] API Key Check:`);
    console.log(`[${requestId}]   - Exists: ${!!apiKey}`);
    console.log(`[${requestId}]   - Length: ${apiKey?.length || 0}`);
    console.log(`[${requestId}]   - Starts with: ${apiKey?.substring(0, 10) || 'N/A'}`);
    console.log(`[${requestId}]   - All env vars: ${Object.keys(process.env).join(', ')}`);

    if (!apiKey) {
        console.error(`[${requestId}] CRITICAL: API key not configured`);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                error: 'API key not configured',
                requestId,
                debug: 'Check Netlify environment variables for OPENROUTER_API_KEY'
            })
        };
    }

    try {
        const body = JSON.parse(event.body);
        console.log(`[${requestId}] Request body parsed successfully`);
        console.log(`[${requestId}] Model: ${body.model}`);
        console.log(`[${requestId}] Messages count: ${body.messages?.length || 0}`);

        const startTime = Date.now();
        console.log(`[${requestId}] Calling OpenRouter API...`);

        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': event.headers.origin || 'https://storybookmagic.netlify.app',
                'X-Title': 'StoryBook Magic'
            },
            body: JSON.stringify(body)
        });

        const duration = Date.now() - startTime;
        console.log(`[${requestId}] OpenRouter responded in ${duration}ms`);
        console.log(`[${requestId}] Response status: ${response.status}`);
        console.log(`[${requestId}] Response headers:`, Object.fromEntries(response.headers.entries()));

        const data = await response.json();

        if (!response.ok) {
            console.error(`[${requestId}] OpenRouter API Error:`);
            console.error(`[${requestId}]   Status: ${response.status}`);
            console.error(`[${requestId}]   Error data:`, JSON.stringify(data, null, 2));
        } else {
            console.log(`[${requestId}] Success! Tokens used: ${data.usage?.total_tokens || 'unknown'}`);
        }

        return {
            statusCode: response.status,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'X-Request-Id': requestId
            },
            body: JSON.stringify({
                ...data,
                _debug: {
                    requestId,
                    duration,
                    timestamp: new Date().toISOString()
                }
            })
        };
    } catch (error) {
        console.error(`[${requestId}] EXCEPTION:`, error);
        console.error(`[${requestId}] Stack:`, error.stack);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'X-Request-Id': requestId
            },
            body: JSON.stringify({
                error: 'Failed to call API',
                message: error.message,
                requestId,
                stack: error.stack?.split('\n').slice(0, 3).join('\n')
            })
        };
    }
}
