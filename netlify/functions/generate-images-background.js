// Netlify Background Function for Story Generation
// Runs up to 15 minutes - perfect for generating all images in parallel
// Note: For true production, use Redis or Supabase for job storage

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Simple in-memory job store (resets on cold start - fine for demo, use Redis for production)
// Jobs expire after 30 minutes
const jobs = new Map();

// Clean up old jobs periodically
function cleanupJobs() {
    const now = Date.now();
    for (const [jobId, job] of jobs.entries()) {
        if (now - job.createdAt > 30 * 60 * 1000) { // 30 minutes
            jobs.delete(jobId);
        }
    }
}

export const handler = async (event, context) => {
    // Clean up old jobs on each request
    cleanupJobs();

    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle CORS preflight
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    // GET request - Check job status
    if (event.httpMethod === 'GET') {
        const jobId = event.queryStringParameters?.jobId;

        if (!jobId) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Missing jobId parameter' })
            };
        }

        const job = jobs.get(jobId);
        if (!job) {
            return {
                statusCode: 404,
                headers,
                body: JSON.stringify({ error: 'Job not found or expired' })
            };
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                jobId,
                status: job.status,
                progress: job.progress,
                message: job.message,
                result: job.result,
                error: job.error
            })
        };
    }

    // POST request - Start a new job
    if (event.httpMethod === 'POST') {
        const body = JSON.parse(event.body);
        const { action, ...requestData } = body;

        if (action === 'generate_images') {
            const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

            // Initialize job
            jobs.set(jobId, {
                status: 'processing',
                progress: 0,
                message: 'Starting image generation...',
                result: null,
                error: null,
                createdAt: Date.now()
            });

            // Start background processing (don't await!)
            processImagesInBackground(jobId, requestData).catch(err => {
                console.error(`Job ${jobId} failed:`, err);
                const job = jobs.get(jobId);
                if (job) {
                    job.status = 'failed';
                    job.error = err.message;
                }
            });

            // Return immediately with job ID
            return {
                statusCode: 202,
                headers,
                body: JSON.stringify({
                    jobId,
                    status: 'processing',
                    message: 'Image generation started. Poll for status.'
                })
            };
        }

        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'Unknown action' })
        };
    }

    return {
        statusCode: 405,
        headers,
        body: JSON.stringify({ error: 'Method not allowed' })
    };
};

/**
 * Background image generation - generates all images in parallel
 */
async function processImagesInBackground(jobId, data) {
    const { imagePrompts, storyContext, childPhoto, childName, characterDescription } = data;
    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
        throw new Error('OPENROUTER_API_KEY not configured');
    }

    const job = jobs.get(jobId);
    if (!job) return;

    const totalImages = imagePrompts.length;
    const results = [];
    let completed = 0;

    // Generate all images in parallel!
    const promises = imagePrompts.map(async (prompt, index) => {
        try {
            const imageUrl = await generateSingleImage(
                apiKey,
                prompt.prompt,
                prompt.pageNumber,
                childPhoto,
                childName,
                characterDescription,
                storyContext
            );

            results[index] = {
                pageNumber: prompt.pageNumber,
                text: prompt.text || '',
                image: imageUrl,
                isCover: prompt.isCover || false
            };

        } catch (error) {
            console.error(`Image ${index} failed:`, error.message);
            results[index] = {
                pageNumber: prompt.pageNumber,
                text: prompt.text || '',
                image: null,
                error: error.message,
                isCover: prompt.isCover || false
            };
        }

        // Update progress
        completed++;
        job.progress = Math.round((completed / totalImages) * 100);
        job.message = `Generated ${completed} of ${totalImages} images...`;
    });

    // Wait for all images to complete
    await Promise.all(promises);

    // Mark job as complete
    job.status = 'completed';
    job.progress = 100;
    job.message = 'All images generated!';
    job.result = results;
}

/**
 * Generate a single image using OpenRouter
 */
async function generateSingleImage(apiKey, imagePrompt, pageNumber, childPhoto, childName, characterDescription, storyContext) {
    // Build enhanced prompt with character consistency
    let enhancedPrompt = `Create a children's book illustration: ${imagePrompt}`;

    if (characterDescription) {
        enhancedPrompt += `\n\nCHARACTER APPEARANCE (MAINTAIN EXACT CONSISTENCY):
- Skin tone: ${characterDescription.skinTone || 'as described'}
- Hair Color (NEVER CHANGE): ${characterDescription.hairColor || 'as described'}
- Hair Style (NEVER CHANGE): ${characterDescription.hairStyle || 'as described'}
- Eyes: ${characterDescription.eyeColor || 'as described'}`;
    }

    if (storyContext) {
        if (storyContext.characterOutfit) {
            enhancedPrompt += `\n\nOUTFIT (SAME IN ALL IMAGES): ${storyContext.characterOutfit}`;
        }
        if (storyContext.characters) {
            const otherChars = Object.entries(storyContext.characters)
                .filter(([name]) => name !== childName)
                .map(([name, desc]) => `- ${name}: ${desc}`)
                .join('\n');
            if (otherChars) {
                enhancedPrompt += `\n\nOTHER CHARACTERS:\n${otherChars}`;
            }
        }
    }

    enhancedPrompt += `\n\nStyle: Vibrant, colorful, whimsical, professional children's book illustration.
Quality: High quality, detailed, suitable for ages 4-8.
Page: ${pageNumber}`;

    // Build message content
    let messageContent;
    if (childPhoto) {
        messageContent = [
            { type: 'image_url', image_url: { url: childPhoto } },
            { type: 'text', text: enhancedPrompt }
        ];
    } else {
        messageContent = enhancedPrompt;
    }

    const response = await fetch(OPENROUTER_API_URL, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://yourstorybook.store',
            'X-Title': 'StoryBook Magic'
        },
        body: JSON.stringify({
            model: 'google/gemini-2.5-flash-preview-05-20',
            messages: [{ role: 'user', content: messageContent }],
            modalities: ['image', 'text'],
            image_config: { aspect_ratio: '4:3' }
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    // Extract image URL from response
    if (data.choices?.[0]?.message?.images?.[0]?.image_url?.url) {
        return data.choices[0].message.images[0].image_url.url;
    }

    if (Array.isArray(data.choices?.[0]?.message?.content)) {
        for (const item of data.choices[0].message.content) {
            if (item.type === 'image_url' && item.image_url?.url) {
                return item.image_url.url;
            }
        }
    }

    throw new Error('No image in API response');
}
