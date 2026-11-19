// Netlify Function — Stripe Checkout for paid books.
// Creates a Checkout Session and returns { url } for the browser to redirect to.
//
// Environment variables (set in Netlify → Site settings → Environment variables):
//   STRIPE_SECRET_KEY              sk_live_... or sk_test_...
//   STRIPE_PRICE_DIGITAL           price_... or per-region: "US:price_a,CA:price_b,GB:price_c"
//   STRIPE_PRICE_SOFTCOVER         same format
//   STRIPE_PRICE_HARDCOVER         same format
//
// The client sends { tier, region } where region is US | CA | GB. Prices are
// localized per region (USD/CAD/GBP), so configure one Stripe price per
// currency. A bare price ID (no region prefix) is used for every region.
//
// Until those are set the function returns 501 and the UI shows a friendly
// "coming soon" message, so it is safe to deploy this at any time.

const PRICE_ENV = {
    digital: 'STRIPE_PRICE_DIGITAL',
    softcover: 'STRIPE_PRICE_SOFTCOVER',
    hardcover: 'STRIPE_PRICE_HARDCOVER'
};

const VALID_REGIONS = new Set(['US', 'CA', 'GB']);

// Resolve the price ID for the given region. Supports both formats:
//   "price_123"                       → same ID for every region
//   "US:price_1,CA:price_2,GB:price_3" → per-region IDs
function resolvePriceId(raw, region) {
    const parts = String(raw).split(',').map(s => s.trim()).filter(Boolean);
    for (const part of parts) {
        const [reg, id] = part.split(':').map(s => s && s.trim());
        if (id) {
            if (!reg) return id;                     // bare price ID → universal
            if (reg === region) return id;           // region match
        } else if (part) {
            return part;                             // no colon at all → universal
        }
    }
    return null;
}

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

    let tier, region;
    try {
        ({ tier, region } = JSON.parse(event.body));
    } catch (e) {
        return {
            statusCode: 400,
            headers: CORS_HEADERS,
            body: JSON.stringify({ error: 'Invalid JSON body' })
        };
    }

    if (!VALID_REGIONS.has(region)) region = 'US';

    const priceEnvName = PRICE_ENV[tier];
    const priceId = priceEnvName && resolvePriceId(process.env[priceEnvName] || '', region);
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
