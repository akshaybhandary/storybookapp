import { useEffect, useState } from 'react';

/**
 * Regional pricing — prices are localized by the visitor's country.
 * USD is base; CAD/GBP are rounded to psychologically-clean numbers
 * with a small FX buffer built in.
 */
const REGIONS = {
    US: { currency: 'USD', symbol: '$', label: 'USD', prices: { digital: 12, softcover: 29, hardcover: 39 } },
    CA: { currency: 'CAD', symbol: '$', label: 'CAD', prices: { digital: 16, softcover: 39, hardcover: 52 } },
    GB: { currency: 'GBP', symbol: '£', label: 'GBP', prices: { digital: 10, softcover: 24, hardcover: 32 } },
};
const DEFAULT_REGION = 'US';
const CACHE_KEY = 'lumifables:region';
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24h

function regionFromTimezone(tz) {
    if (!tz) return DEFAULT_REGION;
    if (/^America\/(Toronto|Vancouver|Montreal|Calgary|Edmonton|Winnipeg|Halifax|Ottawa|Quebec|Saskatoon|Regina|St_Johns|Thunder_Bay|Yellowknife|Whitehorse|Dawson_Creek|Victoria)/.test(tz)) return 'CA';
    if (/^(Europe\/(London|Belfast)|GMT)/.test(tz)) return 'GB';
    return DEFAULT_REGION;
}

function cachedRegion() {
    try {
        const raw = JSON.parse(localStorage.getItem(CACHE_KEY));
        if (raw && Date.now() - raw.at < CACHE_TTL && REGIONS[raw.region]) return raw.region;
    } catch { /* ignore */ }
    return null;
}

async function detectRegion() {
    const cached = cachedRegion();
    if (cached) return cached;

    let guess = DEFAULT_REGION;
    try {
        guess = regionFromTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
    } catch { /* ignore */ }

    // IP geolocation (free, keyless). Fail silently — timezone guess is the fallback.
    try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 2500);
        const res = await fetch('https://ipapi.co/json/', { signal: ctrl.signal });
        clearTimeout(timer);
        if (res.ok) {
            const data = await res.json();
            if (REGIONS[data.country_code]) {
                localStorage.setItem(CACHE_KEY, JSON.stringify({ region: data.country_code, at: Date.now() }));
                return data.country_code;
            }
        }
    } catch { /* ignore */ }

    return guess;
}

/**
 * Localized pricing hook.
 * Returns { region, currency, symbol, label, prices: {digital, softcover, hardcover} }.
 * The first render uses timezone as a best guess (no flash of wrong prices);
 * the IP lookup refines it and caches for 24h.
 */
export function usePricing() {
    const [region, setRegion] = useState(() => {
        const cached = cachedRegion();
        if (cached) return cached;
        try {
            return regionFromTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
        } catch {
            return DEFAULT_REGION;
        }
    });

    useEffect(() => {
        let cancelled = false;
        detectRegion().then((r) => { if (!cancelled && r !== region) setRegion(r); });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const conf = REGIONS[region] || REGIONS[DEFAULT_REGION];
    return {
        region,
        currency: conf.currency,
        symbol: conf.symbol,
        label: conf.label,
        prices: conf.prices,
    };
}

/** Format a tier price for the given region config, e.g. formatPrice(p, 'hardcover') → "$39" */
export function formatPrice(pricing, tier) {
    const conf = REGIONS[pricing.region] || REGIONS[DEFAULT_REGION];
    return `${conf.symbol}${conf.prices[tier]}`;
}
