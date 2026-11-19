import { useState } from 'react';

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

export default function Hero({ onCreateStory }) {
    const [waitlistEmail, setWaitlistEmail] = useState('');
    const [waitlistState, setWaitlistState] = useState('idle'); // idle | sending | done | error

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
        <section className="hero">
            <div className="stars"></div>
            <div className="stars2"></div>
            <div className="stars3"></div>

            {/* Hero Content */}
            <div className="hero-content">
                <div className="hero-badge">
                    <span className="badge-icon">🎁</span>
                    <span>Perfect Gift for Any Occasion</span>
                </div>

                <h1 className="hero-title">
                    <span>Turn Your Child Into The</span>
                    <br />
                    <span className="gradient-text">Star of Their Own</span>
                    <br />
                    <span className="gradient-text-alt">Storybook</span>
                </h1>

                <p className="hero-subtitle">
                    Upload a photo, choose a theme, and watch AI create a beautiful,
                    personalized storybook featuring your child as the hero.
                    <strong> Ready to print in minutes.</strong>
                </p>

                <div className="hero-cta-group">
                    <button className="cta-button primary" onClick={onCreateStory}>
                        <span className="button-content">
                            Create Your Book Free
                            <span className="sparkle">✨</span>
                        </span>
                    </button>
                    <button className="cta-button secondary" onClick={() => document.getElementById('gallery')?.scrollIntoView({ behavior: 'smooth' })}>
                        <span className="button-content">
                            See Examples
                        </span>
                    </button>
                </div>

                <div className="trust-badges">
                    <div className="trust-badge">
                        <span className="trust-icon">🔒</span>
                        <span>Your photos stay private</span>
                    </div>
                    <div className="trust-badge">
                        <span className="trust-icon">🚚</span>
                        <span>Shipping to US, Canada & UK</span>
                    </div>
                </div>
            </div>

            {/* Hero Image Showcase */}
            <div className="hero-image-section">
                <div className="hero-image-container">
                    <img
                        src="/assets/hero-child-reading.jpg"
                        alt="Child reading personalized storybook"
                        className="hero-showcase-image"
                    />
                    <div className="hero-image-badge">
                        <span className="badge-sparkle">✨</span>
                        <span>See the magic in their eyes</span>
                    </div>
                </div>
                <div className="hero-image-caption">
                    <h3>Watch their eyes light up as they become the hero of their own adventure!</h3>
                    <p>Every child deserves to see themselves in their favorite story</p>
                </div>
            </div>

            {/* How It Works Section */}
            <section id="how-it-works" className="how-it-works">
                <h2 className="section-title">Create Your Book in 3 Easy Steps</h2>
                <div className="steps-container">
                    <div className="step">
                        <div className="step-number">1</div>
                        <div className="step-icon">📸</div>
                        <h3>Upload Photo</h3>
                        <p>Upload a clear photo of your child. Our AI will use it to personalize every illustration.</p>
                    </div>
                    <div className="step-arrow">→</div>
                    <div className="step">
                        <div className="step-number">2</div>
                        <div className="step-icon">🎨</div>
                        <h3>Choose Theme</h3>
                        <p>Pick from magical adventures, space exploration, underwater journeys, and more!</p>
                    </div>
                    <div className="step-arrow">→</div>
                    <div className="step">
                        <div className="step-number">3</div>
                        <div className="step-icon">📖</div>
                        <h3>Get Your Book</h3>
                        <p>Preview your story instantly. Order a beautifully printed hardcover or download PDF.</p>
                    </div>
                </div>
            </section>

            {/* Pricing Section */}
            <section id="pricing" className="pricing-section">
                <h2 className="section-title">Simple, Transparent Pricing</h2>
                <p className="section-subtitle">Create for free. Pay only when you love it.</p>

                <div className="pricing-cards">
                    <div className="pricing-card">
                        <div className="pricing-header">
                            <h3>Digital</h3>
                            <div className="price">
                                <span className="price-amount">$9</span>
                                <span className="price-period">per book</span>
                            </div>
                        </div>
                        <ul className="pricing-features">
                            <li>✓ High-res PDF download</li>
                            <li>✓ 5-12 illustrated pages</li>
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
                                <span className="price-amount">$29</span>
                                <span className="price-period">per book</span>
                            </div>
                        </div>
                        <ul className="pricing-features">
                            <li>✓ Premium hardcover binding</li>
                            <li>✓ Thick, glossy pages</li>
                            <li>✓ 8.5" x 8.5" size</li>
                            <li>✓ Free shipping over $50</li>
                            <li>✓ Gift-ready packaging</li>
                            <li>✓ Digital PDF included</li>
                        </ul>
                        <button className="pricing-btn featured-btn" onClick={onCreateStory}>Create Hardcover Book</button>
                    </div>

                    <div className="pricing-card">
                        <div className="pricing-header">
                            <h3>Softcover</h3>
                            <div className="price">
                                <span className="price-amount">$19</span>
                                <span className="price-period">per book</span>
                            </div>
                        </div>
                        <ul className="pricing-features">
                            <li>✓ Quality softcover binding</li>
                            <li>✓ Matte finish pages</li>
                            <li>✓ 8.5" x 8.5" size</li>
                            <li>✓ Affordable shipping</li>
                            <li>✓ Digital PDF included</li>
                        </ul>
                        <button className="pricing-btn" onClick={onCreateStory}>Create Softcover Book</button>
                    </div>
                </div>
            </section>

            {/* Gallery Section */}
            <section id="gallery" className="gallery-preview">
                <h2 className="section-title">Stories Our Customers Love</h2>
                <p className="section-subtitle">See the magic we create every day</p>

                <div className="gallery-grid">
                    <div className="gallery-item">
                        <div className="gallery-placeholder" style={{ background: 'linear-gradient(135deg, #ff9a9e 0%, #fad0c4 100%)' }}>
                            <span className="gallery-icon">👸</span>
                            <span className="gallery-label">Princess Adventure</span>
                        </div>
                    </div>
                    <div className="gallery-item">
                        <div className="gallery-placeholder" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
                            <span className="gallery-icon">🚀</span>
                            <span className="gallery-label">Space Explorer</span>
                        </div>
                    </div>
                    <div className="gallery-item">
                        <div className="gallery-placeholder" style={{ background: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)' }}>
                            <span className="gallery-icon">🦕</span>
                            <span className="gallery-label">Dinosaur World</span>
                        </div>
                    </div>
                    <div className="gallery-item">
                        <div className="gallery-placeholder" style={{ background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' }}>
                            <span className="gallery-icon">🧜‍♀️</span>
                            <span className="gallery-label">Ocean Adventure</span>
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
                <p className="section-subtitle">Join the list — we'll email your discount when printed books open.</p>
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
                <p>It takes just 2 minutes to create a story your child will treasure forever.</p>
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
