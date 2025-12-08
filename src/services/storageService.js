// Local Storage Service with Logging
import logger from '../utils/logger';

/**
 * Get all saved stories from localStorage
 */
export function getSavedStories() {
    try {
        const stories = localStorage.getItem('saved_stories');
        const parsed = stories ? JSON.parse(stories) : [];
        logger.storageOperation('GET_STORIES', true, { count: parsed.length });
        return parsed;
    } catch (error) {
        logger.error('STORAGE', 'Failed to get saved stories', error);
        logger.storageOperation('GET_STORIES', false, { error: error.message });
        return [];
    }
}

/**
 * Save stories to localStorage with quota handling
 */
export function saveStories(stories) {
    try {
        const dataStr = JSON.stringify(stories);
        const dataSizeKB = Math.round(dataStr.length / 1024);

        logger.debug('STORAGE', 'Attempting to save stories', {
            count: stories.length,
            sizeKB: dataSizeKB
        });

        localStorage.setItem('saved_stories', dataStr);
        logger.storageOperation('SAVE_STORIES', true, {
            count: stories.length,
            sizeKB: dataSizeKB
        });
        return { success: true, sizeKB: dataSizeKB };
    } catch (error) {
        logger.error('STORAGE', 'Failed to save stories', error, { count: stories.length });
        logger.storageOperation('SAVE_STORIES', false, { error: error.message });

        // Check if quota exceeded
        if (error.name === 'QuotaExceededError' || error.code === 22) {
            return {
                success: false,
                error: 'QUOTA_EXCEEDED',
                message: 'Storage is full. Please delete some old stories to save new ones.'
            };
        }

        return {
            success: false,
            error: 'UNKNOWN',
            message: error.message
        };
    }
}

/**
 * Add a story to saved stories
 */
export function saveStory(story) {
    const stories = getSavedStories();

    // Check if already saved
    const existingIndex = stories.findIndex(s => s.id === story.id);
    if (existingIndex !== -1) {
        logger.info('STORAGE', 'Story already saved', { storyId: story.id, title: story.title });
        return { success: false, alreadySaved: true };
    }

    // Add timestamp
    story.savedAt = new Date().toISOString();

    // Add to beginning of array
    stories.unshift(story);

    const result = saveStories(stories);
    if (result.success) {
        logger.info('STORAGE', 'Story saved successfully', {
            storyId: story.id,
            title: story.title,
            pageCount: story.pages?.length,
            sizeKB: result.sizeKB
        });
    }

    return result;
}

/**
 * Delete a story by ID
 */
export function deleteStory(storyId) {
    const stories = getSavedStories();
    const filtered = stories.filter(s => s.id !== storyId);
    const success = saveStories(filtered);

    if (success) {
        logger.info('STORAGE', 'Story deleted', { storyId, remainingCount: filtered.length });
    }

    return success;
}

/**
 * Check if a story is saved
 */
export function isStorySaved(storyId) {
    const stories = getSavedStories();
    const saved = stories.some(s => s.id === storyId);
    logger.debug('STORAGE', 'Check if story saved', { storyId, saved });
    return saved;
}

/**
 * Get/Set API Key
 * In development: Check localStorage first, then .env file
 * In production: Serverless function handles API key, return null
 */
export function getApiKey() {
    // In production, serverless function handles API key
    if (import.meta.env.PROD) {
        return null;  // Not needed - serverless function has it
    }

    // Development: Check localStorage first
    const localKey = localStorage.getItem('openrouter_api_key');
    if (localKey) {
        logger.debug('STORAGE', 'API key from localStorage', { hasKey: true });
        return localKey;
    }

    // Then check .env file (Vite loads VITE_ prefixed vars)
    const envKey = import.meta.env.VITE_OPENROUTER_API_KEY;
    if (envKey) {
        logger.debug('STORAGE', 'API key from .env file', { hasKey: true });
        return envKey;
    }

    logger.debug('STORAGE', 'No API key found');
    return null;
}

export function setApiKey(apiKey) {
    if (apiKey) {
        localStorage.setItem('google_api_key', apiKey);
        logger.info('STORAGE', 'API key saved', { keyLength: apiKey.length });
        return true;
    }
    logger.warn('STORAGE', 'Attempted to save empty API key');
    return false;
}

/**
 * Get/Set OpenRouter API Key
 */
export function getOpenRouterKey() {
    // In production, serverless function handles API key
    if (import.meta.env.PROD) {
        return null;
    }

    const localKey = localStorage.getItem('openrouter_api_key');
    if (localKey) {
        logger.debug('STORAGE', 'OpenRouter key from localStorage', { hasKey: true });
        return localKey;
    }

    const envKey = import.meta.env.VITE_OPENROUTER_API_KEY;
    if (envKey) {
        logger.debug('STORAGE', 'OpenRouter key from .env file', { hasKey: true });
        return envKey;
    }

    logger.debug('STORAGE', 'No OpenRouter key found');
    return null;
}

export function setOpenRouterKey(apiKey) {
    if (apiKey) {
        localStorage.setItem('openrouter_api_key', apiKey);
        logger.info('STORAGE', 'OpenRouter key saved', { keyLength: apiKey.length });
        return true;
    }
    logger.warn('STORAGE', 'Attempted to save empty OpenRouter key');
    return false;
}

/**
 * Get/Set AI Provider (google or openrouter)
 */
export function getAIProvider() {
    const provider = localStorage.getItem('ai_provider');
    logger.debug('STORAGE', 'Get AI provider', { provider: provider || 'default' });
    return provider || 'openrouter';
}

export function setAIProvider(provider) {
    if (provider) {
        localStorage.setItem('ai_provider', provider);
        logger.info('STORAGE', 'AI provider saved', { provider });
        return true;
    }
    return false;
}
