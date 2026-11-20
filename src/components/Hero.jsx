import { useState } from 'react';
import { usePricing } from '../utils/pricing';
import { SAMPLE_COVER, SAMPLE_PAGE02, SAMPLE_PAGE08 } from '../assets/sampleBook';

// Submit an email to a Netlify form (forms are pre-registered in index.html)
async function submitToNetlifyForm(formName, fields) {
    const body = new URLSearchParams({ 'form-name': formName, ...fields });
    const res = await fetch('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString()
    });
    if (!res.ok) throw new Error(`Form submission failed (${res.status})`);
}

// Quick-start themes — these prefill the real story builder's "Story Theme" field.
const THEMES = [
    { icon: '🚀', label: 'Space Voyage', prompt: 'A space adventure: exploring new planets, meeting friendly aliens, and saving the day among the stars.' },
    { icon: '👑', label: 'Princess Quest', prompt: 'A brave royal quest to lift a spell and save a magical kingdom, with courage and kindness along the way.' },
    { icon: '🦖', label: 'Dinosaur World', prompt: 'A prehistoric jungle adventure where friendly dinosaurs need help solving a big problem.' },
    { icon: '🧜', label: 'Ocean Adventure', prompt: 'An underwater journey through a coral kingdom, with sea creatures who become loyal friends.' },
    { icon: '🐉', label: 'Dragon Rescue', prompt: 'Rescuing a lost baby dragon and helping it find its family — a tale of bravery and friendship.' },
    { icon: '⚽', label: 'Sports Star', prompt: 'The big game: an underdog story where practice, teamwork, and heart save the match.' }
];

