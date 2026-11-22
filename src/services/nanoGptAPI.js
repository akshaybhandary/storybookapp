// NanoGPT API Service — story text, photo analysis, and Seedream images.
//
// Mirrors the openRouterAPI interface so aiProvider can route between them:
//   generateStoryContent(childName, theme, pageCount, apiKey, childAge)
//   analyzePersonPhoto(photoBase64, personName, apiKey, childAge)
//   generatePageImage(imagePrompt, apiKey, pageNumber, childPhoto, childName,
//                     characterDescription, storyContext, childAge)
//
// Production calls run as background jobs (the key stays server-side):
// start /.netlify/functions/nanogpt-job-background, poll
// /.netlify/functions/nanogpt for the result. Until NANOGPT_API_KEY is set,
// this module throws an error with `notConfigured = true`, which aiProvider
// uses to fall back to the OpenRouter path automatically.
//
// Models (overridable server-side via NANOGPT_TEXT_MODEL / NANOGPT_IMAGE_MODEL):
//   text + vision: openai/gpt-4o-mini (cheap, strong JSON, sees photos)
//   images:        bytedance/seedream-v5.5 (image-to-image from the child's
//                  photo — the model that passed the likeness test)
import logger from '../utils/logger';

const TEXT_MODEL = 'openai/gpt-4o-mini';
const IMAGE_MODEL = 'bytedance/seedream-v5.5';
// Seedream takes a resolution token: '1k' | '1.5k' | '2k'. 1.5k keeps the
// result small enough to hand back through a function response (~180 DPI at
// 8.5in — fine for print); 2k results can exceed the response size limit.
const IMAGE_SIZE = '1.5k';

const isProduction = import.meta.env.PROD;
const FUNCTION_URL = '/.netlify/functions/nanogpt';
const JOB_URL = '/.netlify/functions/nanogpt-job-background';
const DIRECT_BASE = 'https://api.nano-gpt.com/api/v1';

function devKey() {
    try {
        return localStorage.getItem('nanogpt_api_key');
    } catch {
        return null;
    }
}

function notConfiguredError() {
    const err = new Error('NanoGPT is not configured yet.');
    err.notConfigured = true;
    return err;
}

// Function invocations reject oversized payloads (HTTP 413) — a phone photo
// can be several MB. Downscale reference photos to at most 1024px JPEG
// (~150 KB) before sending; that's plenty for the models to work from.
// Cached per source string so a whole book only pays the cost once.
const downscaleCache = new Map();
async function downscaleDataUrl(dataUrl, maxDim = 1024) {
    if (!dataUrl || !dataUrl.startsWith('data:image')) return dataUrl;
    if (downscaleCache.has(dataUrl)) return downscaleCache.get(dataUrl);
    try {
        const img = new Image();
        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
            img.src = dataUrl;
        });
        const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
        if (scale >= 1 && dataUrl.startsWith('data:image/jpeg')) {
            downscaleCache.set(dataUrl, dataUrl);
            return dataUrl;
        }
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.naturalWidth * scale);
        canvas.height = Math.round(img.naturalHeight * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        const out = canvas.toDataURL('image/jpeg', 0.85);
        downscaleCache.set(dataUrl, out);
        return out;
    } catch {
        return dataUrl; // if anything goes wrong, send the original
    }
}

