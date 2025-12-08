// OpenRouter API Service
import logger from '../utils/logger';

/**
 * Retry utility with exponential backoff
 * Retries transient errors, fails fast on permanent errors
 */
async function retryWithBackoff(fn, options = {}) {
    const {
        maxRetries = 2,
        initialDelay = 1000,
        maxDelay = 5000,
        shouldRetry = (error) => {
            // Don't retry these permanent errors
            if (error.message.includes('402') || error.message.includes('credits')) return false;
            if (error.message.includes('401') || error.message.includes('API key')) return false;
            if (error.message.includes('403') || error.message.includes('forbidden')) return false;
            if (error.message.includes('400') || error.message.includes('invalid')) return false;

            // Retry these transient errors
            if (error.message.includes('429') || error.message.includes('rate limit')) return true;
            if (error.message.includes('timeout')) return true;
            if (error.message.includes('503') || error.message.includes('502')) return true;
            if (error.message.includes('network')) return true;

            // Default: retry on 500 errors, don't retry on 4xx
            return error.message.includes('500');
        }
    } = options;

    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;

            // Check if we should retry
            if (attempt < maxRetries && shouldRetry(error)) {
                const delay = Math.min(initialDelay * Math.pow(2, attempt), maxDelay);
                logger.warn('API', `Request failed, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`, {
                    error: error.message
                });
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }

            // Don't retry - throw immediately
            throw error;
        }
    }

    throw lastError;
}

// Use Netlify serverless function in production, direct API in development
const isProduction = import.meta.env.PROD;
const API_BASE_URL = isProduction
    ? '/.netlify/functions'  // Netlify serverless function
    : 'https://openrouter.ai/api/v1';  // Direct API for local dev

// Endpoint paths differ based on environment
const getCompletionsEndpoint = () => isProduction
    ? `${API_BASE_URL}/openrouter`  // Our serverless function
    : `${API_BASE_URL}/chat/completions`;  // Direct OpenRouter API

// Build headers - only include API key in development (production uses serverless function)
const getHeaders = (apiKey) => {
    const headers = {
        'Content-Type': 'application/json',
    };

    // Only add auth header in development (direct API calls)
    // In production, the serverless function handles authentication
    if (!isProduction && apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
        headers['HTTP-Referer'] = window.location.origin;
        headers['X-Title'] = 'StoryBook Magic';
    }

    return headers;
};

/**
 * Generate story content using Gemini
 */
