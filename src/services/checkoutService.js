/**
 * Checkout client — talks to the Netlify function that creates a Stripe
 * Checkout Session. Returns { url } to redirect to, or throws an error
 * with `err.notConfigured = true` when payments haven't been set up yet
 * (so the UI can show a friendly "coming soon" message instead).
 *
 * Tiers: 'digital' ($9 PDF) | 'softcover' ($19) | 'hardcover' ($29)
 */
export async function startCheckout(tier, options = {}) {
    const res = await fetch('/netlify/functions/stripe-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier, ...options })
    });

    const data = await res.json().catch(() => ({}));

    if (res.status === 501) {
        const err = new Error(data.message || 'Checkout is coming soon.');
        err.notConfigured = true;
        throw err;
    }
    if (!res.ok) {
        throw new Error(data.error || 'Checkout failed. Please try again.');
    }
    return data; // { url }
}
