export default function Navbar({ onCreateStory, onOpenLibrary, onOpenSettings, libraryCount }) {
    return (
        <nav className="navbar">
            <div className="nav-brand">
                <span className="magic-wand">✨</span>
                <h1>StoryBook Magic</h1>
            </div>
            <div className="nav-buttons">
                <button className="library-btn" onClick={onOpenLibrary} title="My Library">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                    </svg>
                    <span className="library-count">{libraryCount}</span>
                </button>
                <button className="settings-btn" onClick={onOpenSettings} title="Settings">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="3"></circle>
                        <path d="M12 1v6m0 6v6m5.66-13L14.5 9.5m-5 5L6.34 17.66M23 12h-6m-6 0H1m16.66 5.66L14.5 14.5m-5-5L6.34 6.34"></path>
                    </svg>
                </button>
            </div>
        </nav>
    );
}
