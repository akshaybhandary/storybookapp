# Production Setup Guide — LumiFables

Everything in the `site-improvements` branch works **out of the box with zero
accounts**: the site runs exactly as before, plus consent flow, privacy/terms
pages, SEO, and a waitlist. The paid features light up as you add each
account below. Set env vars in **Netlify → Site settings → Environment
variables**, then redeploy.

## 1. Stripe checkout (~30 min)
1. Create a Stripe account → API keys: copy the **secret key**.
2. In Stripe → Products, create three products: Digital PDF ($9),
   Softcover ($19), Hardcover ($29). Copy each **price ID** (`price_...`).
3. Set env vars: `STRIPE_SECRET_KEY`, `STRIPE_PRICE_DIGITAL`,
   `STRIPE_PRICE_SOFTCOVER`, `STRIPE_PRICE_HARDCOVER`.
4. Deploy. The "Order Hardcover — $29" button in the story viewer now
   redirects to real Stripe Checkout. (Test cards work in test mode.)

## 2. Lulu print fulfilment (~1 hr)
1. Create a Lulu Direct (Print API) account — sandbox first.
2. Create a project for an 8.5×8.5 hardcover and softcover, note the
   **package IDs**.
3. Set: `LULU_CLIENT_ID`, `LULU_CLIENT_SECRET`, `LULU_PACKAGE_HARDCOVER`,
   `LULU_PACKAGE_SOFTCOVER`, `LULU_API_BASE` (sandbox → live when ready).
4. The remaining work (generating the print-ready PDF per Stripe order and
   calling `netlify/functions/lulu-order.js`) is scaffolded and documented in
   the function file — needs a Stripe webhook function to trigger it.

## 3. Abuse protection (recommended before any viral traffic)
1. Cloudflare dashboard → Turnstile → create a widget for `lumifables.com`.
2. Set `TURNSTILE_SECRET_KEY` (server check is already wired into
   `netlify/functions/google.js` — it activates the moment the var exists).
3. To show the widget in the UI, add the Turnstile script to `index.html`
   and pass the token in the `x-turnstile-token` header from
   `src/services/googleAPI.js`.

## 4. SEO finishing touches (do once in the Netlify UI)
- **Enable prerendering**: Netlify → Site configuration → Prerendering → ON.
  This makes the React landing fully visible to every crawler (the meta
  tags, sitemap, robots.txt and structured data are already in place).
- **Analytics**: create a Plausible site for `lumifables.com` and add their
  script tag to `index.html` (privacy-friendly, matches the brand promise).

## 5. Email
- Set up `hello@lumifables.com` (forward to your inbox — Netlify DNS + any
  mail provider, or ImprovMX free).
- Waitlist submissions appear in **Netlify → Forms**. Optionally connect
  Netlify Forms → email notification so each signup lands in your inbox.

## 6. Later: accounts & saved books (Supabase)
The app currently keeps books in browser localStorage (private by design).
When you want accounts + books-in-the-cloud:
1. Create a Supabase project, enable email auth.
2. Add a `books` table (id, user_id, title, child_name, pages jsonb, created_at)
   + storage bucket for page images.
3. Wrap `src/services/storageService.js` with a Supabase-backed adapter
   (keep the localStorage path as offline fallback).

---

## What's already shipped in this branch
- [x] Brand: LumiFables everywhere (title, navbar, footer, eBooks, API headers)
- [x] Fake 4.9/5 rating + invented testimonials removed → honest Promise section
- [x] Parental consent checkbox required before any photo is processed
- [x] Privacy Policy + Terms pages (plain-English, children's-photo aware)
- [x] SEO: titles, meta, Open Graph, Twitter cards, JSON-LD, sitemap, robots
- [x] Email capture: "$5 off" waitlist (Netlify Forms, works immediately)
- [x] Stripe checkout function (501 "coming soon" until configured)
- [x] Lulu print-order function scaffold
- [x] Turnstile hook in the Gemini proxy (dormant until key is set)
