// Netlify serverless function to proxy OpenRouter API calls
// This hides your API key from the client

export async function handler(event) {
    // Only allow POST
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    // Get API key from environment variable (set in Netlify dashboard)
    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'API key not configured' })
        };
    }

    try {
        const body = JSON.parse(event.body);

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

        const data = await response.json();

        return {
            statusCode: response.status,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify(data)
        };
    } catch (error) {
        console.error('API Error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to call API', message: error.message })
        };
    }
}
