import { useState, useEffect } from 'react';
import { saveStory, isStorySaved } from '../services/storageService';

export default function StoryViewer({ story, onClose, onStorySaved }) {
    const [currentPage, setCurrentPage] = useState(0);
    const [isSaved, setIsSaved] = useState(false);

    useEffect(() => {
        setIsSaved(isStorySaved(story.id));
    }, [story.id]);

    const handleSave = () => {
        if (saveStory(story)) {
            setIsSaved(true);
            onStorySaved();
            alert('Story saved to library!');
        } else {
            alert('Story already saved!');
        }
    };

    const handlePrint = () => {
        window.print();
    };

    const themeIcons = ['🌟', '✨', '🎨', '🦄', '🌈', '🎭', '🎪', '🎡', '🎢', '🎠'];

    return (
        <div className="modal active">
            <div className="modal-backdrop" onClick={onClose}></div>
            <div className="modal-content story-book-modal">
                <button className="modal-close" onClick={onClose}>&times;</button>

                <div className="storybook-viewer">
                    <div className="storybook-header">
                        <h2>{story.title}</h2>
                        <div className="action-buttons">
                            <button
                                className={`action-btn save-story-btn ${isSaved ? 'saved' : ''}`}
                                onClick={handleSave}
                                disabled={isSaved}
                            >
                                {isSaved ? (
                                    <>✓ Saved</>
                                ) : (
                                    <>
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"></path>
                                            <polyline points="17 21 17 13 7 13 7 21"></polyline>
                                            <polyline points="7 3 7 8 15 8"></polyline>
                                        </svg>
                                        Save Story
                                    </>
                                )}
                            </button>
                            <button className="action-btn" onClick={handlePrint}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"></path>
                                    <path d="M6 14h12v8H6z"></path>
                                </svg>
                                Print
                            </button>
                        </div>
                    </div>

                    {/* Book-style spread layout */}
                    <div className="book-spread">
                        {story.pages.map((page, index) => {
                            const hue1 = (index * 40 + 200) % 360;
                            const hue2 = (hue1 + 80) % 360;
                            const icon = themeIcons[index % themeIcons.length];
                            const isEvenPage = index % 2 === 0;

                            return (
                                <div
                                    key={page.pageNumber}
                                    className={`book-page-spread ${index === currentPage ? 'active' : ''}`}
                                    style={{ display: index === currentPage ? 'flex' : 'none' }}
                                >
                                    {/* Left page - Image */}
                                    <div className={`book-page left-page ${isEvenPage ? 'image-page' : 'text-page'}`}>
                                        {isEvenPage ? (
                                            // Image on left
                                            page.image ? (
                                                <img src={page.image} alt={`Page ${page.pageNumber}`} className="book-illustration" />
                                            ) : (
                                                <div className="placeholder-illustration" style={{
                                                    background: `linear-gradient(135deg, hsl(${hue1}, 75%, 70%) 0%, hsl(${hue2}, 75%, 75%) 50%, hsl(${hue1}, 75%, 80%) 100%)`
                                                }}>
                                                    <div className="placeholder-icon">{icon}</div>
                                                    <div className="placeholder-label">Illustration</div>
                                                </div>
                                            )
                                        ) : (
                                            // Text on left for odd pages
                                            <div className="book-text-content">
                                                <span className="page-number">Page {page.pageNumber}</span>
                                                <p className="book-story-text">{page.text}</p>
                                            </div>
                                        )}
                                    </div>

                                    {/* Right page - Text (or Image for odd pages) */}
                                    <div className={`book-page right-page ${isEvenPage ? 'text-page' : 'image-page'}`}>
                                        {isEvenPage ? (
                                            // Text on right
                                            <div className="book-text-content">
                                                <span className="page-number">Page {page.pageNumber}</span>
                                                <p className="book-story-text">{page.text}</p>
                                            </div>
                                        ) : (
                                            // Image on right for odd pages
                                            page.image ? (
                                                <img src={page.image} alt={`Page ${page.pageNumber}`} className="book-illustration" />
                                            ) : (
                                                <div className="placeholder-illustration" style={{
                                                    background: `linear-gradient(135deg, hsl(${hue1}, 75%, 70%) 0%, hsl(${hue2}, 75%, 75%) 50%, hsl(${hue1}, 75%, 80%) 100%)`
                                                }}>
                                                    <div className="placeholder-icon">{icon}</div>
                                                    <div className="placeholder-label">Illustration</div>
                                                </div>
                                            )
                                        )}
                                    </div>

                                    {/* Book spine/gutter effect */}
                                    <div className="book-spine"></div>
                                </div>
                            );
                        })}
                    </div>

                    <div className="page-navigation">
                        <button
                            className="nav-btn"
                            onClick={() => setCurrentPage(currentPage - 1)}
                            disabled={currentPage === 0}
                        >
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M15 18l-6-6 6-6"></path>
                            </svg>
                        </button>
                        <span className="page-indicator">Page {currentPage + 1} of {story.pages.length}</span>
                        <button
                            className="nav-btn"
                            onClick={() => setCurrentPage(currentPage + 1)}
                            disabled={currentPage === story.pages.length - 1}
                        >
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M9 18l6-6-6-6"></path>
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
