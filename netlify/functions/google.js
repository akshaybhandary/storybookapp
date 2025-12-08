// Netlify Function - Secure proxy for Google AI Studio API
// Node 18+ has native fetch, no need for node-fetch

const API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

exports.handler = async (event) => {
    // Only allow POST requests
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    try {
        const { endpoint, body } = JSON.parse(event.body);
        const apiKey = process.env.GOOGLE_API_KEY;

        if (!apiKey) {
            console.error('GOOGLE_API_KEY not configured');
            return {
                statusCode: 500,
                body: JSON.stringify({ error: 'API key not configured' })
            };
        }

        // Build full URL with API key
        const url = `${API_BASE_URL}/${endpoint}?key=${apiKey}`;

        console.log(`[${new Date().toISOString()}] ${endpoint} - Starting request`);
        const startTime = Date.now();

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        const duration = Date.now() - startTime;
        const data = await response.text();

        console.log(`[${new Date().toISOString()}] ${endpoint} - Completed in ${duration}ms, status: ${response.status}`);

        return {
            statusCode: response.status,
            headers: {
                'Content-Type': 'application/json'
            },
            body: data
        };

    } catch (error) {
        console.error('Function error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: 'Internal server error',
                message: error.message
            })
        };
    }
};
