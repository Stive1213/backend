# API Key Security Guide

## Gemini API Key Configuration

The Gemini API key is **NEVER** exposed to the frontend. It is only used in the backend and should be stored securely in environment variables.

### Setup Instructions

1. **Create a `.env` file** in the `backend` directory (if it doesn't exist)

2. **Add your Gemini API key** to the `.env` file:
   ```env
   GEMINI_API_KEY=your-actual-api-key-here
   ```

3. **Never commit the `.env` file** to version control (it's already in `.gitignore`)

### Security Best Practices

✅ **DO:**
- Store the API key in environment variables only
- Keep the `.env` file in `.gitignore`
- Use the key only in backend code
- Keep the key secret and never share it

❌ **DON'T:**
- Hardcode the API key in source code
- Expose the API key to frontend/client-side code
- Commit the `.env` file to git
- Share the API key publicly

### Where the API Key is Used

- **Backend only:** `backend/src/controllers/assistantController.js`
- **Configuration:** `backend/src/config/config.js`
- **Never in frontend code** - all API calls go through the backend

### Environment Variables

The API key should be set as an environment variable:
- **Local development:** Set in `backend/.env` file
- **Production:** Set in your hosting platform's environment variables (e.g., Render, Heroku, etc.)

### Getting Your API Key

If you need a new API key:
1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Create a new API key
3. Copy it to your `.env` file
4. Restart your backend server

