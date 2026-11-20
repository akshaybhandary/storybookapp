// Netlify Function — NanoGPT job STATUS endpoint.
//
// Generation itself runs in nanogpt-job-background (Seedream takes 30–80s,
// far past a normal function's ~10s limit). The client starts a job there
// with its own jobId, then polls GET /.netlify/functions/nanogpt?jobId=…
// Results live in Netlify Blobs (store "nanogpt-jobs") and are deleted here
// once read, so results don't pile up.
//
// Responses:
//   { status: 'pending' }                        — job still running
//   { status: 'done', result }                   — chat JSON or { dataUrl }
//   { status: 'error', error }                   — generation failed
//   { status: 'not_configured' }                 — NANOGPT_API_KEY not set;
//                                                  the client falls back to
//                                                  the OpenRouter path

const { getStore, connectLambda } = require('@netlify/blobs');

// These handlers run in Lambda compatibility mode, where the Blobs context
// is NOT injected automatically — connectLambda(event) wires it up from the
// invocation event. If NETLIFY_BLOBS_TOKEN is set (a Netlify personal access
// token), the store can also be configured manually as a fallback.
const SITE_ID = '1a7d41f4-b6cc-4788-bd12-dfed5930b521';
function jobsStore() {
    const token = process.env.NETLIFY_BLOBS_TOKEN;
    if (token) return getStore({ name: 'nanogpt-jobs', siteID: SITE_ID, token });
    return getStore('nanogpt-jobs');
}

const CORS_HEADERS = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
};

function json(statusCode, obj) {
    return { statusCode, headers: CORS_HEADERS, body: JSON.stringify(obj) };
}

exports.handler = async (event) => {
    try { connectLambda(event); } catch { /* manual config may still apply */ }
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers: CORS_HEADERS, body: '' };
    }
    if (event.httpMethod !== 'GET') {
        return json(405, { error: 'Method not allowed — poll with GET ?jobId=' });
    }

    if (!process.env.NANOGPT_API_KEY && !process.env.nano_gpt_key) {
        return json(200, { status: 'not_configured' });
    }

    const jobId = event.queryStringParameters?.jobId;
    if (!jobId) return json(400, { error: 'Missing jobId' });

    try {
        const store = jobsStore();
        const record = await store.get(jobId, { type: 'json' });
        if (!record) return json(200, { status: 'pending' });
        if (record.status === 'done' || record.status === 'error') {
            // One-shot handover: remove the result once it's been read.
            await store.delete(jobId).catch(() => {});
            return json(200, record);
        }
        return json(200, { status: 'pending' });
    } catch (error) {
        console.error('nanogpt status error:', error);
        // Surface the error name/message: Blobs configuration problems are
        // otherwise invisible from outside. No secrets are involved here.
        return json(500, {
            status: 'error',
            error: 'Status check failed',
            detail: `${error.name}: ${String(error.message).slice(0, 200)}`
        });
    }
};