export async function generateStoryContent(childName, theme, pageCount, apiKey) {
    const startTime = performance.now();

    logger.storyGenerationStart(childName, theme, pageCount);
    logger.debug('STORY-GEN', 'Building prompt', { childName, themeLength: theme.length, pageCount });

    const prompt = `You are an award-winning children's book author creating a premium storybook for a child named ${childName}.

STORY DETAILS:
- Theme: ${theme}
- Pages: Exactly ${pageCount} pages
- Target age: 4-8 years old

STORYTELLING EXCELLENCE REQUIREMENTS:

1. NARRATIVE QUALITY:
   - Use rich, descriptive language appropriate for children
   - Include sensory details (sights, sounds, feelings)
   - Create a clear story arc: Beginning (introduce character & problem), Middle (adventure/challenge), End (resolution & growth)
   - Each page should end with a hook that makes readers want to turn the page
   - Use varied sentence structures - mix short, punchy sentences with longer, flowing ones
   - Include dialogue to bring characters to life
   - Show emotions through actions and expressions, not just telling

2. CHARACTER DEVELOPMENT:
   - ${childName} should be brave, curious, kind, and relatable
   - Give ${childName} a clear personality trait or strength
   - Show ${childName} learning or growing through the adventure
   - Include one supporting character who helps or challenges ${childName}

3. LITERARY DEVICES:
   - Use alliteration and rhyme occasionally for memorability
   - Include onomatopoeia for sound effects (whoosh, splash, rustle)
   - Create vivid imagery with metaphors children understand
   - Add emotional depth - moments of wonder, excitement, warmth

4. PACING & STRUCTURE:
   - Pages 1-2: Set the scene, introduce ${childName} and their world
   - Pages 3-${Math.floor(pageCount * 0.7)}: The adventure unfolds, challenges arise
   - Final pages: Climax, resolution, heartwarming ending with a gentle lesson

5. VISUAL CONSISTENCY (CRITICAL):
   - OUTFIT: ${childName} wears ONE specific outfit throughout. Define it clearly.
   - LOCATIONS: Each location has consistent colors, furniture, and style whenever it appears
   - **CHARACTERS**: Define ALL characters (friends, animals, adults) with specific appearance details. They MUST look exactly the same on every page!
   - Example outfit: "a cozy blue hoodie with a friendly dinosaur, green cargo pants, red sneakers"
   - Example location: "A sunlit bedroom with yellow walls, a wooden bed with star-patterned sheets, a round window with curtains"
   - Example character: "Luna the cat: small fluffy white cat with bright green eyes, pink collar with bell, always playful"

6. THEMES TO WEAVE IN:
   - Friendship, courage, kindness, or curiosity (subtle, not preachy)
   - Wonder and imagination
   - Problem-solving and resilience
   - Celebration of uniqueness

OUTPUT FORMAT (JSON):
{
    "title": "An evocative, memorable title (2-4 words, no character name)",
    "characterOutfit": "Precise description of ${childName}'s outfit worn throughout",
    "characters": {
        "${childName}": "The main character (will be described separately from uploaded photo)",
        "characterName2": "DETAILED appearance: species/type, size, colors, distinctive features, clothing if any. Be VERY specific!",
        "characterName3": "DETAILED appearance: species/type, size, colors, distinctive features, clothing if any"
    },
    "locations": {
        "locationName1": "Vivid description: colors, key features, atmosphere",
        "locationName2": "Vivid description: colors, key features, atmosphere"
    },
    "pages": [
        {
            "pageNumber": 1,
            "text": "Engaging text (2-4 sentences max). Use vivid verbs. Include sensory details.",
            "location": "locationName1",
            "charactersPresent": ["${childName}", "characterName2"],
            "imagePrompt": "Detailed scene: ${childName} in [exact outfit], [other characters with exact appearance], at [location with specific details], doing [specific action with emotion]"
        }
        ... (${pageCount} pages)
    ]
}

IMPORTANT: If you introduce ANY character besides ${childName} (friends, animals, adults, magical creatures), you MUST define their appearance in the "characters" object with EXTREME detail so they look identical on every page!

QUALITY STANDARD: Write as if this will be professionally published. Every sentence should delight and engage. Make parents want to read this aloud, and make children ask for it again and again.`;

    try {
        const endpoint = getCompletionsEndpoint();
        const requestBody = {
            model: 'google/gemini-2.5-flash',
            messages: [
                {
                    role: 'user',
                    content: prompt
                }
            ],
            response_format: { type: 'json_object' }
        };

        logger.apiRequest(endpoint, 'POST', {
            model: requestBody.model,
            promptLength: prompt.length,
            responseFormat: 'json'
        });

        const fetchStart = performance.now();

        // Wrap fetch in retry logic
        const response = await retryWithBackoff(async () => {
            return await fetch(endpoint, {
                method: 'POST',
                headers: getHeaders(apiKey),
                body: JSON.stringify(requestBody)
            });
        });

        const fetchDuration = performance.now() - fetchStart;

        if (!response.ok) {
            const errorText = await response.text();
            logger.apiResponse(endpoint, response.status, fetchDuration, {
                error: errorText,
                statusText: response.statusText
            });
            throw new Error(`Story generation failed: ${response.statusText} - ${errorText}`);
        }

        const data = await response.json();
        logger.apiResponse(endpoint, response.status, fetchDuration, {
            hasChoices: !!data.choices,
            choiceCount: data.choices?.length
        });

        const content = data.choices[0].message.content;
        logger.debug('STORY-GEN', 'Received response', {
            contentLength: content.length,
            contentPreview: content.substring(0, 100)
        });

        let storyData;
        try {
            storyData = JSON.parse(content);
            logger.info('STORY-GEN', 'Successfully parsed JSON response', {
                title: storyData.title,
                pageCount: storyData.pages?.length
            });
        } catch (e) {
            logger.warn('STORY-GEN', 'Direct JSON parse failed, trying regex extraction', {
                error: e.message
            });

            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                storyData = JSON.parse(jsonMatch[0]);
                logger.info('STORY-GEN', 'Successfully extracted JSON via regex', {
                    title: storyData.title,
                    pageCount: storyData.pages?.length
                });
            } else {
                logger.error('STORY-GEN', 'Failed to extract JSON from response', e, {
                    contentPreview: content.substring(0, 200)
                });
                throw new Error('Failed to parse story content');
            }
        }

        const totalDuration = performance.now() - startTime;
        logger.storyGenerationSuccess(storyData.pages?.length || 0, totalDuration);

        return storyData;

    } catch (error) {
        const totalDuration = performance.now() - startTime;
        logger.storyGenerationError(error, totalDuration);
        throw error;
    }
}

