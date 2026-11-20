// Netlify Function — Lulu Direct print-on-demand order scaffold.
//
// Flow (once configured):
//   1. Stripe webhook confirms payment for a printed tier
//   2. We generate the print-ready PDF (8.5x8.5in)
//   3. We call Lulu's API to create a print job that ships to the customer
//
// Environment variables (create a Lulu Direct account first —
// https://www.lulu.com/create/ → API access gives you sandbox + live keys):
//   LULU_CLIENT_ID            from Lulu Direct API credentials
//   LULU_CLIENT_SECRET        from Lulu Direct API credentials
//   LULU_PACKAGE_HARDCOVER    package_id for the 8.5x8.5 hardcover
//   LULU_PACKAGE_SOFTCOVER    package_id for the 8.5x8.5 softcover
//   FULFILMENT_SECRET         shared secret — REQUIRED. This endpoint spends
//                             money (it places print orders), so it is
//                             default-closed: callers (the Stripe webhook)
//                             must send it as the x-fulfilment-secret header.
//                             Until it is set the endpoint returns 501.
//
// The sandbox API base is https://api.sandbox.lulu.com, live is
// https://api.lulu.com — we read LULU_API_BASE to choose.

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

    // Default-closed: this endpoint places paid print orders, so it only
    // accepts calls carrying the shared fulfilment secret (sent by the
    // Stripe webhook after a verified payment).
    const fulfilmentSecret = process.env.FULFILMENT_SECRET;
    if (!fulfilmentSecret) {
        return {
            statusCode: 501,
            headers: CORS_HEADERS,
            body: JSON.stringify({
                error: 'not_configured',
                message: 'Print fulfilment is disabled — FULFILMENT_SECRET is not set.'
            })
        };
    }
    if (event.headers['x-fulfilment-secret'] !== fulfilmentSecret) {
        return {
            statusCode: 403,
            headers: CORS_HEADERS,
            body: JSON.stringify({ error: 'Forbidden' })
        };
    }

    const { clientId, clientSecret } = {
        clientId: process.env.LULU_CLIENT_ID,
        clientSecret: process.env.LULU_CLIENT_SECRET
    };

    if (!clientId || !clientSecret) {
        return {
            statusCode: 501,
            headers: CORS_HEADERS,
            body: JSON.stringify({
                error: 'not_configured',
                message: 'Printed books are coming soon — print fulfillment is not configured yet.'
            })
        };
    }

    const base = process.env.LULU_API_BASE || 'https://api.sandbox.lulu.com';

    try {
        const body = JSON.parse(event.body || '{}');

        // 1. OAuth token
        const tokenRes = await fetch(`${base}/auth/realms/glasstree/protocol/openid-connect/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'client_credentials',
                client_id: clientId,
                client_secret: clientSecret
            }).toString()
        });
        const token = (await tokenRes.json())?.access_token;
        if (!token) throw new Error('Lulu auth failed');

        // 2. Create the print job. TODO when wiring the real flow:
        //    - upload the print-ready PDF and pass its download URL in `file_url`
        //    - map tier -> LULU_PACKAGE_HARDCOVER / LULU_PACKAGE_SOFTCOVER package_id
        //    - pass the customer's shipping address from the Stripe order
        const jobRes = await fetch(`${base}/print-jobs/`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contact_email: body.contactEmail,
                line_items: [
                    {
                        ...(body.lineItem || {})
                    }
                ],
                shipping_address: body.shippingAddress,
                shipping_level: body.shippingLevel || 'MAIL'
            })
        });

        const job = await jobRes.json();
        if (!jobRes.ok) {
            console.error('Lulu job error:', JSON.stringify(job));
            return {
                statusCode: 502,
                headers: CORS_HEADERS,
                body: JSON.stringify({ error: 'Print job creation failed' })
            };
        }

        return {
            statusCode: 200,
            headers: CORS_HEADERS,
            body: JSON.stringify({ orderId: job.id, status: job.status })
        };
    } catch (error) {
        console.error('Lulu function error:', error);
        return {
            statusCode: 500,
            headers: CORS_HEADERS,
            body: JSON.stringify({ error: 'Internal server error' })
        };
    }
};
