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

Please create a JSON response with the following structure:
{
    "title": "A catchy story title (without the character name)",
    "pages": [
        {
            "pageNumber": 1,
            "text": "The story text for this page (2-3 sentences)",
            "imagePrompt": "A detailed description for an illustration showing this scene (mention that ${childName} is the main character)"
        },
        ... (${pageCount} pages total)
    ]
}

Make the story age-appropriate, engaging, and magical. Each page should flow naturally to the next. The image prompts should describe vibrant, colorful scenes suitable for a children's book illustration.`;

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
 * Generate image using OpenRouter image generation
 * Uses gemini-2.5-flash-image for image generation
 * Includes child's photo as reference so generated images match the child
 */
export async function generatePageImage(imagePrompt, apiKey, pageNumber = 0, childPhoto = null, childName = '') {
    const startTime = performance.now();

    logger.imageGenerationStart(pageNumber, imagePrompt);

    try {
        // Create prompt that references the child's appearance from the photo
        const enhancedPrompt = `Create a children's book illustration: ${imagePrompt}. 

IMPORTANT: The main character ${childName} should look EXACTLY like the child in the reference photo provided. 
Match their skin tone, hair color, hair style, and facial features precisely.

Style: Vibrant, colorful, whimsical, friendly, cute characters. 
Art style: Digital illustration suitable for ages 4-8, similar to modern children's picture books.
Quality: High quality, detailed, professional children's book illustration.`;

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
