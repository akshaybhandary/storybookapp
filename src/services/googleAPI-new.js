// Smart API Client - Automatically uses background functions for long-running tasks
import logger from '../utils/logger';

const isProduction = import.meta.env.PROD;
const FUNCTION_URL = isProduction ? '/.netlify/functions/google' : null;
const BACKGROUND_FUNCTION_URL = isProduction ? '/.netlify/functions/google-background' : null;

/**
 * Retry utility with exponential backoff
 */
async function retryWithBackoff(fn, options = {}) {
    const {
        maxRetries = 2,
        initialDelay = 1000,
        maxDelay = 5000,
        shouldRetry = (error) => {
            if (error.message.includes('402') || error.message.includes('credits')) return false;
            if (error.message.includes('401') || error.message.includes('API key')) return false;
            if (error.message.includes('403') || error.message.includes('forbidden')) return false;
            if (error.message.includes('400') || error.message.includes('invalid')) return false;

            if (error.message.includes('429') || error.message.includes('rate limit')) return true;
            if (error.message.includes('timeout')) return true;
            if (error.message.includes('503') || error.message.includes('502')) return true;
            if (error.message.includes('network')) return true;

            return error.message.includes('500');
        }
    } = options;

    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;

            if (attempt < maxRetries && shouldRetry(error)) {
                const delay = Math.min(initialDelay * Math.pow(2, attempt), maxDelay);
                logger.warn('API', `Request failed, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`, {
                    error: error.message
                });
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }

            throw error;
        }
    }

    throw lastError;
}

/**
 * Call Google API - Uses background function if useBackground is true
 */
