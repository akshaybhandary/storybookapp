import { usePricing } from '../utils/pricing';

/**
 * Checkout client — talks to the Netlify function that creates a Stripe
 * Checkout Session. Returns { url } to redirect to, or throws an error
 * with `err.notConfigured = true` when payments haven't been set up yet
 * (so the UI can show a friendly "coming soon" message instead).
 *
 * Tiers: 'digital' | 'softcover' | 'hardcover'
 * The detected region is sent along so the function can pick the right
 * per-currency Stripe price ID.
 */
export async function startCheckout(tier, options = {}) {
    // Best-effort region (synchronous — cached or timezone-derived)
    let region = 'US';
    try {
        const raw = JSON.parse(localStorage.getItem('lumifables:region'));
        if (raw?.region) region = raw.region;
    } catch { /* ignore */ }

    const res = await fetch('/.netlify/functions/stripe-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier, region, ...options })
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

// Re-export so components can grab localized prices next to checkout calls
export { usePricing };
