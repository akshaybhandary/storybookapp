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
// Note: Netlify functions only pick up new env vars after a redeploy.

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

// Lulu credentials + API base. Production keys (lulu_client_id_prod /
// lulu_client_secret_prod) win when present and imply the production
// API; otherwise the sandbox keys are used. LULU_API_BASE overrides.
// Keep in sync with lulu-order.js.
function resolveLulu() {
    const prodId = process.env.lulu_client_id_prod;
    const prodKey = process.env.lulu_client_secret_prod;
    const upperKey = process.env.LULU_CLIENT_SECRET;
    if (prodId && prodKey) {
        return { clientId: prodId, clientSecret: prodKey, base: process.env.LULU_API_BASE || 'https://api.lulu.com' };
    }
    return {
        clientId: process.env.LULU_CLIENT_ID || process.env.lulu_client_id,
        clientSecret: upperKey || process.env.lulu_client_secret,
        base: process.env.LULU_API_BASE || 'https://api.sandbox.lulu.com'
    };
}

exports.handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers: CORS_HEADERS, body: '' };
    }
    if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed' });

    const tier = event.queryStringParameters?.tier === 'softcover' ? 'softcover' : 'hardcover';
    const pagesParam = parseInt(event.queryStringParameters?.pages, 10);
    const pageCount = Number.isFinite(pagesParam)
        ? Math.min(400, Math.max(24, pagesParam))
        : PAGE_COUNTS[tier];
    const lulu = resolveLulu();
    const clientId = lulu.clientId;
    const clientSecret = lulu.clientSecret;
    if (!clientId || !clientSecret) {
        return json(200, { ...ESTIMATES[tier], source: 'estimate' });
    }

    const base = lulu.base;
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
                interior_page_count: pageCount
                // No unit field: 'PT' is rejected as an invalid choice and
                // the API default is points.
            }),
            signal: AbortSignal.timeout(20000)
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(`cover-dimensions ${res.status}: ${JSON.stringify(d).slice(0, 200)}`);
        console.log('COVER_DIMS ' + JSON.stringify(d));
        const widthPt = Number(d.width ?? d.cover_width);
        const heightPt = Number(d.height ?? d.cover_height);
        if (!widthPt || !heightPt) throw new Error('Unexpected cover-dimensions response shape');
        // Lulu returns only the total cover size. Both house SKUs use
        // 444-ppi paper, so the spine is pages / 444 in points — a few
        // points at these page counts (blank spine, full-bleed art).
        const spinePt = Math.round((pageCount / 444) * 72);
        return json(200, { widthPt, heightPt, spinePt, source: 'lulu' });
    } catch (error) {
        console.error('cover-dims error:', error);
        // Surface the failure reason (no secrets involved) so a key/realm
        // mismatch is diagnosable from outside; the estimates still let
        // the client build a cover either way.
        return json(200, { ...ESTIMATES[tier], source: 'estimate', detail: String(error.message || error).slice(0, 200) });
    }
};
