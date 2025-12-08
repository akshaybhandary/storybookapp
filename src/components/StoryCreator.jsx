import { useState } from 'react';
import { generateStoryContent, generatePageImage, analyzePersonPhoto } from '../services/aiProvider';
import { getCurrentProvider } from '../services/aiProvider';

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

    const [progress, setProgress] = useState(0);

    const handleGenerate = async () => {
        // In production, serverless function handles API key
        // Only check for key in development mode
        const isProduction = import.meta.env.PROD;
        const apiKey = getApiKey();

        if (!isProduction && !apiKey) {
            alert('Please set your Google AI Studio API key in settings');
            onClose();
            return;
        }

        if (!childName || !storyPrompt) {
            alert('Please fill in all fields');
            return;
        }

        setStep(3);
        setProgress(5);

        try {
            const pageCount = length === 'short' ? 5 : 10;
            const totalSteps = pageCount + 2; // Analysis + Story + Pages
            let currentStep = 0;

            const incrementProgress = () => {
                currentStep++;
                setProgress(Math.min(Math.round((currentStep / totalSteps) * 100), 95));
            };


            // Step 1: Analyze the child's photo (with timeout to prevent hanging)
            setLoadingText('Getting to know your little star...');
            let characterDescription = null;
            try {
                // Add 15-second timeout to prevent hanging
                const analysisPromise = analyzePersonPhoto(photoPreview, childName, apiKey);
                const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Character analysis timeout')), 15000)
                );

                characterDescription = await Promise.race([analysisPromise, timeoutPromise]);
            } catch (error) {
                console.warn('Character analysis skipped or failed:', error.message);
                // Continue without character analysis if it times out
                characterDescription = null;
            }
            incrementProgress();

            // Step 2: Generate the story content
            setLoadingText('Crafting your magical story...');
            const storyContent = await generateStoryContent(childName, storyPrompt, pageCount, apiKey);
            incrementProgress();


            // Step 3: Generate ALL illustrations in parallel (MUCH FASTER!)
            setLoadingText('Creating beautiful illustrations...');

            // Prepare all image generation promises
            const imagePromises = [];
            let completedImages = 0;
            const totalImages = storyContent.pages.length + 1; // +1 for cover

            // Helper to track progress
            const trackImageCompletion = (promise) => {
                return promise.then(result => {
                    completedImages++;
                    const imageProgress = 30 + Math.round((completedImages / totalImages) * 65); // 30% to 95%
                    setProgress(imageProgress);
                    setLoadingText(`Illustrated ${completedImages} of ${totalImages} pages...`);
                    return result;
                });
            };

            // Cover image
            imagePromises.push(
                trackImageCompletion(
                    generatePageImage(
                        `Create a stunning storybook cover illustration for "${storyContent.title}". The cover should show ${childName} as the main character in an exciting pose or scene that captures the essence of the story. Style: vibrant, child-friendly, professional children's book cover art. Include magical elements, wonder, and adventure. Make it eye-catching and inviting.`,
                        apiKey,
                        0,
                        photoPreview,
                        childName,
                        characterDescription,
                        {
                            characterOutfit: storyContent.characterOutfit,
                            locations: storyContent.locations,
                            currentLocation: storyContent.locations?.[0] || 'magical setting',
                            characters: storyContent.characters || {}
                        }
                    ).then(url => ({ pageNumber: 0, text: '', image: url, isCover: true }))
                )
            );

            // Story page images
            for (let i = 0; i < storyContent.pages.length; i++) {
                const pageData = storyContent.pages[i];
                const storyContext = {
                    characterOutfit: storyContent.characterOutfit,
                    locations: storyContent.locations,
                    currentLocation: pageData.location,
                    characters: storyContent.characters || {}
                };

                imagePromises.push(
                    trackImageCompletion(
                        generatePageImage(
                            pageData.imagePrompt,
                            apiKey,
                            i + 1,
                            photoPreview,
                            childName,
                            characterDescription,
                            storyContext
                        ).then(url => ({
                            pageNumber: pageData.pageNumber,
                            text: pageData.text,
                            image: url
                        }))
                    )
                );
            }

            // Generate all images at once!
            setProgress(30); // Start at 30% (after story generation)
            const pages = await Promise.all(imagePromises);

            setProgress(100);
            setLoadingText('Putting it all together...');
            await new Promise(resolve => setTimeout(resolve, 800)); // Show 100% briefly

            const story = {
                id: Date.now().toString(),
                title: storyContent.title,
                childName: childName,
                pages: pages,
                createdAt: new Date().toISOString(),
                saved: false
            };

            onStoryGenerated(story);

        } catch (error) {
            console.error('Error generating story:', error);
            console.error('Full error details:', {
                message: error.message,
                stack: error.stack,
                response: error.response
            });

            let errorTitle = 'Story Generation Error';
            let errorMessage = `${error.message}\n\nPlease check the browser console (F12) for more details, or contact support with this error.`;

            if (error.message.includes('Image generation failed')) {
                errorTitle = 'Image Generation Issue';
                errorMessage = `Image generation failed: ${error.message}\n\nThis might be due to API rate limits or temporary service issues. Please try again in a moment.`;
            } else if (error.message.includes('API key')) {
                errorTitle = 'API Configuration Error';
                errorMessage = `API key issue: ${error.message}\n\nPlease check Netlify environment variables.`;
            } else if (error.message.includes('Story generation failed')) {
                errorTitle = 'Story Generation Failed';
                errorMessage = `Story creation error: ${error.message}\n\nPlease try a different theme or simplify your request.`;
            } else if (error.message.includes('rate limit') || error.message.includes('429')) {
                errorTitle = 'Rate Limit Reached';
                errorMessage = 'Too many requests. Please wait a moment before trying again.';
            } else if (error.message.includes('credits') || error.message.includes('402')) {
                errorTitle = 'Insufficient Credits';
                errorMessage = 'API quota exceeded. Check your usage at aistudio.google.com';
            }

            setError({ title: errorTitle, message: errorMessage });
            setStep(4);
        }
    };

    return (
        <div className="page-container">
            <div className="story-creator-page">
                <div className="story-creator">
                    {step === 1 && (
                        <div className="creator-step">
                            <div className="step-header">
                                <button className="back-link" onClick={onClose}>← Back to Home</button>
                                <h3 className="step-title">Upload Your Child's Photo</h3>
                            </div>
                            <p className="step-description">Choose a clear, well-lit photo where your child's face is visible</p>

                            <div className="photo-tips">
                                <span className="tip-icon">✨</span>
                                <span className="tip-text"><strong>Tip:</strong> Clear, close-up photos without hats or sunglasses work best for creating a consistent character!</span>
                            </div>

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
                                    {['short', 'long'].map(len => (
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
                                                <small>{len === 'short' ? '5 pages' : '10 pages'}</small>
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
                                <div className="progress-container">
                                    <div className="progress-bar">
                                        <div
                                            className="progress-fill"
                                            style={{ width: `${progress}%` }}
                                        ></div>
                                    </div>
                                    <div className="progress-percentage">{progress}%</div>
                                </div>
                                <p className="loading-text">{loadingText}</p>
                                <p className="loading-warning" style={{
                                    fontSize: '0.9rem',
                                    color: '#D4AF37',
                                    marginTop: '1rem',
                                    textAlign: 'center'
                                }}>
                                    ⏱️ This might take 4-5 minutes. Please don't close your browser!
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
