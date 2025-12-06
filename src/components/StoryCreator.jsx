import { useState } from 'react';
import { generateStoryContent, generatePageImage, analyzeChildPhoto } from '../services/openRouterAPI';
import { getApiKey } from '../services/storageService';

export default function StoryCreator({ onClose, onStoryGenerated }) {
    const [step, setStep] = useState(1);
    const [photo, setPhoto] = useState(null);
    const [photoPreview, setPhotoPreview] = useState(null);
    const [childName, setChildName] = useState('');
    const [storyPrompt, setStoryPrompt] = useState('');
    const [length, setLength] = useState('short');
    const [loadingText, setLoadingText] = useState('');

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            if (!file.type.startsWith('image/')) {
                alert('Please upload an image file');
                return;
            }
            if (file.size > 10 * 1024 * 1024) {
                alert('File size must be less than 10MB');
                return;
            }

            setPhoto(file);
            const reader = new FileReader();
            reader.onload = (e) => setPhotoPreview(e.target.result);
            reader.readAsDataURL(file);
        }
    };

    const handleGenerate = async () => {
        const apiKey = getApiKey();
        if (!apiKey) {
            alert('Please set your OpenRouter API key in settings');
            onClose();
            return;
        }

        if (!childName || !storyPrompt) {
            alert('Please fill in all fields');
            return;
        }

        setStep(3);

        try {
            const pageCount = length === 'short' ? 5 : length === 'medium' ? 8 : 12;

            // Step 1: Analyze the child's photo for consistent character description
            setLoadingText('Analyzing your child\'s features for character consistency...');
            const characterDescription = await analyzeChildPhoto(photoPreview, childName, apiKey);

            // Step 2: Generate the story content
            setLoadingText('Crafting your magical story...');
            const storyContent = await generateStoryContent(childName, storyPrompt, pageCount, apiKey);

            // Step 3: Generate illustrations with consistent character, outfit, and locations
            setLoadingText('Creating beautiful illustrations...');
            const pages = [];

            for (let i = 0; i < storyContent.pages.length; i++) {
                const pageData = storyContent.pages[i];
                setLoadingText(`Illustrating page ${i + 1} of ${storyContent.pages.length}...`);

                // Build story context with outfit and current location
                const storyContext = {
                    characterOutfit: storyContent.characterOutfit,
                    locations: storyContent.locations,
                    currentLocation: pageData.location  // The location for this specific page
                };

                // Pass photo, name, character description, AND story context for full consistency
                const imageUrl = await generatePageImage(
                    pageData.imagePrompt,
                    apiKey,
                    i + 1,
                    photoPreview,
                    childName,
                    characterDescription,
                    storyContext  // New: outfit and location info
                );
                pages.push({
                    pageNumber: pageData.pageNumber,
                    text: pageData.text,
                    image: imageUrl
                });

                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            const story = {
                id: Date.now().toString(),
                title: `${childName}'s ${storyContent.title}`,
                pages: pages,
                createdAt: new Date().toISOString(),
                saved: false
            };

            onStoryGenerated(story);

        } catch (error) {
            console.error('Error generating story:', error);

            let errorMessage = 'Failed to generate story. ';

            if (error.message.includes('Image generation failed')) {
                errorMessage = '❌ Image Generation Failed\n\n' +
                    'The AI could not generate images for your storybook. This might be because:\n\n' +
                    '• The image generation model is unavailable\n' +
                    '• Your OpenRouter account needs credits\n' +
                    '• The service is experiencing high demand\n\n' +
                    'Please check the Debug Panel (🐛) for details and try again.\n\n' +
                    'Tip: Check your OpenRouter dashboard at openrouter.ai';
            } else if (error.message.includes('API key')) {
                errorMessage = '❌ API Key Error\n\nPlease check your OpenRouter API key in Settings.';
            } else if (error.message.includes('Story generation failed')) {
                errorMessage = '❌ Story Generation Failed\n\n' + error.message;
            } else {
                errorMessage = '❌ Error: ' + error.message;
            }

            alert(errorMessage);
            setStep(2);
        }
    };

    return (
        <div className="modal active">
            <div className="modal-backdrop" onClick={onClose}></div>
            <div className="modal-content">
                <button className="modal-close" onClick={onClose}>&times;</button>

                <div className="story-creator">
                    {step === 1 && (
                        <div className="creator-step">
                            <h3 className="step-title">Upload Your Child's Photo</h3>
                            <p className="step-description">Choose a clear, well-lit photo where your child's face is visible</p>

                            {!photoPreview ? (
                                <div className="upload-zone" onClick={() => document.getElementById('photo-input').click()}>
                                    <input
                                        type="file"
                                        id="photo-input"
                                        accept="image/*"
                                        onChange={handleFileChange}
                                        style={{ display: 'none' }}
                                    />
                                    <div className="upload-icon">📸</div>
                                    <p className="upload-text">Click to upload or drag and drop</p>
                                    <p className="upload-hint">PNG, JPG up to 10MB</p>
                                </div>
                            ) : (
                                <div className="preview-container">
                                    <img src={photoPreview} alt="Preview" />
                                    <button className="change-photo-btn" onClick={() => {
                                        setPhoto(null);
                                        setPhotoPreview(null);
                                    }}>
                                        Change Photo
                                    </button>
                                </div>
                            )}

                            <button
                                className="next-btn"
                                onClick={() => setStep(2)}
                                disabled={!photo}
                            >
                                Next: Story Details
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M5 12h14m-7-7l7 7-7 7"></path>
                                </svg>
                            </button>
                        </div>
                    )}

                    {step === 2 && (
                        <div className="creator-step">
                            <h3 className="step-title">Tell Us About Your Story</h3>
                            <p className="step-description">What magical adventure should we create?</p>

                            <div className="form-group">
                                <label htmlFor="childName">Child's Name</label>
                                <input
                                    type="text"
                                    id="childName"
                                    value={childName}
                                    onChange={(e) => setChildName(e.target.value)}
                                    placeholder="Enter hero's name"
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <label htmlFor="storyPrompt">Story Theme</label>
                                <textarea
                                    id="storyPrompt"
                                    value={storyPrompt}
                                    onChange={(e) => setStoryPrompt(e.target.value)}
                                    rows="4"
                                    placeholder="e.g., A brave knight rescuing a dragon, A space explorer discovering new planets..."
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <label>Story Length</label>
                                <div className="radio-group">
                                    {['short', 'medium', 'long'].map(len => (
                                        <label key={len} className="radio-option">
                                            <input
                                                type="radio"
                                                name="length"
                                                value={len}
                                                checked={length === len}
                                                onChange={(e) => setLength(e.target.value)}
                                            />
                                            <span className="radio-label">
                                                <strong>{len.charAt(0).toUpperCase() + len.slice(1)}</strong>
                                                <small>{len === 'short' ? '4-6 pages' : len === 'medium' ? '8-10 pages' : '12-15 pages'}</small>
                                            </span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div className="button-group">
                                <button className="back-btn" onClick={() => setStep(1)}>
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M19 12H5m7 7l-7-7 7-7"></path>
                                    </svg>
                                    Back
                                </button>
                                <button className="generate-btn" onClick={handleGenerate}>
                                    <span className="button-text">Generate Story ✨</span>
                                </button>
                            </div>
                        </div>
                    )}

                    {step === 3 && (
                        <div className="creator-step">
                            <h3 className="step-title">Your Story is Being Created!</h3>
                            <div className="loading-animation">
                                <div className="book-loader">
                                    <div className="book">
                                        <div className="page"></div>
                                        <div className="page"></div>
                                        <div className="page"></div>
                                    </div>
                                </div>
                                <p className="loading-text">{loadingText}</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
