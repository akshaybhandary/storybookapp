import { useState, useEffect } from 'react';

export default function Hero({ onCreateStory }) {
    const [activeTestimonial, setActiveTestimonial] = useState(0);

    const testimonials = [
        {
            text: "My daughter's face when she saw herself as the princess in her own book was priceless!",
            author: "Sarah M.",
            title: "Mom of 2",
            rating: 5
        },
        {
            text: "The quality is amazing. We've ordered 5 books already for different occasions.",
            author: "James K.",
            title: "Grandfather",
            rating: 5
        },
        {
            text: "Perfect birthday gift! The personalization makes it so special.",
            author: "Emily R.",
            title: "Aunt",
            rating: 5
        }
    ];

    useEffect(() => {
        const timer = setInterval(() => {
            setActiveTestimonial((prev) => (prev + 1) % testimonials.length);
        }, 5000);
        return () => clearInterval(timer);
    }, [testimonials.length]);

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
                        <span className="trust-icon">⭐</span>
                        <span>4.9/5 Rating</span>
                    </div>
                    <div className="trust-badge">
                        <span className="trust-icon">🚚</span>
                        <span>Ships Worldwide</span>
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

            {/* Testimonials */}
            <section className="testimonials">
                <h2 className="section-title">What Parents Are Saying</h2>
                <div className="testimonial-carousel">
                    {testimonials.map((testimonial, index) => (
                        <div
                            key={index}
                            className={`testimonial ${index === activeTestimonial ? 'active' : ''}`}
                        >
                            <div className="testimonial-stars">
                                {'⭐'.repeat(testimonial.rating)}
                            </div>
                            <p className="testimonial-text">"{testimonial.text}"</p>
                            <div className="testimonial-author">
                                <strong>{testimonial.author}</strong>
                                <span>{testimonial.title}</span>
                            </div>
                        </div>
                    ))}
                    <div className="testimonial-dots">
                        {testimonials.map((_, index) => (
                            <button
                                key={index}
                                className={`dot ${index === activeTestimonial ? 'active' : ''}`}
                                onClick={() => setActiveTestimonial(index)}
                            />
                        ))}
                    </div>
                </div>
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
                        <span>StoryBook Magic</span>
                    </div>
                    <div className="footer-links">
                        <a href="#">Privacy Policy</a>
                        <a href="#">Terms of Service</a>
                        <a href="#">Contact Us</a>
                        <a href="#">FAQ</a>
                    </div>
                    <p className="footer-copy">© 2024 StoryBook Magic. Made with ❤️ for families everywhere.</p>
                </div>
            </footer>
        </section>
    );
}
