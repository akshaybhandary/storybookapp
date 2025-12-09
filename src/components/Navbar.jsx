export default function Navbar({ onCreateStory, onOpenLibrary, libraryCount, theme, onToggleTheme, showNavLinks = false }) {
    return (
        <nav className="navbar">
            <div className="nav-brand">
                <span className="magic-wand">✨</span>
                <h1>StoryBook Magic</h1>
            </div>
            {showNavLinks && (
                <div className="nav-links" style={{ display: 'flex', gap: '2rem', marginLeft: '2rem' }}>
                    <a href="#how-it-works" className="nav-link" style={{ color: 'var(--text-secondary)', textDecoration: 'none', fontWeight: 500 }}>How It Works</a>
                    <a href="#pricing" className="nav-link" style={{ color: 'var(--text-secondary)', textDecoration: 'none', fontWeight: 500 }}>Pricing</a>
                    <a href="#gallery" className="nav-link" style={{ color: 'var(--text-secondary)', textDecoration: 'none', fontWeight: 500 }}>Gallery</a>
                </div>
            )}
            <div className="nav-buttons">
                <button
                    className="settings-btn"
                    onClick={onToggleTheme}
                    title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                    style={{ marginRight: '0.5rem' }}
                >
                    {theme === 'dark' ? (
                        /* Sun Icon */
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="5"></circle>
                            <line x1="12" y1="1" x2="12" y2="3"></line>
                            <line x1="12" y1="21" x2="12" y2="23"></line>
                            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                            <line x1="1" y1="12" x2="3" y2="12"></line>
                            <line x1="21" y1="12" x2="23" y2="12"></line>
                            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
                        </svg>
                    ) : (
                        /* Moon Icon */
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
                        </svg>
                    )}
                </button>
                <button className="library-btn" onClick={onOpenLibrary} title="My Library">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                    </svg>
                    <span className="library-count">{libraryCount}</span>
                </button>
            </div>
        </nav>
    );
}
