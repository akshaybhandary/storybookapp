// OpenRouter API Service
import logger from '../utils/logger';

const API_BASE_URL = 'https://openrouter.ai/api/v1';

/**
 * Generate story content using Gemini
 */
export async function generateStoryContent(childName, theme, pageCount, apiKey) {
    const startTime = performance.now();

    logger.storyGenerationStart(childName, theme, pageCount);
    logger.debug('STORY-GEN', 'Building prompt', { childName, themeLength: theme.length, pageCount });

    const prompt = `Create a children's storybook with exactly ${pageCount} pages.

The story should be about: ${theme}

The main character's name is: ${childName}

IMPORTANT CONSISTENCY RULES:
1. OUTFIT: ${childName} must wear the SAME outfit throughout the entire story. Define it in the first page and keep it consistent.
2. LOCATIONS: If a location appears multiple times (like a bedroom, forest, etc.), it should look the SAME each time - same colors, same furniture, same style.
3. STYLE: All illustrations should have a consistent art style and color palette throughout the book.

Please create a JSON response with the following structure:
{
    "title": "A catchy story title (without the character name)",
    "characterOutfit": "Detailed description of what ${childName} is wearing throughout the story (e.g., 'a bright red t-shirt with a star, blue jeans, and white sneakers')",
    "locations": {
        "location1Name": "Detailed description of this location's appearance (colors, key items, style)",
        "location2Name": "Detailed description of this location's appearance"
    },
    "pages": [
        {
            "pageNumber": 1,
            "text": "The story text for this page (2-3 sentences)",
            "location": "The location name from the locations object where this scene takes place",
            "imagePrompt": "A detailed description for an illustration. MUST include: 1) ${childName} wearing [repeat the exact outfit], 2) The specific location with consistent details, 3) The action/scene"
        },
        ... (${pageCount} pages total)
    ]
}

CRITICAL: In each imagePrompt, you MUST:
- Describe ${childName}'s outfit EXACTLY the same way every time
- Describe locations EXACTLY the same way when they repeat
- Never change the character's clothes or a location's appearance mid-story

Make the story age-appropriate, engaging, and magical. Each page should flow naturally to the next.`;

    try {
        const endpoint = `${API_BASE_URL}/chat/completions`;
        const requestBody = {
            model: 'google/gemini-3-pro-preview',
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
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': window.location.origin,
                'X-Title': 'StoryBook Magic'
            },
            body: JSON.stringify(requestBody)
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
export async function analyzeChildPhoto(photoBase64, childName, apiKey) {
    logger.info('CHARACTER', 'Analyzing child photo for character consistency');

    try {
        const endpoint = `${API_BASE_URL}/chat/completions`;

        const analysisPrompt = `Analyze this photo of a child named ${childName} and provide a detailed character description that can be used consistently across multiple children's book illustrations.

Please describe in detail:
1. Skin tone (be specific: light, medium, olive, tan, brown, dark brown, etc.)
2. Hair color (specific shade)
3. Hair style (length, texture, any distinctive features)
4. Eye color
5. Approximate age
6. Any distinctive features (glasses, dimples, freckles, etc.)
7. Face shape

Respond with a JSON object:
{
    "characterDescription": "A detailed paragraph describing the child's appearance that can be used as a character reference for illustrations",
    "skinTone": "specific skin tone",
    "hairColor": "specific hair color",
    "hairStyle": "description of hair",
    "eyeColor": "eye color",
    "approximateAge": "age range like 4-6 years",
    "distinctiveFeatures": "any notable features or 'none'",
    "shortDescription": "Brief 1-sentence description for quick reference"
}`;

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': window.location.origin,
                'X-Title': 'StoryBook Magic'
            },
            body: JSON.stringify({
                model: 'google/gemini-2.5-flash-preview-05-20',
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
CHARACTER APPEARANCE (MAINTAIN EXACT CONSISTENCY):
${characterDescription.characterDescription}
- Skin tone: ${characterDescription.skinTone || 'match the reference photo'}
- Hair: ${characterDescription.hairColor || ''} ${characterDescription.hairStyle || ''}
- Eyes: ${characterDescription.eyeColor || 'match the reference photo'}
- Age appearance: ${characterDescription.approximateAge || 'young child'}
${characterDescription.distinctiveFeatures && characterDescription.distinctiveFeatures !== 'none' ? `- Distinctive features: ${characterDescription.distinctiveFeatures}` : ''}`;
        }

        // Build story context (outfit and locations)
        let storyConsistency = '';
        if (storyContext) {
            storyConsistency = `
OUTFIT (MUST BE EXACTLY THE SAME IN ALL ILLUSTRATIONS):
${storyContext.characterOutfit || 'match the reference photo clothing'}

${storyContext.currentLocation && storyContext.locations && storyContext.locations[storyContext.currentLocation] ? `
CURRENT LOCATION - ${storyContext.currentLocation.toUpperCase()}:
${storyContext.locations[storyContext.currentLocation]}
If this location appeared before, it MUST look identical.
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

        const endpoint = `${API_BASE_URL}/chat/completions`;

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
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': window.location.origin,
                'X-Title': 'StoryBook Magic'
            },
            body: JSON.stringify(requestBody)
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
