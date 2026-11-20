// Unified AI Provider Service - Switch between NanoGPT, Google AI and OpenRouter
import * as googleAPI from './googleAPI';
import * as openRouterAPI from './openRouterAPI';
import * as nanoGptAPI from './nanoGptAPI';
import { getApiKey, getOpenRouterKey, getAIProvider, setAIProvider } from './storageService';
import logger from '../utils/logger';

/**
 * Available AI providers
 */
export const AI_PROVIDERS = {
    GOOGLE: 'google',
    OPENROUTER: 'openrouter',
    NANOGPT: 'nanogpt'
};

/**
 * Get the current active provider.
 * Default is NanoGPT (Seedream images — the model that passed the likeness
 * test). Until NANOGPT_API_KEY is configured server-side, every NanoGPT call
 * throws `notConfigured` and the wrappers below fall back to OpenRouter
 * automatically, so the site keeps working during the switch-over.
 */
export function getCurrentProvider() {
    return getAIProvider() || AI_PROVIDERS.NANOGPT;
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
function getProviderApiKey(provider = getCurrentProvider()) {
    // In production, serverless functions handle API keys
    // No need to check on the client side
    if (import.meta.env.PROD) {
        return null; // Will be handled by Netlify function
    }

    if (provider === AI_PROVIDERS.GOOGLE) {
        return getApiKey(); // Google AI Studio key
    } else if (provider === AI_PROVIDERS.NANOGPT) {
        try {
            return localStorage.getItem('nanogpt_api_key');
        } catch {
            return null;
        }
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
function getProviderAPI(provider = getCurrentProvider()) {
    if (provider === AI_PROVIDERS.GOOGLE) {
        return googleAPI;
    } else if (provider === AI_PROVIDERS.NANOGPT) {
        return nanoGptAPI;
    } else {
        return openRouterAPI;
    }
}

/**
 * Try providers in order — the selected one first, then NanoGPT, OpenRouter,
 * Google — until one succeeds. A provider can be dead in ways that have
 * nothing to do with the visitor (e.g. OpenRouter answering "User not found"
 * for a revoked key), so a hard failure should fall through to the next
 * provider instead of failing the whole book. The last error is thrown.
 */
async function attemptProviders(selected, runFor) {
    const order = [selected, AI_PROVIDERS.NANOGPT, AI_PROVIDERS.OPENROUTER, AI_PROVIDERS.GOOGLE]
        .filter((p, i, a) => a.indexOf(p) === i);
    let lastError;
    for (const p of order) {
        try {
            return await runFor(p);
        } catch (error) {
            lastError = error;
            logger.warn('PROVIDER', `Provider ${p} failed — trying next`, { error: error.message });
        }
    }
    throw lastError;
}

/**
 * Run a provider call; when the active provider is NanoGPT but it isn't
 * configured server-side yet (error.notConfigured), retry once on OpenRouter
 * so generation never hard-fails during the switch-over.
 */
async function withFallback(provider, run, openRouterRun) {
    try {
        return await run();
    } catch (error) {
        if (provider === AI_PROVIDERS.NANOGPT && error && error.notConfigured) {
            logger.warn('PROVIDER', 'NanoGPT not configured — falling back to OpenRouter');
            return await openRouterRun();
        }
        throw error;
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

        return await attemptProviders(provider,
            (p) => getProviderAPI(p).generateStoryContent(childName, storyPrompt, pageCount, getProviderApiKey(p), childAge, onProgress));
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

        return await withFallback(provider,
            () => api.analyzePersonPhoto(photoBase64, personName, apiKey, childAge),
            () => openRouterAPI.analyzePersonPhoto(photoBase64, personName, getOpenRouterKey(), childAge));
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

        return await attemptProviders(provider,
            (p) => getProviderAPI(p).generatePageImage(
                imagePrompt,
                getProviderApiKey(p),
                pageNumber,
                childPhoto,
                childName,
                characterDescription,
                storyContext,
                childAge
            ));
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
        [AI_PROVIDERS.NANOGPT]: {
            name: 'NanoGPT',
            model: 'GPT-4o mini (text + vision)',
            imageModel: 'Seedream 5.5',
            timeout: 'Server-side proxy',
            pros: ['Best likeness from the photo', 'Cheap per book', 'Switchable models'],
            cons: ['Needs NANOGPT_API_KEY configured'],
            keyUrl: 'https://nano-gpt.com'
        },
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