/**
 * Analyze child's photo to extract detailed character description
 * This ensures consistency across all generated images
 */
export async function analyzePersonPhoto(photoBase64, personName, apiKey) {
    logger.info('CHARACTER', 'Analyzing person photo for character consistency');

    try {
        const endpoint = getCompletionsEndpoint();

        const analysisPrompt = `Analyze this photo of a person named ${personName} and provide a VERY detailed character description that can be used consistently across multiple illustrations.

CRITICAL: Pay special attention to hair - it MUST remain exactly the same in all illustrations!

Please describe in EXTREME detail:
1. Skin tone (be specific: light, medium, olive, tan, brown, dark brown, etc.)
2. **HAIR COLOR** (exact shade - be very specific: jet black, dark brown, light brown, blonde, strawberry blonde, auburn, etc.)
3. **HAIR STYLE** (CRITICAL - describe in detail):
   - Exact length (shoulder-length, chin-length, very short, long past shoulders, etc.)
   - Texture (straight, wavy, curly, type 3a curls, type 4c coils, etc.)
   - Part location (center part, side part, no part)
   - Any styling (ponytail, braids, buns, loose, etc.)
   - Bangs or no bangs
   - Volume (thick, fine, voluminous)
4. Eye color (exact shade)
5. Approximate age
6. Any distinctive features (glasses, dimples, freckles, etc.)
7. Face shape

Respond with a JSON object:
{
    "characterDescription": "A detailed paragraph describing the child's appearance that can be used as a character reference for illustrations. EMPHASIZE HAIR DETAILS.",
    "skinTone": "specific skin tone",
    "hairColor": "EXACT specific hair color shade",
    "hairStyle": "VERY DETAILED description of hair - length, texture, style, part, everything",
    "hairLength": "specific length description",
    "hairTexture": "specific texture (straight/wavy/curly/etc)",
    "eyeColor": "eye color",
    "approximateAge": "age range like 4-6 years",
    "distinctiveFeatures": "any notable features or 'none'",
    "shortDescription": "Brief 1-sentence description for quick reference"
}`;

        const response = await retryWithBackoff(async () => {
            return await fetch(endpoint, {
                method: 'POST',
                headers: getHeaders(apiKey),
                body: JSON.stringify({
                    model: 'google/gemini-2.5-flash',
                    messages: [
                        {
                            role: 'user',
                            content: [
                                {
                                    type: 'image_url',
                                    image_url: { url: photoBase64 }
                                },
                                {
                                    type: 'text',
                                    text: analysisPrompt
                                }
                            ]
                        }
                    ],
                    response_format: { type: 'json_object' }
                })
            });
        });

        if (!response.ok) {
            const errorText = await response.text();
            logger.warn('CHARACTER', 'Photo analysis failed, using basic description', { error: errorText });
            return {
                characterDescription: `A child named ${childName}`,
                shortDescription: childName
            };
        }

        const data = await response.json();
        const content = data.choices[0].message.content;

        try {
            const characterData = JSON.parse(content);
            logger.info('CHARACTER', 'Character analysis complete', {
                skinTone: characterData.skinTone,
                hairColor: characterData.hairColor,
                approximateAge: characterData.approximateAge
            });
            return characterData;
        } catch (e) {
            logger.warn('CHARACTER', 'Failed to parse character analysis', { error: e.message });
            return {
                characterDescription: `A child named ${childName}`,
                shortDescription: childName
            };
        }

    } catch (error) {
        logger.error('CHARACTER', 'Character analysis error', error);
        return {
            characterDescription: `A child named ${childName}`,
            shortDescription: childName
        };
    }
}