// Production generation runs as a background job: Seedream takes 30–80s and
// a full story call 20–40s, both far past a normal function's ~10s limit.
// Start the job, then poll the status function until it completes.
async function runJob(kind, body, timeoutMs) {
    const jobId = (window.crypto && crypto.randomUUID)
        ? crypto.randomUUID()
        : `job-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    const start = await fetch(JOB_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, kind, body })
    });
    if (start.status === 404) throw new Error('NanoGPT job function is not deployed yet');

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 2500));
        const res = await fetch(`${FUNCTION_URL}?jobId=${encodeURIComponent(jobId)}`);
        const data = await res.json().catch(() => ({}));
        if (data.status === 'not_configured') throw notConfiguredError();
        if (data.status === 'done') return data.result;
        if (data.status === 'error') {
            if (data.error === 'not_configured') throw notConfiguredError();
            throw new Error(data.error || 'NanoGPT generation failed');
        }
        // 'pending' — keep polling
    }
    throw new Error('NanoGPT generation timed out — please try again');
}

async function callChat(body, apiKey) {
    if (isProduction) {
        return runJob('chat', body, 240000);
    }
    const key = apiKey || devKey();
    const res = await fetch(`${DIRECT_BASE}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`NanoGPT chat failed (${res.status}): ${data.error?.message || res.statusText}`);
    return data;
}

