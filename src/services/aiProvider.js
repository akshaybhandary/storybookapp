// Unified AI Provider Service - Switch between Google AI and OpenRouter
import * as googleAPI from './googleAPI';
import * as openRouterAPI from './openRouterAPI';
import { getApiKey, getOpenRouterKey, getAIProvider, setAIProvider } from './storageService';
import logger from '../utils/logger';

/**
 * Available AI providers
 */
export const AI_PROVIDERS = {
    GOOGLE: 'google',
    OPENROUTER: 'openrouter'
};

/**
 * Get the current active provider
 */
export function getCurrentProvider() {
    return getAIProvider() || AI_PROVIDERS.OPENROUTER; // Default to OpenRouter
}

/**
 * Switch between AI providers
 */
export function switchProvider(provider) {
    if (!Object.values(AI_PROVIDERS).includes(provider)) {
        throw new Error(`Invalid provider: ${provider}`);
    }
    setAIProvider(provider);
    logger.info('PROVIDER', `Switched to ${provider}`, { provider });
}

/**
 * Get the appropriate API key for the current provider
 * In production, returns null (Netlify function handles it)
 * In development, checks localStorage and env vars
 */
function getProviderApiKey() {
    // In production, serverless functions handle API keys
    // No need to check on the client side
    if (import.meta.env.PROD) {
        return null; // Will be handled by Netlify function
    }

    const provider = getCurrentProvider();

    if (provider === AI_PROVIDERS.GOOGLE) {
        return getApiKey(); // Google AI Studio key
    } else {
        return getOpenRouterKey(); // OpenRouter key
    }
}

/**
 * Check if API key is required (only in development)
 */
function isApiKeyRequired() {
    return !import.meta.env.PROD;
}

/**
 * Get provider-specific API implementation
 */
function getProviderAPI() {
    const provider = getCurrentProvider();

    if (provider === AI_PROVIDERS.GOOGLE) {
        return googleAPI;
    } else {
        return openRouterAPI;
    }
}

/**
 * Generate story content - automatically routes to correct provider
 */
export async function generateStoryContent(childName, storyPrompt, pageCount, childAge, onProgress = null) {
    const provider = getCurrentProvider();
    const apiKey = getProviderApiKey();
    const api = getProviderAPI();

    logger.info('PROVIDER', 'Generating story', { provider, pageCount, childAge });

    try {
        // Only check for API key in development mode
        // In production, Netlify functions handle the key
        if (isApiKeyRequired() && !apiKey) {
            throw new Error(`Please set your ${provider === AI_PROVIDERS.GOOGLE ? 'Google AI Studio' : 'OpenRouter'} API key in settings`);
        }

        return await api.generateStoryContent(childName, storyPrompt, pageCount, apiKey, childAge, onProgress);
    } catch (error) {
        logger.error('PROVIDER', `Story generation failed with ${provider}`, error);
        throw error;
    }
}

/**
 * Analyze person photo - automatically routes to correct provider
 */
export async function analyzePersonPhoto(photoBase64, personName, childAge) {
    const provider = getCurrentProvider();
    const apiKey = getProviderApiKey();
    const api = getProviderAPI();

    logger.info('PROVIDER', 'Analyzing photo', { provider, childAge });

    try {
        if (isApiKeyRequired() && !apiKey) {
            throw new Error(`Please set your ${provider === AI_PROVIDERS.GOOGLE ? 'Google AI Studio' : 'OpenRouter'} API key in settings`);
        }

        return await api.analyzePersonPhoto(photoBase64, personName, apiKey, childAge);
    } catch (error) {
        logger.error('PROVIDER', `Photo analysis failed with ${provider}`, error);
        throw error;
    }
}

/**
 * Generate page image - automatically routes to correct provider
 */
export async function generatePageImage(
    imagePrompt,
    pageNumber = 0,
    childPhoto = null,
    childName = '',
    characterDescription = null,
    storyContext = null,
    childAge = null
) {
    const provider = getCurrentProvider();
    const apiKey = getProviderApiKey();
    const api = getProviderAPI();

    try {
        if (isApiKeyRequired() && !apiKey) {
            throw new Error(`Please set your ${provider === AI_PROVIDERS.GOOGLE ? 'Google AI Studio' : 'OpenRouter'} API key in settings`);
        }

        return await api.generatePageImage(
            imagePrompt,
            apiKey,
            pageNumber,
            childPhoto,
            childName,
            characterDescription,
            storyContext,
            childAge
        );
    } catch (error) {
        logger.error('PROVIDER', `Image generation failed with ${provider} on page ${pageNumber}`, error);
        throw error;
    }
}

/**
 * Get provider info for UI display
 */
export function getProviderInfo() {
    const provider = getCurrentProvider();
    const hasKey = !!getProviderApiKey();

    const info = {
        [AI_PROVIDERS.GOOGLE]: {
            name: 'Google AI Studio',
            model: 'Gemini 2.5 Flash',
            imageModel: 'Imagen 3.0',
            timeout: '26s (Netlify limit)',
            pros: ['Direct from Google', 'Latest models', 'High quality'],
            cons: ['26s timeout', 'Needs Netlify function'],
            keyUrl: 'https://aistudio.google.com/apikey'
        },
        [AI_PROVIDERS.OPENROUTER]: {
            name: 'OpenRouter',
            model: 'Gemini 2.5 Flash',
            imageModel: 'Gemini 2.5 Flash Image',
            timeout: '90s+ (longer limits)',
            pros: ['Longer timeouts', 'Fallback options', 'Better for long stories'],
            cons: ['Extra hop', 'Slightly slower'],
            keyUrl: 'https://openrouter.ai/keys'
        }
    };

    return {
        current: provider,
        hasKey,
        details: info[provider],
        available: info
    };
}
