// Netlify Function — Lulu Print API order placement.
//
// Called ONLY by the Stripe webhook after a verified payment for a print
// tier. Default-closed: the caller must send the FULFILMENT_SECRET as the
// x-fulfilment-secret header, because this endpoint spends money.
//
// Flow:
//   1. OAuth (client_credentials) against the Lulu API
//   2. Cost calculation for the exact job — validates the SKU, the address
//      and the shipping level before anything is committed
//   3. Create the print job pointing at the book's PDF URLs (book-files
//      function, HMAC-token guarded; the client uploaded the PDFs before
//      checkout and passed the reference through Stripe metadata)
//
// Environment variables:
//   LULU_CLIENT_ID / LULU_CLIENT_SECRET   Lulu API credentials (the
//       lowercase spellings lulu_client_id / lulu_client_secret also work)
//   LULU_API_BASE        default https://api.sandbox.lulu.com
//                        (live: https://api.lulu.com)
//   LULU_PACKAGE_HARDCOVER / LULU_PACKAGE_SOFTCOVER   pod_package_id SKUs
//   LULU_SHIPPING_LEVEL  default MAIL
//   LULU_PRODUCTION_DELAY_MIN  default 60 (cancel window before printing)
//   FULFILMENT_SECRET    required shared secret (see above)
//   URL                  the site's own URL (Netlify provides it)

const crypto = require('crypto');
const { getStore, connectLambda } = require('@netlify/blobs');

// Record the outcome where it can be read back: book-files serves
// part=status for an order ref (job id + status only — nothing sensitive).
async function recordStatus(event, ref, data) {
    try {
        try { connectLambda(event); } catch { /* already connected */ }
        const store = getStore('book-files');
        await store.setJSON(`${ref}/status`, { ...data, updatedAt: new Date().toISOString() });
    } catch (err) {
        console.error('status record failed:', err);
    }
}

// The client uploads the interior's real page count as meta alongside the
// PDFs (a full-length story runs past the tier minimum). Fall back to the
// tier minimum when no meta was stored.
async function readPageCount(event, ref, tier) {
    try {
        try { connectLambda(event); } catch { /* already connected */ }
        const store = getStore('book-files');
        const meta = await store.get(`${ref}/meta`, { type: 'json' });
        const n = Number(meta?.pageCount);
        if (Number.isFinite(n) && n >= 24 && n <= 400) return Math.round(n);
    } catch { /* fall through to the tier default */ }
    return PAGE_COUNTS[tier];
}

const CORS_HEADERS = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
};

function json(statusCode, obj) {
    return { statusCode, headers: CORS_HEADERS, body: JSON.stringify(obj) };
}

// 8.5x8.5in: hardcover = Premium Color, 80# coated, casewrap, gloss;
// softcover = Standard Color, 60# uncoated, paperback, matte.
// Interior page counts must match what the client builds (StoryViewer):
// hardcover minimum is 24, paperback needs 32 for a printable spine.
const PACKAGES = {
    hardcover: process.env.LULU_PACKAGE_HARDCOVER || '0850X0850FCPRECW080CW444GXX',
    softcover: process.env.LULU_PACKAGE_SOFTCOVER || '0850X0850FCSTDPB060UW444MXX'
};
const PAGE_COUNTS = { hardcover: 24, softcover: 32 };

function fileUrl(siteBase, ref, part) {
    const token = crypto.createHmac('sha256', process.env.FULFILMENT_SECRET).update(`${ref}/${part}`).digest('hex');
    return `${siteBase}/.netlify/functions/book-files?ref=${encodeURIComponent(ref)}&part=${part}&token=${token}`;
}

function mapAddress(body) {
    const a = body.shippingAddress || {};
    const addr = {
        name: body.shippingName || 'Customer',
        street1: a.line1 || '',
        city: a.city || '',
        state_code: a.state || '',
        postcode: a.postal_code || '',
        country_code: a.country || ''
    };
    if (a.line2) addr.street2 = a.line2;
    if (body.phone) addr.phone_number = body.phone;
    return addr;
}

