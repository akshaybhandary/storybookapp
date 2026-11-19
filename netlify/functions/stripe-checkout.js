// Netlify Function — Stripe Checkout for paid books.
// Creates a Checkout Session and returns { url } for the browser to redirect to.
//
// Environment variables (set in Netlify → Site settings → Environment variables):
//   STRIPE_SECRET_KEY              sk_live_... or sk_test_...
//   STRIPE_PRICE_DIGITAL           price_...  ($9 PDF)
//   STRIPE_PRICE_SOFTCOVER        price_...  ($19)
//   STRIPE_PRICE_HARDCOVER        price_...  ($29)
//
// Until those are set the function returns 501 and the UI shows a friendly
// "coming soon" message, so it is safe to deploy this at any time.

const PRICE_ENV = {
    digital: 'STRIPE_PRICE_DIGITAL',
    softcover: 'STRIPE_PRICE_SOFTCOVER',
    hardcover: 'STRIPE_PRICE_HARDCOVER'
};

const CORS_HEADERS = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
};

exports.handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers: CORS_HEADERS, body: '' };
    }
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers: CORS_HEADERS,
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    const secret = process.env.STRIPE_SECRET_KEY;

    if (!secret) {
        return {
            statusCode: 501,
            headers: CORS_HEADERS,
            body: JSON.stringify({
                error: 'not_configured',
                message: 'Payments are coming soon — checkout is not configured yet.'
            })
        };
    }

    let tier;
    try {
        ({ tier } = JSON.parse(event.body));
    } catch (e) {
        return {
            statusCode: 400,
            headers: CORS_HEADERS,
            body: JSON.stringify({ error: 'Invalid JSON body' })
        };
    }

    const priceEnvName = PRICE_ENV[tier];
    const priceId = priceEnvName && process.env[priceEnvName];
    if (!priceId) {
        return {
            statusCode: 501,
            headers: CORS_HEADERS,
            body: JSON.stringify({
                error: 'not_configured',
                message: `Payments are coming soon — no Stripe price configured for tier "${tier}".`
            })
        };
    }

    const origin = event.headers.origin || `https://${event.headers.host}` || 'https://lumifables.com';

    // Create the Checkout Session (Stripe REST API, form-encoded — no SDK needed)
    const params = new URLSearchParams({
        mode: 'payment',
        'line_items[0][price]': priceId,
        'line_items[0][quantity]': '1',
        billing_address_collection: 'auto',
        success_url: `${origin}/?checkout=success`,
        cancel_url: `${origin}/?checkout=cancelled`
    });

    try {
        const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${secret}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: params.toString()
        });
        const data = await res.json();

        if (!res.ok) {
            console.error('Stripe error:', JSON.stringify(data));
            return {
                statusCode: 502,
                headers: CORS_HEADERS,
                body: JSON.stringify({ error: data.error?.message || 'Stripe request failed' })
            };
        }

        return {
            statusCode: 200,
            headers: CORS_HEADERS,
            body: JSON.stringify({ url: data.url })
        };
    } catch (error) {
        console.error('Checkout function error:', error);
        return {
            statusCode: 500,
            headers: CORS_HEADERS,
            body: JSON.stringify({ error: 'Internal server error' })
        };
    }
};
