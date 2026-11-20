// Netlify BACKGROUND Function — NanoGPT job worker.
//
// Image generation (Seedream) takes 30–80 seconds and a full story call can
// take 20–40 — far beyond the ~10s limit of a normal function. So generation
// runs here (background functions get 15 minutes): the client generates a
// jobId, POSTs { jobId, kind: 'chat' | 'image', body } to this function, and
// polls /.netlify/functions/nanogpt (the status function) for the result.
// Results are handed over through Netlify Blobs (store "nanogpt-jobs",
// key = jobId) and deleted by the status function once read.
//
// Environment variables:
//   NANOGPT_API_KEY     required (also accepts the name nano_gpt_key)
//   NANOGPT_TEXT_MODEL  optional override for the chat model
//   NANOGPT_IMAGE_MODEL optional override for the image model

const { getStore } = require('@netlify/blobs');

// This site's functions runtime does not inject the Blobs context
// automatically, so when NETLIFY_BLOBS_TOKEN is set (a site-scoped Netlify
// access token), configure the store manually.
const SITE_ID = '1a7d41f4-b6cc-4788-bd12-dfed5930b521';
function jobsStore() {
    const token = process.env.NETLIFY_BLOBS_TOKEN;
    if (token) return getStore({ name: 'nanogpt-jobs', siteID: SITE_ID, token });
    return getStore('nanogpt-jobs');
}

const CHAT_URL = 'https://api.nano-gpt.com/api/v1/chat/completions';
const IMAGE_URL = 'https://api.nano-gpt.com/v1/images/generations';

exports.handler = async (event) => {
    let jobId, kind, body;
    try {
        ({ jobId, kind, body } = JSON.parse(event.body || '{}'));
    } catch (e) {
        console.error('nanogpt-job: invalid JSON body');
        return { statusCode: 400 };
    }
    if (!jobId) {
        console.error('nanogpt-job: missing jobId');
        return { statusCode: 400 };
    }

    const store = jobsStore();
    const apiKey = process.env.NANOGPT_API_KEY || process.env.nano_gpt_key;

    async function put(record) {
        await store.setJSON(jobId, { ...record, createdAt: Date.now() });
    }

    if (!apiKey) {
        await put({ status: 'error', error: 'not_configured' });
        return { statusCode: 202 };
    }

    const headers = {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
    };

    try {
        if (kind === 'chat') {
            if (process.env.NANOGPT_TEXT_MODEL) body.model = process.env.NANOGPT_TEXT_MODEL;
            const res = await fetch(CHAT_URL, {
                method: 'POST',
                headers,
                body: JSON.stringify(body)
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                console.error('NanoGPT chat error:', res.status, JSON.stringify(data).slice(0, 300));
                await put({ status: 'error', error: data.error?.message || `NanoGPT chat failed (${res.status})` });
                return { statusCode: 202 };
            }
            await put({ status: 'done', result: data });
            return { statusCode: 202 };
        }

        if (kind === 'image') {
            if (process.env.NANOGPT_IMAGE_MODEL) body.model = process.env.NANOGPT_IMAGE_MODEL;
            const res = await fetch(IMAGE_URL, {
                method: 'POST',
                headers,
                body: JSON.stringify(body)
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                console.error('NanoGPT image error:', res.status, JSON.stringify(data).slice(0, 300));
                await put({ status: 'error', error: data.error?.message || `NanoGPT image failed (${res.status})` });
                return { statusCode: 202 };
            }

            const first = data.data?.[0];
            if (!first) {
                await put({ status: 'error', error: 'NanoGPT returned no image' });
                return { statusCode: 202 };
            }
            if (first.b64_json) {
                await put({ status: 'done', result: { dataUrl: `data:image/png;base64,${first.b64_json}` } });
                return { statusCode: 202 };
            }
            if (first.url) {
                // Signed URLs expire (~24h) — download now, hand over base64.
                const imgRes = await fetch(first.url);
                if (!imgRes.ok) {
                    await put({ status: 'error', error: 'Failed to download generated image' });
                    return { statusCode: 202 };
                }
                const buf = Buffer.from(await imgRes.arrayBuffer());
                const mime = imgRes.headers.get('content-type') || 'image/png';
                await put({ status: 'done', result: { dataUrl: `data:${mime};base64,${buf.toString('base64')}` } });
                return { statusCode: 202 };
            }
            await put({ status: 'error', error: 'NanoGPT image response had neither b64_json nor url' });
            return { statusCode: 202 };
        }

        await put({ status: 'error', error: `Unknown kind "${kind}"` });
        return { statusCode: 202 };
    } catch (error) {
        console.error('nanogpt-job error:', error);
        try {
            await put({ status: 'error', error: 'Internal error during generation' });
        } catch { /* store unavailable — client will time out and surface it */ }
        return { statusCode: 202 };
    }
};