/**
 * Generate image using OpenRouter image generation
 * Uses gemini-2.5-flash-image for image generation
 * Includes child's photo, character description, and story context for consistency
 */
export async function generatePageImage(imagePrompt, apiKey, pageNumber = 0, childPhoto = null, childName = '', characterDescription = null, storyContext = null) {
    const startTime = performance.now();

    logger.imageGenerationStart(pageNumber, imagePrompt);

    try {
        // Build character reference from the analyzed description
        let characterRef = '';
        if (characterDescription && characterDescription.characterDescription) {
            characterRef = `
CHARACTER APPEARANCE (MAINTAIN EXACT CONSISTENCY IN EVERY IMAGE):
${characterDescription.characterDescription}

CRITICAL - DO NOT CHANGE THESE:
- Skin tone: ${characterDescription.skinTone || 'match the reference photo'}
- **HAIR COLOR (NEVER CHANGE)**: ${characterDescription.hairColor || 'match reference photo exactly'}
- **HAIR STYLE (NEVER CHANGE)**: ${characterDescription.hairStyle || 'match reference photo exactly'}
  ${characterDescription.hairLength ? `  * Length: ${characterDescription.hairLength}` : ''}
  ${characterDescription.hairTexture ? `  * Texture: ${characterDescription.hairTexture}` : ''}
- Eyes: ${characterDescription.eyeColor || 'match the reference photo'}
- Age appearance: ${characterDescription.approximateAge || 'young child'}
${characterDescription.distinctiveFeatures && characterDescription.distinctiveFeatures !== 'none' ? `- Distinctive features: ${characterDescription.distinctiveFeatures}` : ''}

IMPORTANT: The hair MUST look exactly the same as in the reference photo and all other illustrations. Same color, same style, same length every single time!`;
        }

        // Build story context (outfit, locations, and ALL characters)
        let storyConsistency = '';
        if (storyContext) {
            storyConsistency = `
OUTFIT (MUST BE EXACTLY THE SAME IN ALL ILLUSTRATIONS):
${storyContext.characterOutfit || 'match the reference photo clothing'}

${storyContext.currentLocation && storyContext.locations && storyContext.locations[storyContext.currentLocation] ? `
CURRENT LOCATION - ${storyContext.currentLocation.toUpperCase()}:
${storyContext.locations[storyContext.currentLocation]}
If this location appeared before, it MUST look identical.
` : ''}

${storyContext.characters && Object.keys(storyContext.characters).length > 0 ? `
OTHER CHARACTERS IN THIS STORY (MUST LOOK IDENTICAL ON EVERY PAGE):
${Object.entries(storyContext.characters)
                        .filter(([name]) => name !== childName) // Exclude main character (already described above)
                        .map(([name, description]) => `- ${name}: ${description}`)
                        .join('\n')}

IMPORTANT: If any of these characters appear in this illustration, they MUST match these exact descriptions!
` : ''}`;
        }

        // Create prompt with all consistency information
        const enhancedPrompt = `Create a children's book illustration: ${imagePrompt}
${characterRef}
${storyConsistency}

CRITICAL CONSISTENCY REQUIREMENTS:
1. The main character ${childName} MUST look like the reference photo (same face, skin tone, hair)
2. The character MUST wear the EXACT same outfit described above
3. The location/background MUST match the description exactly
4. This is page ${pageNumber} of a storybook - everything must be consistent with other pages

Style: Vibrant, colorful, whimsical, friendly children's book illustration.
Art style: Modern digital illustration suitable for ages 4-8.
Quality: High quality, detailed, professional.`;

        const endpoint = getCompletionsEndpoint();

        // Build message content - include photo if available
        let messageContent;
        if (childPhoto) {
            // Multimodal message with image reference
            messageContent = [
                {
                    type: 'image_url',
                    image_url: {
                        url: childPhoto  // Base64 data URL of the child's photo
                    }
                },
                {
                    type: 'text',
                    text: enhancedPrompt
                }
            ];
            logger.info('IMAGE-GEN', `Page ${pageNumber} using child photo as reference`, {
                photoLength: childPhoto.length
            });
        } else {
            messageContent = enhancedPrompt;
        }

        // Using gemini-2.5-flash-image (Nano Banana) for image generation
        // Supports: image generation, edits, and multi-turn conversations
        const requestBody = {
            model: 'google/gemini-2.5-flash-image',
            messages: [
                {
                    role: 'user',
                    content: messageContent
                }
            ],
            modalities: ['image', 'text'],
            // Configure aspect ratio for children's book illustrations
            image_config: {
                aspect_ratio: '4:3'  // 1184×864 - great for book illustrations
            }
        };

        logger.apiRequest(endpoint, 'POST', {
            model: requestBody.model,
            pageNumber,
            promptLength: imagePrompt.length,
            hasChildPhoto: !!childPhoto,
            modalities: requestBody.modalities
        });

        const fetchStart = performance.now();

        // Wrap image generation in retry logic
        const response = await retryWithBackoff(async () => {
            return await fetch(endpoint, {
                method: 'POST',
                headers: getHeaders(apiKey),
                body: JSON.stringify(requestBody)
            });
        });

        const fetchDuration = performance.now() - fetchStart;

        if (!response.ok) {
            const errorText = await response.text();
            logger.apiResponse(endpoint, response.status, fetchDuration, {
                pageNumber,
                error: errorText,
                statusText: response.statusText
            });

            throw new Error(`Image API error (${response.status}): ${errorText.substring(0, 200)}`);
        }

        const data = await response.json();
        logger.apiResponse(endpoint, response.status, fetchDuration, {
            pageNumber,
            hasChoices: !!data.choices,
            hasImages: !!data.choices?.[0]?.message?.images
        });

        // CORRECT RESPONSE FORMAT: message.images array
        if (data.choices && data.choices[0] && data.choices[0].message) {
            const message = data.choices[0].message;

            logger.debug('IMAGE-GEN', `Page ${pageNumber} response structure`, {
                hasImages: !!message.images,
                imagesCount: message.images?.length,
                hasContent: !!message.content,
                contentType: typeof message.content
            });

            // Primary: Check for images array (per OpenRouter docs)
            if (message.images && Array.isArray(message.images) && message.images.length > 0) {
                const image = message.images[0];
                if (image.image_url && image.image_url.url) {
                    const imageUrl = image.image_url.url;
                    const totalDuration = performance.now() - startTime;

                    logger.imageGenerationSuccess(pageNumber, totalDuration, true);
                    logger.info('IMAGE-GEN', `Page ${pageNumber} image extracted from images array`, {
                        urlType: imageUrl.startsWith('data:') ? 'base64' : 'http',
                        urlLength: imageUrl.length
                    });

                    return imageUrl;
                }
            }

            // Fallback: Check content array for image_url objects
            if (Array.isArray(message.content)) {
                for (const item of message.content) {
                    if (item.type === 'image_url' && item.image_url && item.image_url.url) {
                        const imageUrl = item.image_url.url;
                        const totalDuration = performance.now() - startTime;

                        logger.imageGenerationSuccess(pageNumber, totalDuration, true);
                        logger.info('IMAGE-GEN', `Page ${pageNumber} image extracted from content array`, {
                            urlType: imageUrl.startsWith('data:') ? 'base64' : 'http',
                            urlLength: imageUrl.length
                        });

                        return imageUrl;
                    }
                }
            }

            // Fallback: Check if content is a base64 data URL string
            if (typeof message.content === 'string' && message.content.startsWith('data:image')) {
                const totalDuration = performance.now() - startTime;
                logger.imageGenerationSuccess(pageNumber, totalDuration, true);
                logger.info('IMAGE-GEN', `Page ${pageNumber} image found in content string`, {
                    urlLength: message.content.length
                });
                return message.content;
            }
        }

        // No image found - this is an error
        const totalDuration = performance.now() - startTime;
        const responsePreview = JSON.stringify(data).substring(0, 800);

        logger.error('IMAGE-GEN', `Page ${pageNumber} - No image in API response`, new Error('No image data'), {
            duration: totalDuration,
            responseStructure: responsePreview,
            pageNumber
        });

        throw new Error(`Image generation failed for page ${pageNumber}: API responded but no image data found. Check console for response structure.`);

    } catch (error) {
        const totalDuration = performance.now() - startTime;
        logger.imageGenerationError(pageNumber, error, totalDuration);
        throw error;
    }
}
