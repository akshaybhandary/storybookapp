import { useState, useEffect } from 'react';
import { getSavedStories, deleteStory } from '../services/storageService';

export default function Library({ onClose, onViewStory, onStoryDeleted }) {
    const [stories, setStories] = useState([]);

    useEffect(() => {
        loadStories();
    }, []);

    const loadStories = () => {
        const savedStories = getSavedStories();
        setStories(savedStories);
    };

    const handleDelete = (storyId) => {
        if (window.confirm('Are you sure you want to delete this story?')) {
            deleteStory(storyId);
            loadStories();
            onStoryDeleted();
        }
    };

    return (
        <div className="modal active">
            <div className="modal-backdrop" onClick={onClose}></div>
            <div className="modal-content library-modal">
                <button className="modal-close" onClick={onClose}>&times;</button>

                <div className="library-content">
                    <h3 className="step-title">📚 My Story Library</h3>
                    <p className="step-description">Your saved personalized storybooks</p>

                    {stories.length === 0 ? (
                        <div className="library-empty">
                            <div className="empty-icon">📖</div>
                            <p>No saved stories yet</p>
                            <p className="empty-hint">Create and save your first magical storybook!</p>
                        </div>
                    ) : (
                        <div className="library-grid">
                            {stories.map(story => {
                                const firstPage = story.pages[0] || {};
                                const savedDate = new Date(story.savedAt || story.createdAt);

                                return (
                                    <div key={story.id} className="library-story-card">
                                        <div className="library-story-thumbnail">
                                            {firstPage.image ? (
                                                <img src={firstPage.image} alt={story.title} />
                                            ) : (
                                                '📖'
                                            )}
                                        </div>
                                        <div className="library-story-info">
                                            <h4 className="library-story-title">{story.title}</h4>
                                            <div className="library-story-meta">
                                                <span className="library-story-pages">
                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                                                        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                                                    </svg>
                                                    {story.pages.length} pages
                                                </span>
                                                <span>{savedDate.toLocaleDateString()}</span>
                                            </div>
                                            <div className="library-story-actions">
                                                <button className="library-action-btn" onClick={() => onViewStory(story)}>
                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                                        <circle cx="12" cy="12" r="3"></circle>
                                                    </svg>
                                                    View
                                                </button>
                                                <button className="library-action-btn delete" onClick={() => handleDelete(story.id)}>
                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                        <polyline points="3 6 5 6 21 6"></polyline>
                                                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                                    </svg>
                                                    Delete
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