exports.handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers: CORS_HEADERS, body: '' };
    }
    if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

    const fulfilmentSecret = process.env.FULFILMENT_SECRET;
    if (!fulfilmentSecret) return json(501, { error: 'not_configured', message: 'Print fulfilment is disabled.' });
    if (event.headers['x-fulfilment-secret'] !== fulfilmentSecret) return json(403, { error: 'Forbidden' });

    const clientId = process.env.LULU_CLIENT_ID || process.env.lulu_client_id;
    const clientSecret = process.env.LULU_CLIENT_SECRET || process.env.lulu_client_secret;
    if (!clientId || !clientSecret) {
        return json(501, { error: 'not_configured', message: 'Lulu credentials are not set.' });
    }

    let body;
    try {
        body = JSON.parse(event.body || '{}');
    } catch {
        return json(400, { error: 'Invalid JSON body' });
    }

    const tier = body.tier === 'softcover' ? 'softcover' : 'hardcover';
    const bookRef = body.bookRef;
    if (!bookRef) return json(422, { error: 'missing_book_ref', message: 'No book files were uploaded for this order.' });
    const pageCount = await readPageCount(event, bookRef, tier);
    if (!process.env.URL) return json(501, { error: 'not_configured', message: 'Site URL env missing.' });

    const base = process.env.LULU_API_BASE || 'https://api.sandbox.lulu.com';
    const shippingLevel = process.env.LULU_SHIPPING_LEVEL || 'MAIL';
    const shippingAddress = mapAddress(body);
    const lineItem = {
        external_id: bookRef,
        title: 'LumiFables Personalized Storybook',
        cover: { source_url: fileUrl(process.env.URL, bookRef, 'cover') },
        interior: { source_url: fileUrl(process.env.URL, bookRef, 'interior') },
        pod_package_id: PACKAGES[tier],
        quantity: 1
    };

    try {
        // 1. OAuth
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
        if (!token) throw new Error(`Lulu auth failed (${tokenRes.status})`);
        const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

        // 2. Cost calculation — validates SKU/address/shipping before ordering
        const costRes = await fetch(`${base}/print-job-cost-calculations/`, {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify({
                line_items: [{ pod_package_id: PACKAGES[tier], page_count: pageCount, quantity: 1 }],
                shipping_address: shippingAddress,
                shipping_level: shippingLevel
            }),
            signal: AbortSignal.timeout(30000)
        });
        const cost = await costRes.json().catch(() => ({}));
        if (!costRes.ok) {
            console.error('LULU_COST_FAILED ' + JSON.stringify(cost).slice(0, 500));
            await recordStatus(event, bookRef, { ok: false, stage: 'cost_calculation', detail: cost });
            return json(502, { error: 'cost_calculation_failed', detail: cost });
        }
        console.log(`LULU_COST session=${body.stripeSessionId || ''} total=${cost.total_cost_incl_tax ?? cost.total_cost_excl_tax ?? '?'} ${cost.currency || ''}`);

        // 3. Create the print job
        const jobRes = await fetch(`${base}/print-jobs/`, {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify({
                external_id: body.stripeSessionId || bookRef,
                contact_email: body.contactEmail || 'hello@lumifables.com',
                production_delay_minutes: Number(process.env.LULU_PRODUCTION_DELAY_MIN || 60),
                line_items: [lineItem],
                shipping_address: shippingAddress,
                shipping_level: shippingLevel
            }),
            signal: AbortSignal.timeout(30000)
        });
        const job = await jobRes.json().catch(() => ({}));
        if (!jobRes.ok) {
            console.error('LULU_JOB_FAILED ' + JSON.stringify(job).slice(0, 500));
            await recordStatus(event, bookRef, { ok: false, stage: 'print_job', detail: job });
            return json(502, { error: 'print_job_failed', detail: job });
        }
        console.log(`LULU_JOB_CREATED session=${body.stripeSessionId || ''} job=${job.id} status=${job.status}`);
        await recordStatus(event, bookRef, { ok: true, luluJobId: job.id, status: job.status });
        return json(200, { orderId: job.id, status: job.status });
    } catch (error) {
        console.error('lulu-order error:', error);
        return json(500, { error: 'Internal error', detail: error.message });
    }
};
