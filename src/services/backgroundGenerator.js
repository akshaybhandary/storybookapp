// Background Image Generation Service
// Uses Netlify Background Function for parallel image generation (up to 15 min)

import logger from '../utils/logger';

const BACKGROUND_FUNCTION_URL = '/.netlify/functions/generate-images-background';
const POLL_INTERVAL = 2000; // Poll every 2 seconds
const MAX_POLL_TIME = 15 * 60 * 1000; // 15 minutes max

/**
 * Generate all story images in parallel using background function
 * Much faster than sequential generation!
 */
export async function generateImagesInBackground(
    storyContent,
    childPhoto,
    childName,
    characterDescription,
    onProgress
) {
    // Only use background function in production
    if (!import.meta.env.PROD) {
        throw new Error('Background function only available in production');
    }

    logger.info('BACKGROUND-GEN', 'Starting parallel image generation', {
        pageCount: storyContent.pages.length
    });

    // Prepare all image prompts
    const imagePrompts = [];

    // Cover image
    imagePrompts.push({
        pageNumber: 0,
        prompt: `Create a stunning storybook cover illustration for "${storyContent.title}". The cover should show ${childName} as the main character in an exciting pose or scene that captures the essence of the story. Style: vibrant, child-friendly, professional children's book cover art. Include magical elements, wonder, and adventure. Make it eye-catching and inviting.`,
        text: '',
        isCover: true
    });

    // Story pages
    for (const page of storyContent.pages) {
        imagePrompts.push({
            pageNumber: page.pageNumber,
            prompt: page.imagePrompt,
            text: page.text,
            isCover: false
        });
    }

    // Start background job
    const response = await fetch(BACKGROUND_FUNCTION_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'generate_images',
            imagePrompts,
            storyContext: {
                characterOutfit: storyContent.characterOutfit,
                locations: storyContent.locations,
                characters: storyContent.characters || {}
            },
            childPhoto,
            childName,
            characterDescription
        })
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to start background job: ${error}`);
    }

    const { jobId, status: initialStatus } = await response.json();
    logger.info('BACKGROUND-GEN', 'Background job started', { jobId });

    // Poll for completion
    const startTime = Date.now();

    while (Date.now() - startTime < MAX_POLL_TIME) {
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));

        const statusResponse = await fetch(`${BACKGROUND_FUNCTION_URL}?jobId=${jobId}`);

        if (!statusResponse.ok) {
            const error = await statusResponse.text();
            logger.warn('BACKGROUND-GEN', 'Status check failed', { error });
            continue;
        }

        const job = await statusResponse.json();

        // Update progress callback
        if (onProgress) {
            onProgress(job.progress, job.message);
        }

        logger.debug('BACKGROUND-GEN', 'Job status', {
            jobId,
            status: job.status,
            progress: job.progress
        });

        if (job.status === 'completed') {
            logger.info('BACKGROUND-GEN', 'All images generated successfully', {
                count: job.result?.length
            });
            return job.result;
        }

        if (job.status === 'failed') {
            throw new Error(job.error || 'Background job failed');
        }
    }

    throw new Error('Image generation timed out');
}

/**
 * Check if background generation is available
 */
export function isBackgroundGenerationAvailable() {
    return import.meta.env.PROD;
}
