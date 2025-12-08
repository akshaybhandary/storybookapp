# 🔒 Security Guide: Protecting Your API Keys

## ⚠️ The Problem

When running `npm run dev`, your Google API key is exposed in browser network requests:
```
https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=YOUR_API_KEY
```

**This is a security risk because:**
- Anyone can open DevTools and steal your API key from the Network tab
- The key can be extracted from the bundled JavaScript
- Stolen keys can rack up costs on your Google AI Studio account

---

## ✅ Solutions

### **Solution 1: Netlify Dev (Recommended for Local Development)**

This uses your existing Netlify function (`/netlify/functions/google.js`) to proxy API requests locally.

#### Steps:

1. **Stop your current dev server** (the one running `npm run dev`)

2. **Run the secure dev server:**
   ```bash
   npm run dev:secure
   ```

3. **Access your app at:** `http://localhost:8888` (Netlify Dev's default port)

**How it works:**
- ✅ API key stays in `.env` file (never sent to browser)
- ✅ Frontend calls `/.netlify/functions/google` 
- ✅ Netlify function adds API key server-side
- ✅ Same behavior as production deployment

**Environment variables needed:**
- Create/update `.env` with:
  ```
  GOOGLE_API_KEY=your_actual_google_api_key
  ```

---

### **Solution 2: Deploy to Netlify (Production Environment)**

For production use, deploy to Netlify where the function runs server-side automatically.

#### Steps:

1. **Build your app:**
   ```bash
   npm run build
   ```

2. **Deploy to Netlify:**
   - Push to GitHub
   - Connect repository on [netlify.com](https://netlify.com)
   - Add environment variable in Netlify dashboard:
     - Key: `GOOGLE_API_KEY`
     - Value: `your_actual_google_api_key`

3. **Deploy** and your API key will be secure!

**How it works:**
- ✅ `import.meta.env.PROD` is `true` in production
- ✅ Code automatically uses `/.netlify/functions/google`
- ✅ API key stored in Netlify's secure environment variables
- ✅ Never exposed to browser

---

### **Solution 3: Create a Custom Backend Server (Advanced)**

If you want to run your own backend instead of Netlify functions:

1. **Create an Express server** (example in `server/` directory)
2. **Add proxy endpoint** that handles Google API calls
3. **Update `googleAPI.js`** to point to your backend
4. **Deploy backend separately** (Heroku, Railway, etc.)

---

## 🧪 How to Verify Your API Key is Secure

1. Run your app using one of the secure methods above
2. Open DevTools → Network tab
3. Generate a story
4. Check network requests:
   - ✅ **SECURE**: Request goes to `/.netlify/functions/google` with NO key in URL
   - ❌ **INSECURE**: Request goes to `generativelanguage.googleapis.com` with `?key=...`

---

## 📋 Current Setup

Your app already has:
- ✅ Netlify function at `/netlify/functions/google.js`
- ✅ Production/development detection in `googleAPI.js`
- ✅ Secure routing configured in `netlify.toml`

**All you need to do is use the secure dev server!**

---

## 🚀 Quick Start (Recommended Path)

```bash
# 1. Stop current dev server (Ctrl+C in terminal)

# 2. Make sure .env has your API key
echo "GOOGLE_API_KEY=your_actual_key_here" >> .env

# 3. Run secure dev server
npm run dev:secure

# 4. Open http://localhost:8888
```

---

## 🔍 Understanding the Code

### Frontend (`src/services/googleAPI.js`)
```javascript
// Line 5-6: Detects environment
const isProduction = import.meta.env.PROD;
const FUNCTION_URL = isProduction ? '/.netlify/functions/google' : null;

// Line 59-93: Routes based on environment
if (isProduction) {
    // Uses Netlify function (SECURE)
} else {
    // Direct API call (INSECURE - for quick local testing only)
}
```

### Backend (`netlify/functions/google.js`)
```javascript
// Line 17: Gets API key from environment variable
const apiKey = process.env.GOOGLE_API_KEY;

// Line 28: Adds key server-side (never exposed to browser)
const url = `${API_BASE_URL}/${endpoint}?key=${apiKey}`;
```

---

## ❓ FAQ

**Q: Why does regular `npm run dev` expose the key?**  
A: It runs pure Vite without Netlify functions, so the code uses the fallback direct API call.

**Q: Will `dev:secure` work exactly like production?**  
A: Yes! Netlify Dev simulates the production environment locally.

**Q: What port does `dev:secure` use?**  
A: Port 8888 by default (configurable in `netlify.toml`).

**Q: Do I need to change any code?**  
A: No! Your code is already configured. Just run `npm run dev:secure` instead of `npm run dev`.

---

## 📝 Summary

| Method | Security | Ease | Use Case |
|--------|----------|------|----------|
| `npm run dev` | ❌ Insecure | Easy | Quick testing (temporary) |
| `npm run dev:secure` | ✅ Secure | Easy | Local development |
| Netlify Deploy | ✅ Secure | Medium | Production |

**Recommendation:** Always use `npm run dev:secure` for development work!
