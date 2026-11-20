// Netlify Function — NanoGPT proxy for story generation.
//
// The client posts { kind: 'chat' | 'image', body: {...} }:
//   chat  → POST https://api.nano-gpt.com/api/v1/chat/completions
//           (story text + photo analysis; OpenAI-compatible)
//   image → POST https://api.nano-gpt.com/api/v1/images/generations
//           (Seedream image generation with the child's photo as reference)
//           The response is normalized to { dataUrl } — a base64 data URL —
//           because NanoGPT's signed image URLs expire after 24 hours and
//           the app keeps books in the browser long-term.
//
// Environment variables:
//   NANOGPT_API_KEY     required — until set, returns 501 and the client
//                       falls back to the OpenRouter path automatically.
//                       Also accepts the name nano_gpt_key (whichever is set).
//   NANOGPT_TEXT_MODEL  optional override for chat model
//   NANOGPT_IMAGE_MODEL optional override for image model
//
// Like the other functions: no key material is ever logged.

// Chat lives under /api/v1; image generation under /v1 (both verified
// against the live API — they are not interchangeable).
const CHAT_URL = 'https://api.nano-gpt.com/api/v1/chat/completions';
const IMAGE_URL = 'https://api.nano-gpt.com/v1/images/generations';

const CORS_HEADERS = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
};

function json(statusCode, obj) {
    return { statusCode, headers: CORS_HEADERS, body: JSON.stringify(obj) };
}

exports.handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers: CORS_HEADERS, body: '' };
    }
    if (event.httpMethod !== 'POST') {
        return json(405, { error: 'Method not allowed' });
    }

    const apiKey = process.env.NANOGPT_API_KEY || process.env.nano_gpt_key;
    if (!apiKey) {
        return json(501, {
            error: 'not_configured',
            message: 'NanoGPT generation is not configured yet (NANOGPT_API_KEY missing).'
        });
    }

    let kind, body;
    try {
        ({ kind, body } = JSON.parse(event.body || '{}'));
    } catch (e) {
        return json(400, { error: 'Invalid JSON body' });
    }
    if (!body || typeof body !== 'object') {
        return json(400, { error: 'Missing request body' });
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
                return json(res.status, { error: data.error?.message || 'NanoGPT chat request failed' });
            }
            return json(200, data);
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
                return json(res.status, { error: data.error?.message || 'NanoGPT image request failed' });
            }

            const first = data.data?.[0];
            if (!first) return json(502, { error: 'NanoGPT returned no image' });

            if (first.b64_json) {
                return json(200, { dataUrl: `data:image/png;base64,${first.b64_json}` });
            }
            if (first.url) {
                // Signed URLs expire (~24h) — download now and return base64.
                const imgRes = await fetch(first.url);
                if (!imgRes.ok) return json(502, { error: 'Failed to download generated image' });
                const buf = Buffer.from(await imgRes.arrayBuffer());
                const mime = imgRes.headers.get('content-type') || 'image/png';
                return json(200, { dataUrl: `data:${mime};base64,${buf.toString('base64')}` });
            }
            return json(502, { error: 'NanoGPT image response had neither b64_json nor url' });
        }

        return json(400, { error: `Unknown kind "${kind}" — expected "chat" or "image"` });
    } catch (error) {
        console.error('NanoGPT function error:', error);
        return json(500, { error: 'Internal server error' });
    }
};
