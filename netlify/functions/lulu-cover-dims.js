// Netlify Function — exact Lulu cover dimensions for the client.
//
// A Lulu cover PDF must match the size Lulu computes for the product +
// interior page count (spine width). The client calls this before building
// the cover: GET ?tier=hardcover|softcover
//   → { widthPt, heightPt, spinePt, source: 'lulu' | 'estimate' }
//
// With Lulu credentials configured it asks Lulu's /cover-dimensions/
// endpoint; before that it returns clearly-marked estimates so the flow
// can still be built and tested end to end.

const CORS_HEADERS = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
};

function json(statusCode, obj) {
    return { statusCode, headers: CORS_HEADERS, body: JSON.stringify(obj) };
}

// Keep in sync with lulu-order.js.
const PACKAGES = {
    hardcover: process.env.LULU_PACKAGE_HARDCOVER || '0850X0850FCPRECW080CW444GXX',
    softcover: process.env.LULU_PACKAGE_SOFTCOVER || '0850X0850FCSTDPB060UW444MXX'
};
const PAGE_COUNTS = { hardcover: 24, softcover: 32 };

// Rough template math, used only until Lulu credentials exist.
const ESTIMATES = {
    hardcover: { widthPt: 1300, heightPt: 668, spinePt: 40 },
    softcover: { widthPt: 1247, heightPt: 630, spinePt: 6 }
};

exports.handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers: CORS_HEADERS, body: '' };
    }
    if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed' });

    const tier = event.queryStringParameters?.tier === 'softcover' ? 'softcover' : 'hardcover';
    const clientId = process.env.LULU_CLIENT_ID || process.env.lulu_client_id;
    const clientSecret = process.env.LULU_CLIENT_SECRET || process.env.lulu_client_secret;
    if (!clientId || !clientSecret) {
        return json(200, { ...ESTIMATES[tier], source: 'estimate' });
    }

    const base = process.env.LULU_API_BASE || 'https://api.sandbox.lulu.com';
    try {
        const tokenRes = await fetch(`${base}/auth/realms/glasstree/protocol/openid-connect/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'client_credentials',
                client_id: clientId,
                client_secret: clientSecret
            }).toString(),
            signal: AbortSignal.timeout(20000)
        });
        const token = (await tokenRes.json().catch(() => ({})))?.access_token;
        if (!token) throw new Error('Lulu auth failed');

        const res = await fetch(`${base}/cover-dimensions/`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                pod_package_id: PACKAGES[tier],
                interior_page_count: PAGE_COUNTS[tier],
                unit: 'PT'
            }),
            signal: AbortSignal.timeout(20000)
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(`cover-dimensions ${res.status}: ${JSON.stringify(d).slice(0, 200)}`);
        console.log('COVER_DIMS ' + JSON.stringify(d));
        const widthPt = d.width ?? d.cover_width;
        const heightPt = d.height ?? d.cover_height;
        const spinePt = d.spine_width ?? d.spine ?? 0;
        if (!widthPt || !heightPt) throw new Error('Unexpected cover-dimensions response shape');
        return json(200, { widthPt, heightPt, spinePt, source: 'lulu' });
    } catch (error) {
        console.error('cover-dims error:', error);
        return json(200, { ...ESTIMATES[tier], source: 'estimate' });
    }
};