async function callImage(body) {
    if (isProduction) {
        const result = await runJob('image', body, 300000);
        if (!result?.dataUrl) throw new Error('NanoGPT image job returned no dataUrl');
        return result.dataUrl;
    }
    const key = devKey();
    // Image generation lives under /v1, not /api/v1 (verified against the API)
    const res = await fetch('https://api.nano-gpt.com/v1/images/generations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`NanoGPT image failed (${res.status}): ${data.error?.message || res.statusText}`);
    const first = data.data?.[0];
    if (first?.b64_json) return `data:image/png;base64,${first.b64_json}`;
    if (first?.url) return first.url;
    throw new Error('NanoGPT image response had no image');
}

function parseStoryJson(content) {
    try {
        return JSON.parse(content);
    } catch (e) {
        const match = content.match(/\{[\s\S]*\}/);
        if (match) return JSON.parse(match[0]);
        throw new Error('Failed to parse story content');
    }
}


/**
 * Consistency repair: the story model sometimes sets pages in locations it
 * never defined (or uses props it never defined), leaving those pages with
 * no visual anchor. Ask the text model to define just the missing entries
 * and merge them in; fall back to a generic definition so no page is left
 * without one.
 */
async function repairStoryConsistency(storyData, apiKey) {
    try {
        storyData.locations = storyData.locations || {};
        storyData.props = storyData.props || {};
        const pages = storyData.pages || [];
        const missingLocations = [...new Set(pages.map(p => p.location).filter(l => l && !storyData.locations[l]))];
        const missingProps = [...new Set(pages.flatMap(p => p.propsPresent || []).filter(n => !storyData.props[n]))];
        if (!missingLocations.length && !missingProps.length) return storyData;

        logger.warn('STORY-GEN', 'Repairing undefined locations/props', { missingLocations, missingProps });
        const data = await callChat({
            model: TEXT_MODEL,
            messages: [{
                role: 'user',
                content: `A children's storybook titled "${storyData.title}" needs visual-consistency definitions. Story outfit: ${storyData.characterOutfit || 'unknown'}. Locations already defined: ${Object.keys(storyData.locations).join(', ') || 'none'}.

Define each of these in the SAME style (specific colors, key features, details an illustrator can reproduce identically):
- Locations needing a definition: ${JSON.stringify(missingLocations)}
- Recurring objects (props) needing a definition: ${JSON.stringify(missingProps)}

Respond with JSON only: { "locations": { "name": "vivid description" }, "props": { "name": "detailed description" } }`
            }],
            response_format: { type: 'json_object' }
        }, apiKey);
        const content = data.choices?.[0]?.message?.content || '';
        const match = content.match(/\{[\s\S]*\}/);
        if (match) {
            const parsed = JSON.parse(match[0]);
            for (const l of missingLocations) if (parsed.locations?.[l]) storyData.locations[l] = parsed.locations[l];
            for (const n of missingProps) if (parsed.props?.[n]) storyData.props[n] = parsed.props[n];
        }
        for (const l of missingLocations) {
            if (!storyData.locations[l]) storyData.locations[l] = `${l}: a distinctive place that looks exactly the same in every illustration - same colors, layout, furniture and key features every time it appears.`;
        }
        for (const n of missingProps) {
            if (!storyData.props[n]) storyData.props[n] = `${n}: a distinctive object that looks exactly the same in every illustration - same colors, shape, size and details every time it appears.`;
        }
    } catch (e) {
        logger.warn('STORY-GEN', 'Consistency repair failed (continuing)', { error: e.message });
    }
    return storyData;
}

/**
 * Generate story content (same prompt + output shape as the OpenRouter path)
 */
export async function generateStoryContent(childName, theme, pageCount, apiKey, childAge = '4-8') {
    logger.storyGenerationStart(childName, theme, pageCount);

    const prompt = `You are an award-winning children's book author creating a premium storybook for a child named ${childName} who is ${childAge} years old.

STORY DETAILS:
- Theme: ${theme}
- Pages: Exactly ${pageCount} pages
- Target age: ${childAge} years old

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
   - OUTFIT: ${childName} wears ONE specific outfit throughout. Define it clearly, with specific colors and details. Invent an outfit that fits this story's theme.
   - LOCATIONS: Each location has consistent colors, furniture, and style whenever it appears. EVERY place any page is set in MUST be defined in "locations" - including the main setting and interiors. A page may only use a location name that exists in "locations".
   - **CHARACTERS**: Define ALL characters (friends, animals, adults) with specific appearance details. They MUST look exactly the same on every page! Invent original characters for this story.
   - PROPS: Any object that appears on more than one page (something ${childName} carries or uses, a magical item, a favourite toy) MUST be defined once in "props" with specific colors, shape, size and details, and listed in that page's "propsPresent". It MUST look identical every time it appears.

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
    "props": {
        "propName1": "Detailed description of a recurring object: colors, shape, size, distinctive details",
        "propName2": "Detailed description of another recurring object (only include objects that appear on 2 or more pages)"
    },
    "pages": [
        {
            "pageNumber": 1,
            "text": "Engaging text (2-4 sentences max). Use vivid verbs. Include sensory details.",
            "location": "locationName1",
            "charactersPresent": ["${childName}", "characterName2"],
            "propsPresent": ["propName1"],
            "imagePrompt": "Detailed scene: ${childName} in [exact outfit], [other characters with exact appearance], at [location with specific details], doing [specific action with emotion]"
        }
        ... (${pageCount} pages)
    ]
}

IMPORTANT: If you introduce ANY character besides ${childName} (friends, animals, adults, magical creatures), you MUST define their appearance in the "characters" object with EXTREME detail so they look identical on every page!

QUALITY STANDARD: Write as if this will be professionally published. Every sentence should delight and engage. Make parents want to read this aloud, and make children ask for it again and again.`;

    const data = await callChat({
        model: TEXT_MODEL,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' }
    }, apiKey);

    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('NanoGPT returned no story content');
    const storyData = parseStoryJson(content);
    await repairStoryConsistency(storyData, apiKey);
    logger.info('STORY-GEN', 'NanoGPT story parsed', { title: storyData.title, pageCount: storyData.pages?.length });
    return storyData;
}

/**
 * Analyze child's photo into a character description (vision chat call).
 * Fallbacks use personName — the OpenRouter version's fallback referenced an
 * undefined variable; this one doesn't.
 */
export async function analyzePersonPhoto(photoBase64, personName, apiKey, childAge = null) {
    logger.info('CHARACTER', 'Analyzing person photo via NanoGPT', { childAge });

    const fallback = {
        characterDescription: `A child named ${personName}`,
        shortDescription: personName
    };

    const analysisPrompt = `Analyze this photo of a person named ${personName} ${childAge ? `(age: ${childAge})` : ''} and provide a VERY detailed character description that can be used consistently across multiple illustrations.

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

    try {
        const data = await callChat({
            model: TEXT_MODEL,
            messages: [
                {
                    role: 'user',
                    content: [
                        { type: 'image_url', image_url: { url: await downscaleDataUrl(photoBase64) } },
                        { type: 'text', text: analysisPrompt }
                    ]
                }
            ],
            response_format: { type: 'json_object' }
        }, apiKey);

        const content = data.choices?.[0]?.message?.content;
        if (!content) return fallback;
        try {
            return JSON.parse(content);
        } catch (e) {
            logger.warn('CHARACTER', 'Failed to parse NanoGPT character analysis', { error: e.message });
            return fallback;
        }
    } catch (error) {
        if (error.notConfigured) throw error; // let aiProvider fall back
        logger.error('CHARACTER', 'NanoGPT character analysis error', error);
        return fallback;
    }
}

/**
 * Generate one page image with Seedream, using the child's photo as the
 * reference image so the character carries across pages.
 */
export async function generatePageImage(imagePrompt, apiKey, pageNumber = 0, childPhoto = null, childName = '', characterDescription = null, storyContext = null, childAge = null, referenceImages = []) {
    logger.imageGenerationStart(pageNumber, imagePrompt);

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
- Age appearance: ${childAge ? `${childAge} years old` : (characterDescription.approximateAge || 'young child')}
${characterDescription.distinctiveFeatures && characterDescription.distinctiveFeatures !== 'none' ? `- Distinctive features: ${characterDescription.distinctiveFeatures}` : ''}

IMPORTANT: The hair MUST look exactly the same as in the reference photo and all other illustrations. Same color, same style, same length every single time!`;
    }

    let storyConsistency = '';

    let propsBlock = '';
    if (storyContext && storyContext.props) {
        const presentProps = (Array.isArray(storyContext.propsPresent) && storyContext.propsPresent.length
            ? storyContext.propsPresent
            : Object.keys(storyContext.props)).filter(n => storyContext.props[n]);
        if (presentProps.length) {
            propsBlock = `
KEY OBJECTS IN THIS SCENE (MUST LOOK IDENTICAL EVERY TIME THEY APPEAR):
${presentProps.map(n => `- ${n}: ${storyContext.props[n]}`).join('\n')}
`;
        }
    }
    if (storyContext) {
        storyConsistency = `
OUTFIT (MUST BE EXACTLY THE SAME IN ALL ILLUSTRATIONS):
${storyContext.characterOutfit || 'match the reference photo clothing'}
${propsBlock}

${storyContext.currentLocation && storyContext.locations && storyContext.locations[storyContext.currentLocation] ? `
CURRENT LOCATION - ${storyContext.currentLocation.toUpperCase()}:
${storyContext.locations[storyContext.currentLocation]}
If this location appeared before, it MUST look identical.
` : ''}

${storyContext.characters && Object.keys(storyContext.characters).length > 0 ? `
OTHER CHARACTERS IN THIS STORY (MUST LOOK IDENTICAL ON EVERY PAGE):
${Object.entries(storyContext.characters)
                    .filter(([name]) => name !== childName)
                    .map(([name, description]) => `- ${name}: ${description}`)
                    .join('\n')}

IMPORTANT: If any of these characters appear in this illustration, they MUST match these exact descriptions!
` : ''}`;
    }

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
Quality: High quality, detailed, professional.
No text, words, letters, or watermarks anywhere in the image.`;

    const body = {
        model: IMAGE_MODEL,
        prompt: enhancedPrompt,
        size: IMAGE_SIZE,
        n: 1
    };
    const refs = [];
    if (childPhoto) refs.push(await downscaleDataUrl(childPhoto));
    for (const ref of (referenceImages || []).slice(0, 3)) {
        if (ref) refs.push(await downscaleDataUrl(ref));
    }
    if (refs.length) body.imageDataUrls = refs;

    const dataUrl = await callImage(body);
    logger.imageGenerationSuccess(pageNumber, 0, true);
    return dataUrl;
}
