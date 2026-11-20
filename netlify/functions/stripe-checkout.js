// Netlify Function — Stripe Checkout for paid books.
// Creates a Checkout Session and returns { url } for the browser to redirect to.
//
// Environment variables (set in Netlify → Site settings → Environment variables):
//   STRIPE_SECRET_KEY              sk_live_... or sk_test_...
//   STRIPE_PRICE_DIGITAL           price_... or per-region: "US:price_a,CA:price_b,GB:price_c"
//   STRIPE_PRICE_SOFTCOVER         same format
//   STRIPE_PRICE_HARDCOVER         same format
//
// Notes:
//   - Stripe Tax must be ACTIVE in the same Stripe mode (test/live) as the
//     secret key, or session creation fails — automatic_tax is enabled below.
//   - Print tiers collect a shipping address and charge a flat shipping rate
//     (SHIPPING_FLAT_CENTS, in the session currency). Adjust the rate in one
//     place here when real Lulu shipping costs are known.
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

// Flat shipping for print tiers, in the session currency's minor units
// (699 = $6.99 / CA$6.99 / £6.99). Placeholder until Lulu's real per-region
// shipping is wired — change here only.
const SHIPPING_FLAT_CENTS = 699;

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

    let tier, region, bookRef;
    try {
        ({ tier, region, bookRef } = JSON.parse(event.body));
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

    const isPrint = tier === 'softcover' || tier === 'hardcover';

    // Create the Checkout Session (Stripe REST API, form-encoded — no SDK needed)
    const params = new URLSearchParams({
        mode: 'payment',
        'line_items[0][price]': priceId,
        'line_items[0][quantity]': '1',
        billing_address_collection: 'auto',
        allow_promotion_codes: 'true',
        'automatic_tax[enabled]': 'true',
        'metadata[tier]': tier,
        'metadata[region]': region,
        'payment_intent_data[metadata][tier]': tier,
        'payment_intent_data[metadata][region]': region,
        ...(bookRef ? {
            'metadata[book_ref]': String(bookRef).slice(0, 64),
            'payment_intent_data[metadata][book_ref]': String(bookRef).slice(0, 64)
        } : {}),
        success_url: `${origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/?checkout=cancelled`
    });

    // Print orders need a delivery address for the print partner, and carry a
    // flat shipping charge (session currency) until real rates are wired.
    if (isPrint) {
        params.set('shipping_address_collection[allowed_countries][0]', 'US');
        params.set('shipping_address_collection[allowed_countries][1]', 'CA');
        params.set('shipping_address_collection[allowed_countries][2]', 'GB');
        params.set('shipping_options[0][shipping_rate_data][type]', 'fixed_amount');
        // Required when automatic_tax is on, or session creation fails.
        params.set('shipping_options[0][shipping_rate_data][tax_behavior]', 'exclusive');
        params.set('shipping_options[0][shipping_rate_data][fixed_amount][amount]', String(SHIPPING_FLAT_CENTS));
        params.set('shipping_options[0][shipping_rate_data][fixed_amount][currency]', region === 'CA' ? 'cad' : region === 'GB' ? 'gbp' : 'usd');
        params.set('shipping_options[0][shipping_rate_data][display_name]', 'Standard shipping');
        params.set('shipping_options[0][shipping_rate_data][delivery_estimate][minimum][unit]', 'business_day');
        params.set('shipping_options[0][shipping_rate_data][delivery_estimate][minimum][value]', '7');
        params.set('shipping_options[0][shipping_rate_data][delivery_estimate][maximum][unit]', 'business_day');
        params.set('shipping_options[0][shipping_rate_data][delivery_estimate][maximum][value]', '14');
    }

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
