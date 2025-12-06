export default function Hero({ onCreateStory }) {
    return (
        <header className="hero">
            <div className="stars"></div>
            <div className="stars2"></div>
            <div className="stars3"></div>

            <div className="hero-content">
                <h2 className="hero-title">
                    <span className="gradient-text">Bring Your Child's</span>
                    <br />
                    <span className="gradient-text-alt">Adventures to Life</span>
                </h2>
                <p className="hero-subtitle">
                    Create personalized, AI-generated storybooks where your child is the hero!
                </p>
                <button className="cta-button" onClick={onCreateStory}>
                    <span className="button-content">
                        <span className="sparkle">✨</span>
                        Create Your Story
                        <span className="sparkle">✨</span>
                    </span>
                </button>
            </div>

            <div className="scroll-indicator">
                <div className="mouse"></div>
            </div>
        </header>
    );
}