async function callGoogleAPI(endpoint, requestBody, apiKey, useBackground = false) {
    if (isProduction) {
        // Production: Use Netlify functions
        if (useBackground) {
            // Use background function for long-running tasks
            const response = await fetch(BACKGROUND_FUNCTION_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'start',
                    endpoint,
                    body: requestBody
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Background job start failed: ${response.statusText} - ${errorText}`);
            }

            const { jobId } = await response.json();
            return await pollJobStatus(jobId);

        } else {
            // Use regular function for quick tasks
            const response = await fetch(FUNCTION_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ endpoint, body: requestBody })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`API error: ${response.statusText} - ${errorText}`);
            }

            return await response.json();
        }
    } else {
        // Development: Direct API call
        const API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
        const url = `${API_BASE_URL}/${endpoint}?key=${apiKey}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API error: ${response.statusText} - ${errorText}`);
        }

        return await response.json();
    }
}

/**
 * Poll background job status until completion
 */
async function pollJobStatus(jobId, onProgress = null) {
    const maxAttempts = 180; // 15 minutes max (5 second intervals)
    let attempts = 0;

    while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 5000)); // Poll every 5 seconds

        const response = await fetch(BACKGROUND_FUNCTION_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'status',
                jobId
            })
        });

        if (!response.ok) {
            throw new Error(`Failed to check job status: ${response.statusText}`);
        }

        const status = await response.json();

        // Call progress callback if provided
        if (onProgress && status.progress) {
            onProgress(status.progress, status.message || '');
        }

        if (status.status === 'completed') {
            return status.result;
        }

        if (status.status === 'failed') {
            throw new Error(status.error || 'Background job failed');
        }

        attempts++;
    }

    throw new Error('Job timeout - exceeded maximum wait time');
}

/**
 * Generate story content using Google Gemini
 * Uses background function to avoid 26s timeout
 */
export async function generateStoryContent(childName, storyPrompt, pageCount, apiKey, onProgress = null) {
    const startTime = performance.now();

    logger.info('STORY-GEN', 'Starting story generation', {
        childName,
        pageCount,
        promptLength: storyPrompt.length
    });

    const prompt = `You are a master children's book author. Create an enchanting ${pageCount}-page storybook.

STORY THEME: ${storyPrompt}
MAIN CHARACTER: ${childName}

REQUIREMENTS:
1. TARGET AUDIENCE: Ages 3-8
2. LENGTH: Exactly ${pageCount} pages
3. TONE: Warm, encouraging, age-appropriate
4. STRUCTURE:
   - Start with an engaging hook
   - Build excitement with each page
   - End with heartwarming resolution

5. VISUAL CONSISTENCY (CRITICAL):
   - OUTFIT: ${childName} wears ONE specific outfit throughout
   - CHARACTERS: Define ALL characters with specific appearance details
   - LOCATIONS: Each location has consistent colors, furniture, style

6. THEMES: Friendship, courage, kindness, curiosity

OUTPUT FORMAT (JSON):
{
    "title": "Memorable title (2-4 words)",
    "characterOutfit": "Precise outfit description",
    "characters": {
        "${childName}": "Main character",
        "characterName2": "DETAILED appearance"
    },
    "locations": {
        "locationName": "Vivid description"
    },
    "pages": [
        {
            "pageNumber": 1,
            "text": "2-4 sentences with vivid verbs",
            "location": "locationName",
            "charactersPresent": ["${childName}", "..."],
            "imagePrompt": "Detailed scene description"
        }
    ]
}`;

    try {
        // Use background function in production for stories (they can take 30s+)
        const useBackground = isProduction;

        const data = await retryWithBackoff(async () => {
            return await callGoogleAPI(
                'models/gemini-2.5-flash:generateContent',
                {
                    contents: [{
                        parts: [{ text: prompt }]
                    }],
                    generationConfig: {
                        response_mime_type: 'application/json'
                    }
                },
                apiKey,
                useBackground
            );
        });

        const text = data.candidates[0].content.parts[0].text;
        const storyData = JSON.parse(text);

        const totalDuration = performance.now() - startTime;
        logger.info('STORY-GEN', 'Story generated successfully', {
            duration: totalDuration,
            pageCount: storyData.pages?.length
        });

        return storyData;

    } catch (error) {
        logger.error('STORY-GEN', 'Story generation failed', error);
        throw error;
    }
}

/**
 * Analyze person photo for character consistency
 */
export async function analyzePersonPhoto(photoBase64, personName, apiKey) {
    logger.info('CHARACTER', 'Analyzing person photo');

    const prompt = `Analyze this photo of ${personName}. Provide VERY detailed character description.

CRITICAL: Pay special attention to hair!

Describe in EXTREME detail:
1. Skin tone
2. HAIR COLOR (exact shade)
3. HAIR STYLE (length, texture, part, styling, bangs, volume)
4. Eye color
5. Age
6. Distinctive features

JSON response:
{
    "characterDescription": "Detailed paragraph EMPHASIZING HAIR",
    "skinTone": "specific tone",
    "hairColor": "EXACT shade",
    "hairStyle": "VERY DETAILED description",
    "hairLength": "specific length",
    "hairTexture": "texture type",
    "eyeColor": "color",
    "approximateAge": "age range",
    "distinctiveFeatures": "features or none"
}`;

    try {
        const base64Data = photoBase64.split(',')[1];

        const data = await retryWithBackoff(async () => {
            return await callGoogleAPI(
                'models/gemini-2.5-flash:generateContent',
                {
                    contents: [{
                        parts: [
                            { text: prompt },
                            {
                                inline_data: {
                                    mime_type: 'image/jpeg',
                                    data: base64Data
                                }
                            }
                        ]
                    }],
                    generationConfig: {
                        response_mime_type: 'application/json'
                    }
                },
                apiKey,
                false // Don't use background for quick analysis
            );
        });

        const text = data.candidates[0].content.parts[0].text;
        return JSON.parse(text);

    } catch (error) {
        logger.error('CHARACTER', 'Character analysis failed', error);
        throw error;
    }
}

/**
 * Generate page image using Google Imagen
 * Note: Image generation is quick (5-10s), no need for background function
 */
export async function generatePageImage(imagePrompt, apiKey, pageNumber = 0, childPhoto = null, childName = '', characterDescription = null, storyContext = null) {
    const startTime = performance.now();

    logger.info('IMAGE-GEN', `Generating image for page ${pageNumber}`);

    try {
        let fullPrompt = `Children's book illustration: ${imagePrompt}\n\nStyle: vibrant, child-friendly, professional storybook art.`;

        if (characterDescription) {
            fullPrompt += `\n\nMAIN CHARACTER (${childName}) - MUST BE CONSISTENT:\n`;
            fullPrompt += `- Skin: ${characterDescription.skinTone}\n`;
            fullPrompt += `- Hair Color: ${characterDescription.hairColor} (NEVER CHANGE!)\n`;
            fullPrompt += `- Hair Style: ${characterDescription.hairStyle} (NEVER CHANGE!)\n`;
            fullPrompt += `- Eyes: ${characterDescription.eyeColor}`;
        }

        if (storyContext) {
            if (storyContext.characterOutfit) {
                fullPrompt += `\n\nOUTFIT (SAME IN ALL IMAGES): ${storyContext.characterOutfit}`;
            }

            if (storyContext.characters) {
                const otherChars = Object.entries(storyContext.characters)
                    .filter(([name]) => name !== childName)
                    .map(([name, desc]) => `- ${name}: ${desc}`)
                    .join('\n');
                if (otherChars) {
                    fullPrompt += `\n\nOTHER CHARACTERS (MUST BE CONSISTENT):\n${otherChars}`;
                }
            }
        }

        const data = await retryWithBackoff(async () => {
            return await callGoogleAPI(
                'models/imagen-3.0-generate-001:predict',
                {
                    instances: [{
                        prompt: fullPrompt
                    }],
                    parameters: {
                        sampleCount: 1,
                        aspectRatio: '4:3'
                    }
                },
                apiKey,
                false // No background needed for images (quick generation)
            );
        });

        const imageData = data.predictions[0].bytesBase64Encoded;
        const imageUrl = `data:image/png;base64,${imageData}`;

        const totalDuration = performance.now() - startTime;
        logger.info('IMAGE-GEN', `Page ${pageNumber} generated in ${totalDuration}ms`);

        return imageUrl;

    } catch (error) {
        logger.error('IMAGE-GEN', `Page ${pageNumber} failed`, error);
        throw error;
    }
}