export default function Hero({ onCreateStory }) {
    const pricing = usePricing();
    const [waitlistEmail, setWaitlistEmail] = useState('');
    const [waitlistState, setWaitlistState] = useState('idle'); // idle | sending | done | error

    // Quick-start builder state (handoff to the real StoryCreator via a draft)
    const [childName, setChildName] = useState('');
    const [childAge, setChildAge] = useState('');
    const [theme, setTheme] = useState(0);
    const [builderHint, setBuilderHint] = useState(null);

    const handleQuickStart = () => {
        if (!childName.trim()) {
            setBuilderHint('Add their name to start the magic ✨');
            return;
        }
        localStorage.setItem('lumifables:draft', JSON.stringify({
            childName: childName.trim(),
            childAge: childAge.trim(),
            storyPrompt: THEMES[theme].prompt
        }));
        setBuilderHint(null);
        onCreateStory();
    };

    const handleWaitlistSubmit = async (e) => {
        e.preventDefault();
        if (!waitlistEmail || !/.+@.+\..+/.test(waitlistEmail)) return;
        setWaitlistState('sending');
        try {
            await submitToNetlifyForm('waitlist', { email: waitlistEmail, source: 'landing' });
            setWaitlistState('done');
        } catch (err) {
            console.error(err);
            setWaitlistState('error');
        }
    };

    // Honest promise section — no invented claims, replaces the testimonials carousel.
    const promises = [
        {
            icon: '🔒',
            title: 'Your photos stay private',
            text: 'Photos are used only to create your book, never sold or shared. Delete any time — see our Privacy Policy.'
        },
        {
            icon: '👀',
            title: 'Preview before you pay',
            text: 'See the complete illustrated book first. Creating is free — you only pay if you love it.'
        },
        {
            icon: '🛠️',
            title: 'Made just for them',
            text: 'Your child is the hero: their look, their name, a story built around your idea.'
        }
    ];

    return (
        <section className="hero hero-magic">
            <div className="stars"></div>
            <div className="stars2"></div>
            <div className="stars3"></div>

            {/* Hero + Quick-Start Builder */}
            <div className="hero-content hero-magic-content">
                <div className="hero-badge">
                    <span className="badge-icon">🎁</span>
                    <span>Perfect Gift for Any Occasion</span>
                </div>

                <h1 className="hero-title hero-magic-title">
                    Make a storybook <span className="gradient-text">starring your kid</span> — in the next 5 minutes
                </h1>

                <p className="hero-subtitle">
                    Upload a photo, pick a theme, hit go. Their face and name woven into every page.
                    <strong> Free to make, free to read — pay only when you want it printed.</strong>
                </p>

                {/* Quick-start builder — hands off to the real story creator */}
                <div className="builder-card">
                    <div className="builder-fields">
                        <div className="builder-field">
                            <label htmlFor="builder-name">CHILD'S NAME</label>
                            <input
                                id="builder-name"
                                type="text"
                                placeholder="e.g. Maya"
                                value={childName}
                                onChange={(e) => { setChildName(e.target.value); setBuilderHint(null); }}
                            />
                        </div>
                        <div className="builder-field">
                            <label htmlFor="builder-age">THEIR AGE</label>
                            <input
                                id="builder-age"
                                type="number"
                                min="1"
                                max="16"
                                placeholder="e.g. 5"
                                value={childAge}
                                onChange={(e) => setChildAge(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="builder-field">
                        <label>PICK A THEME</label>
                        <div className="chip-row">
                            {THEMES.map((t, i) => (
                                <button
                                    key={t.label}
                                    type="button"
                                    className={`chip ${i === theme ? 'active' : ''}`}
                                    onClick={() => setTheme(i)}
                                >
                                    {t.icon} {t.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <button className="builder-go" onClick={handleQuickStart}>
                        <span className="button-content">
                            Make my book — it's free
                            <span className="sparkle">✨</span>
                        </span>
                    </button>
                    {builderHint && <p className="builder-hint">{builderHint}</p>}
                    <p className="builder-tiny">🔒 Photo stays private · No account needed · Free preview before you pay</p>
                </div>

                <div className="trust-strip">
                    <div className="trust-badge">
                        <span className="trust-icon">🔒</span>
                        <span>Your photos stay private</span>
                    </div>
                    <div className="trust-badge">
                        <span className="trust-icon">📖</span>
                        <span>Read the whole book before paying</span>
                    </div>
                    <div className="trust-badge">
                        <span className="trust-icon">🚚</span>
                        <span>Shipping to US, Canada & UK</span>
                    </div>
                </div>
            </div>

            {/* Why LumiFables */}
            <section id="why-us" className="features-section">
                <h2 className="section-title">Why parents pick LumiFables</h2>
                <p className="section-subtitle">The AI that actually keeps your child's face on every page.</p>
                <div className="features-grid">
                    <div className="feature-card">
                        <span className="feature-icon">🧒</span>
                        <h3>Looks like THEM</h3>
                        <p>Their face, hair and smile carry through every page — not a generic kid.</p>
                    </div>
                    <div className="feature-card">
                        <span className="feature-icon">📖</span>
                        <h3>Your story, not a template</h3>
                        <p>Written around your idea: their birthday, their dog, their first day of school.</p>
                    </div>
                    <div className="feature-card">
                        <span className="feature-icon">🔒</span>
                        <h3>Private by default</h3>
                        <p>The photo is used to draw the book, then deleted on request. Never sold, never trained on.</p>
                    </div>
                    <div className="feature-card">
                        <span className="feature-icon">⚡</span>
                        <h3>5 minutes, really</h3>
                        <p>No account, no design skills. Preview the finished book before paying a cent.</p>
                    </div>
                </div>
            </section>

            {/* Pricing Section — localized by region */}
            <section id="pricing" className="pricing-section">
                <h2 className="section-title">Simple, Transparent Pricing</h2>
                <p className="section-subtitle">
                    Create for free. Pay only when you love it.
                    <span className="pricing-region-note"> · Prices in {pricing.label} for your region</span>
                </p>

                <div className="pricing-cards">
                    <div className="pricing-card">
                        <div className="pricing-header">
                            <h3>Digital</h3>
                            <div className="price">
                                <span className="price-amount">{pricing.symbol}{pricing.prices.digital}</span>
                                <span className="price-period">per book</span>
                            </div>
                        </div>
                        <ul className="pricing-features">
                            <li>✓ High-res PDF download</li>
                            <li>✓ 5 or 10 illustrated pages + cover</li>
                            <li>✓ Personalized to your child</li>
                            <li>✓ Print at home or local shop</li>
                            <li>✓ Instant delivery</li>
                        </ul>
                        <button className="pricing-btn" onClick={onCreateStory}>Create Digital Book</button>
                    </div>

                    <div className="pricing-card featured">
                        <div className="featured-badge">Most Popular</div>
                        <div className="pricing-header">
                            <h3>Printed Hardcover</h3>
                            <div className="price">
                                <span className="price-amount">{pricing.symbol}{pricing.prices.hardcover}</span>
                                <span className="price-period">per book</span>
                            </div>
                        </div>
                        <ul className="pricing-features">
                            <li>✓ Premium hardcover binding</li>
                            <li>✓ Thick, glossy pages</li>
                            <li>✓ 8.5" x 8.5" size</li>
                            <li>✓ Flat-rate shipping to US, Canada & UK</li>
                            <li>✓ Gift-ready packaging</li>
                            <li>✓ Digital PDF included</li>
                        </ul>
                        <button className="pricing-btn featured-btn" onClick={onCreateStory}>Create Hardcover Book</button>
                    </div>

                    <div className="pricing-card">
                        <div className="pricing-header">
                            <h3>Softcover</h3>
                            <div className="price">
                                <span className="price-amount">{pricing.symbol}{pricing.prices.softcover}</span>
                                <span className="price-period">per book</span>
                            </div>
                        </div>
                        <ul className="pricing-features">
                            <li>✓ Quality softcover binding</li>
                            <li>✓ Matte finish pages</li>
                            <li>✓ 8.5" x 8.5" size</li>
                            <li>✓ Flat-rate shipping to US, Canada & UK</li>
                            <li>✓ Digital PDF included</li>
                        </ul>
                        <button className="pricing-btn" onClick={onCreateStory}>Create Softcover Book</button>
                    </div>
                </div>
            </section>

            {/* Sample book — a real book generated by LumiFables (AI test child,
                no real customer's book is ever shown without permission) */}
            <section id="gallery" className="gallery-preview">
                <h2 className="section-title">A real book, made by LumiFables</h2>
                <p className="section-subtitle">
                    “Maya and the Moon Garden” — generated from a single photo. The same character,
                    page after page. Your book is made to order, starring your child.
                </p>

                <div className="gallery-grid">
                    <div className="gallery-item">
                        <div className="gallery-photo">
                            <img src={SAMPLE_COVER} alt="Cover of the sample book Maya and the Moon Garden" loading="lazy" />
                            <span className="gallery-label">The cover</span>
                        </div>
                    </div>
                    <div className="gallery-item">
                        <div className="gallery-photo">
                            <img src={SAMPLE_PAGE02} alt="A page from Maya and the Moon Garden" loading="lazy" />
                            <span className="gallery-label">Inside the book</span>
                        </div>
                    </div>
                    <div className="gallery-item">
                        <div className="gallery-photo">
                            <img src={SAMPLE_PAGE08} alt="The moonflower page from Maya and the Moon Garden" loading="lazy" />
                            <span className="gallery-label">The moonflower</span>
                        </div>
                    </div>
                </div>
            </section>

            {/* Our Promise (replaces testimonials — only honest, verifiable claims) */}
            <section className="promise-section">
                <h2 className="section-title">The LumiFables Promise</h2>
                <p className="section-subtitle">What you can count on, every single book</p>
                <div className="promise-grid">
                    {promises.map((p, i) => (
                        <div key={i} className="promise-card">
                            <span className="promise-icon">{p.icon}</span>
                            <h3>{p.title}</h3>
                            <p>{p.text}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* Email capture */}
            <section className="waitlist-section">
                <h2 className="section-title">Get $5 off your first printed book</h2>
                <p className="section-subtitle">Join the list and we'll email your $5 discount code.</p>
                {waitlistState === 'done' ? (
                    <p className="waitlist-done">🎉 You're on the list — check your inbox soon!</p>
                ) : (
                    <form className="waitlist-form" onSubmit={handleWaitlistSubmit}>
                        <input
                            type="email"
                            name="email"
                            required
                            placeholder="you@email.com"
                            value={waitlistEmail}
                            onChange={(e) => setWaitlistEmail(e.target.value)}
                            disabled={waitlistState === 'sending'}
                        />
                        <button type="submit" className="cta-button secondary" disabled={waitlistState === 'sending' || !waitlistEmail}>
                            {waitlistState === 'sending' ? 'Joining...' : 'Join the List'}
                        </button>
                        {waitlistState === 'error' && (
                            <span className="waitlist-error">Something went wrong — please try again.</span>
                        )}
                        <noscript><p>This form needs JavaScript enabled.</p></noscript>
                    </form>
                )}
            </section>

            {/* Final CTA */}
            <section className="final-cta">
                <h2>Ready to Create Magic?</h2>
                <p>It takes just 5 minutes to create a story your child will treasure forever.</p>
                <button className="cta-button primary large" onClick={onCreateStory}>
                    <span className="button-content">
                        Start Creating - It's Free
                        <span className="sparkle">✨</span>
                    </span>
                </button>
                <p className="cta-note">No credit card required. Pay only when you order.</p>
            </section>

            {/* Footer */}
            <footer className="footer">
                <div className="footer-content">
                    <div className="footer-brand">
                        <span className="magic-wand">✨</span>
                        <span>LumiFables</span>
                    </div>
                    <div className="footer-links">
                        <a href="/privacy.html">Privacy Policy</a>
                        <a href="/terms.html">Terms of Service</a>
                        <a href="mailto:hello@lumifables.com">Contact Us</a>
                    </div>
                    <p className="footer-copy">© 2026 LumiFables. Made with ❤️ for families everywhere.</p>
                </div>
            </footer>
        </section>
    );
}
