# 🎯 Quick Reference: Provider Switching

## Current Status
- ✅ **Multi-provider support enabled**
- ✅ **Default**: OpenRouter (longer timeouts, more reliable)
- ✅ **Alternative**: Google AI Studio (direct access)

---

## Switch Providers (3 Ways)

### 1. Environment Variable (Permanent)
```bash
# Edit .env file:
VITE_AI_PROVIDER=openrouter  # or 'google'
```
Then restart dev server.

### 2. localStorage (Runtime)
```javascript
// In browser console:
localStorage.setItem('ai_provider', 'openrouter');  // or 'google'
location.reload();
```

### 3. Code (Programmatic)
```javascript
import { switchProvider, AI_PROVIDERS } from './services/aiProvider';

switchProvider(AI_PROVIDERS.OPENROUTER);  // Switch to OpenRouter  
switchProvider(AI_PROVIDERS.GOOGLE);      // Switch to Google
```

---

## Check Current Provider

### Browser Console:
```javascript
localStorage.getItem('ai_provider')
// Returns: "openrouter" or "google"
```

### Code:
```javascript
import { getCurrentProvider, getProviderInfo } from './services/aiProvider';

console.log(getCurrentProvider());  // "openrouter" or "google"
console.log(getProviderInfo());     // Full provider details
```

---

## API Keys Required

### OpenRouter Setup:
1. Get key: https://openrouter.ai/keys
2. Add to `.env`:
   ```bash
   VITE_OPENROUTER_API_KEY=sk-or-v1-YOUR-KEY
   OPENROUTER_API_KEY=sk-or-v1-YOUR-KEY
   ```

### Google AI Setup:
1. Get key: https://aistudio.google.com/apikey
2. Add to `.env`:
   ```bash
   VITE_GOOGLE_API_KEY=YOUR-GOOGLE-KEY
   GOOGLE_API_KEY=YOUR-GOOGLE-KEY
   ```

---

## Which Provider to Use?

### Use OpenRouter if:
- ✅ Generating 10+ page stories
- ✅ Need reliability (auto-retry, fallback)
- ✅ Want to avoid timeout errors
- ✅ Prefer longer request limits

### Use Google AI if:
- ✅ Testing new features quickly
- ✅ Want latest Gemini updates first
- ✅ Generating short (5-page) stories
- ✅ Have fast direct connection

---

## Files That Use the Provider

All these now automatically use the active provider:
- ✅ `StoryCreator.jsx` - Story generation
- ✅ `generateStoryContent()` - Text generation
- ✅ `generatePageImage()` - Image generation  
- ✅ `analyzePersonPhoto()` - Photo analysis

**No code changes needed!** Just switch provider and it routes automatically.

---

## Testing Provider Switch

```bash
# 1. Set to OpenRouter
echo 'VITE_AI_PROVIDER=openrouter' >> .env

# 2. Start secure dev
npm run dev:secure

# 3. Generate a story - should use OpenRouter

# 4. Switch to Google
# Edit .env: VITE_AI_PROVIDER=google
# Restart dev server

# 5. Generate again - now uses Google AI
```

---

## Deployment (Netlify)

### OpenRouter (Recommended):
```bash
# Netlify Dashboard → Environment Variables:
OPENROUTER_API_KEY=sk-or-v1-YOUR-KEY
AI_PROVIDER=openrouter
```

### Google AI:
```bash
# Netlify Dashboard → Environment Variables:
GOOGLE_API_KEY=YOUR-GOOGLE-KEY
AI_PROVIDER=google
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "API key not configured" | Add key to `.env` for active provider |
| Provider not switching | Clear localStorage + refresh |
| Timeout errors | Switch to OpenRouter |
| Images failing | Check API key for image model |

---

## Pro Tip 💡

Keep BOTH keys configured in `.env`:
```bash
VITE_OPENROUTER_API_KEY=sk-or-v1-...
VITE_GOOGLE_API_KEY=AIza...
VITE_AI_PROVIDER=openrouter  # Active provider
```

Then switching is instant - just change last line!
