// Netlify Function — Stripe webhook receiver.
//
// Register this endpoint in Stripe → Developers → Webhooks:
//   URL:    https://lumifables.com/.netlify/functions/stripe-webhook
//   Events: checkout.session.completed
// Then set the endpoint's signing secret as STRIPE_WEBHOOK_SECRET below.
//
// Environment variables:
//   STRIPE_WEBHOOK_SECRET   whsec_... (from the webhook endpoint)
//   FULFILMENT_SECRET       shared secret used when calling lulu-order
//   LULU_CLIENT_ID          (optional — print dispatch only runs when set)
//
// On checkout.session.completed we:
//   1. Verify the Stripe signature (HMAC-SHA256, no SDK needed)
//   2. Log a structured ORDER_RECEIVED record (function logs are the order
//      book until a real datastore exists)
//   3. For print tiers, hand the order to the lulu-order function — which
//      stays inert until Lulu credentials + package IDs are configured
//
// Until STRIPE_WEBHOOK_SECRET is set the function returns 501, so it is
// safe to deploy at any time.

const crypto = require('crypto');

const CORS_HEADERS = {
    'Content-Type': 'application/json'
};

// Verify a Stripe webhook signature against the raw request body.
// Header format: t=<timestamp>,v1=<signature>[,v1=<older-signature>...]
function verifySignature(rawBody, header, secret, toleranceSeconds = 300) {
    if (!header) return false;
    const parts = Object.fromEntries(
        header.split(',').map(kv => {
            const idx = kv.indexOf('=');
            return [kv.slice(0, idx).trim(), kv.slice(idx + 1).trim()];
        })
    );
    const timestamp = parts.t;
    const signature = parts.v1;
    if (!timestamp || !signature) return false;

    const age = Math.abs(Date.now() / 1000 - Number(timestamp));
    if (!Number.isFinite(age) || age > toleranceSeconds) return false;

    const expected = crypto
        .createHmac('sha256', secret)
        .update(`${timestamp}.${rawBody}`, 'utf8')
        .digest('hex');

    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(signature, 'utf8');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers: CORS_HEADERS,
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) {
        return {
            statusCode: 501,
            headers: CORS_HEADERS,
            body: JSON.stringify({
                error: 'not_configured',
                message: 'Webhook is not configured yet (STRIPE_WEBHOOK_SECRET missing).'
            })
        };
    }

    const rawBody = event.isBase64Encoded
        ? Buffer.from(event.body || '', 'base64').toString('utf8')
        : (event.body || '');

    if (!verifySignature(rawBody, event.headers['stripe-signature'], secret)) {
        console.error('Stripe webhook: signature verification FAILED');
        return {
            statusCode: 400,
            headers: CORS_HEADERS,
            body: JSON.stringify({ error: 'Invalid signature' })
        };
    }

    let stripeEvent;
    try {
        stripeEvent = JSON.parse(rawBody);
    } catch (e) {
        return {
            statusCode: 400,
            headers: CORS_HEADERS,
            body: JSON.stringify({ error: 'Invalid JSON body' })
        };
    }

    if (stripeEvent.type !== 'checkout.session.completed') {
        return {
            statusCode: 200,
            headers: CORS_HEADERS,
            body: JSON.stringify({ received: true, ignored: stripeEvent.type })
        };
    }

    const session = stripeEvent.data.object;
    const shipping = session.shipping_details || session.collected_information?.shipping_details || null;
    const order = {
        sessionId: session.id,
        paymentIntent: session.payment_intent,
        tier: session.metadata?.tier || 'unknown',
        region: session.metadata?.region || 'unknown',
        amountTotal: session.amount_total,
        currency: session.currency,
        email: session.customer_details?.email || null,
        customerName: session.customer_details?.name || shipping?.name || null,
        shippingAddress: shipping?.address || null,
        phone: session.customer_details?.phone || null,
        bookRef: session.metadata?.book_ref || null,
        paymentStatus: session.payment_status
    };

    // The order record. Function logs are the system of record for now;
    // a datastore/email step can subscribe to this same shape later.
    console.log('ORDER_RECEIVED ' + JSON.stringify(order));

    // Print fulfilment hand-off. lulu-order is default-closed: it needs
    // FULFILMENT_SECRET on both sides plus Lulu credentials before it will
    // do anything, so this call is safe before print is fully wired.
    const isPrint = order.tier === 'softcover' || order.tier === 'hardcover';
    const hasLuluCreds = process.env.LULU_CLIENT_ID || process.env.lulu_client_id;
    if (isPrint && hasLuluCreds && process.env.FULFILMENT_SECRET && process.env.URL) {
        try {
            const res = await fetch(`${process.env.URL}/.netlify/functions/lulu-order`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-fulfilment-secret': process.env.FULFILMENT_SECRET
                },
                body: JSON.stringify({
                    contactEmail: order.email,
                    tier: order.tier,
                    stripeSessionId: order.sessionId,
                    shippingAddress: order.shippingAddress,
                    shippingName: order.customerName,
                    phone: order.phone,
                    bookRef: order.bookRef
                })
            });
            const result = await res.json().catch(() => ({}));
            console.log(`LULU_DISPATCH session=${order.sessionId} status=${res.status} result=${JSON.stringify(result)}`);
        } catch (err) {
            // Never fail the webhook for a fulfilment error — Stripe would
            // retry and double-record. The failure is loud in the logs.
            console.error(`LULU_DISPATCH_FAILED session=${order.sessionId}`, err);
        }
    }

    return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({ received: true, sessionId: order.sessionId })
    };
};
