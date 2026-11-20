// Netlify Function — print-file staging for Lulu fulfilment.
//
// A printed book's interior + cover PDFs are built in the customer's
// browser (the book lives there), but Lulu needs public URLs to download
// them from. This function is the bridge:
//
//   POST { orderRef, part: 'interior' | 'cover', dataBase64 }
//     → stores the PDF in Netlify Blobs (store "book-files")
//   GET  ?ref=<orderRef>&part=<part>&token=<hmac>
//     → serves the PDF to Lulu. The token is HMAC-SHA256(FULFILMENT_SECRET,
//       "<ref>/<part>") — minted by lulu-order when it creates the job, so
//       the URLs are unguessable but never expire (Lulu may fetch them
//       hours after the order, during normalization).
//
// Uploads are capped by the platform request limit (~6 MB), so the client
// builds print PDFs with compressed images (a 24-page book lands ~2.5 MB).

const crypto = require('crypto');
const { getStore, connectLambda } = require('@netlify/blobs');

const CORS_HEADERS = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
};

function json(statusCode, obj) {
    return { statusCode, headers: CORS_HEADERS, body: JSON.stringify(obj) };
}

function fileToken(ref, part) {
    const secret = process.env.FULFILMENT_SECRET;
    if (!secret) return null;
    return crypto.createHmac('sha256', secret).update(`${ref}/${part}`).digest('hex');
}

exports.handler = async (event) => {
    try { connectLambda(event); } catch { /* context may already be set */ }
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers: CORS_HEADERS, body: '' };
    }

    const store = getStore('book-files');

    if (event.httpMethod === 'POST') {
        let orderRef, part, dataBase64;
        try {
            ({ orderRef, part, dataBase64 } = JSON.parse(event.body || '{}'));
        } catch {
            return json(400, { error: 'Invalid JSON body' });
        }
        if (!/^[A-Za-z0-9-]{8,64}$/.test(orderRef || '')) return json(400, { error: 'Invalid orderRef' });
        if (part !== 'interior' && part !== 'cover') return json(400, { error: 'Invalid part' });
        if (!dataBase64 || typeof dataBase64 !== 'string') return json(400, { error: 'Missing dataBase64' });
        const bytes = Buffer.from(dataBase64, 'base64');
        if (bytes.length < 1000) return json(400, { error: 'File too small to be a PDF' });
        await store.set(`${orderRef}/${part}`, bytes);
        return json(200, { ok: true, size: bytes.length });
    }

    if (event.httpMethod === 'GET') {
        const q = event.queryStringParameters || {};
        const { ref, part, token } = q;
        if (!/^[A-Za-z0-9-]{8,64}$/.test(ref || '') || (part !== 'interior' && part !== 'cover')) {
            return json(400, { error: 'Invalid ref or part' });
        }
        const expected = fileToken(ref, part);
        if (!expected) return json(501, { error: 'not_configured' });
        if (!token || token !== expected) return json(403, { error: 'Forbidden' });
        const data = await store.get(`${ref}/${part}`, { type: 'arrayBuffer' });
        if (!data) return json(404, { error: 'Not found' });
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/pdf' },
            body: Buffer.from(data).toString('base64'),
            isBase64Encoded: true
        };
    }

    return json(405, { error: 'Method not allowed' });
};
