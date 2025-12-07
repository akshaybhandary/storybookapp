# Debugging StoryBook Magic - Error Tracking Guide

## 📊 **How to View Netlify Logs**

### **Method 1: Netlify Dashboard (Web UI)**

1. Go to: https://app.netlify.com
2. Select your **StoryBook Magic** site
3. Click **"Functions"** in the left sidebar
4. Click on the **"openrouter"** function
5. Click **"Function log"** tab
6. You'll see all logs with our enhanced `[requestId]` format

### **Method 2: Netlify CLI (Terminal)**

```bash
# Install Netlify CLI (if not already installed)
npm install -g netlify-cli

# Login
netlify login

# View live logs
netlify functions:log openrouter --live

# Or view recent logs
netlify functions:log openrouter
```

---

## 🔍 **Understanding the Enhanced Logs**

Each request now has a **unique Request ID** and comprehensive logging:

### **Successful Request Example:**
```;
[lx82kp3] === NEW REQUEST ===
[lx82kp3] Method: POST
[lx82kp3] Origin: https://storybookmagic.netlify.app
[lx82kp3] API Key Check:
[lx82kp3]   - Exists: true
[lx82kp3]   - Length: 64
[lx82kp3]   - Starts with: sk-or-v1-...
[lx82kp3] Request body parsed successfully
[lx82kp3] Model: google/gemini-2.0-flash-exp:free
[lx82kp3] Messages count: 1
[lx82kp3] Calling OpenRouter API...
[lx82kp3] OpenRouter responded in 3245ms
[lx82kp3] Response status: 200
[lx82kp3] Success! Tokens used: 2843
```

### **Failed Request Example (API Key Missing):**
```
[lx82kp4] === NEW REQUEST ===
[lx82kp4] Method: POST
[lx82kp4] API Key Check:
[lx82kp4]   - Exists: false
[lx82kp4]   - Length: 0
[lx82kp4]   - All env vars: PATH, HOME, NODE_VERSION...
[lx82kp4] CRITICAL: API key not configured
```

### **Failed Request Example (OpenRouter Error):**
```
[lx82kp5] === NEW REQUEST ===
[lx82kp5] OpenRouter responded in 1234ms
[lx82kp5] Response status: 429
[lx82kp5] OpenRouter API Error:
[lx82kp5]   Status: 429
[lx82kp5]   Error data: { "error": { "code": 429, "message": "Rate limit exceeded" }}
```

---

## 🐛 **Common Error Scenarios**

### **1. "API key not configured"**

**Cause:** `OPENROUTER_API_KEY` environment variable not set in Netlify

**Fix:**
1. Go to Netlify Dashboard → Site Settings → Environment Variables
2. Check if `OPENROUTER_API_KEY` exists
3. Verify the value is correct (starts with `sk-or-v1-`)
4. Redeploy the site after adding/updating the key

---

### **2. "Rate limit exceeded" (429)**

**Cause:** Too many requests to OpenRouter API

**Fix:**
- Check your OpenRouter dashboard for rate limits
- Upgrade your OpenRouter plan if needed
- Add rate limiting on the frontend

---

### **3. "Insufficient credits" (402)**

**Cause:** OpenRouter account out of credits

**Fix:**
- Add credits to your OpenRouter account
- Check balance at: https://openrouter.ai/credits

---

### **4. Network/Timeout Errors**

**Cause:** Slow API response or network issues

**What logs will show:**
```
[requestId] Calling OpenRouter API...
[requestId] EXCEPTION: FetchError: network timeout
```

**Fix:**
- Check OpenRouter status page
- Increase Netlify function timeout (if needed)

---

## 📈 **Monitoring Best Practices**

### **Set up Alerts**
1. Go to Netlify Dashboard → Site Settings → Notifications
2. Add email alerts for:
   - Function errors
   - Deploy failures

### **Check Logs Regularly**
- Monitor for patterns in errors
- Track response times (should be < 10 seconds)
- Watch for API key issues

### **Client-Side Error Display**
Users now see better error messages with request IDs. If a user reports an error:
1. Ask them for the **Request ID** (shown in error message)
2. Search Netlify logs for that Request ID
3. See exact error that occurred

---

## 🔧 **Quick Troubleshooting Checklist**

- [ ] Verify `OPENROUTER_API_KEY` is set in Netlify
- [ ] Check OpenRouter account has sufficient credits
- [ ] Verify API key is valid (test at openrouter.ai)
- [ ] Check Netlify function logs for specific errors
- [ ] Verify latest code is deployed (check deploy logs)
- [ ] Test in incognito/private browsing mode
- [ ] Clear browser cache and try again

---

## 📞 **Getting Help**

If you're still stuck:

1. **Check Netlify logs** with the Request ID
2. **Share the log snippet** (redact API keys!)
3. **Note the error message** shown to the user
4. **Check OpenRouter status:** https://status.openrouter.ai/

---

## 🎯 **What Changed**

### Enhanced Logging Includes:
- ✅ Unique Request ID for each request
- ✅ Full API key diagnostics (existence, length, prefix)
- ✅ Request body details (model, message count)
- âœ… Response timing (how long API took)
- ✅ Detailed error messages with stack traces
- ✅ All environment variables listed (for debugging)

### Users Now See:
- Better error messages
- Request IDs for support
- Specific guidance on what went wrong
- Debug info for developers

---

**Updated:** {{ date }}
**Function:** `netlify/functions/openrouter.js`
