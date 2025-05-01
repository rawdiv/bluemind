# Deploying to Render

This guide will walk you through deploying the Brahma AI Chatbot to Render.

## Option 1: Deploy with render.yaml (Recommended)

1. **Fork or clone this repository** to your GitHub account.

2. **Log in to your Render account** and go to the Dashboard.

3. **Click "New" and select "Blueprint"**.

4. **Connect your GitHub account** if you haven't already.

5. **Select your fork of this repository**.

6. **Review the configuration** shown from the render.yaml file and click "Apply".

7. **Enter your GEMINI_API_KEY** when prompted.

8. **Wait for deployment** to complete (this may take a few minutes).

9. **Visit your chatbot** at the URL provided by Render.

## Option 2: Manual Setup

1. **Log in to your Render account** and go to the Dashboard.

2. **Click "New" and select "Web Service"**.

3. **Connect your GitHub repository**.

4. **Configure the following settings**:
   - **Name**: Choose a name for your service (e.g., brahma-ai-chatbot)
   - **Environment**: Node
   - **Region**: Choose the region closest to your users
   - **Branch**: main (or your preferred branch)
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`

5. **Add environment variables**:
   - `GEMINI_API_KEY`: Your Google Gemini API key
   - `NODE_ENV`: production

6. **Click "Create Web Service"** and wait for deployment to complete.

## Troubleshooting

If your deployment encounters issues, try the following:

1. **Check the logs** in the Render dashboard for error messages.

2. **Visit the `/debug` endpoint** of your deployed app (e.g., https://your-app-name.onrender.com/debug) to see if your environment is configured correctly.

3. **Common issues**:
   - Missing API key: Ensure GEMINI_API_KEY is set correctly in environment variables
   - CORS errors: Check network tab in browser console
   - Module not found: Verify all dependencies are in package.json

4. **If you change environment variables**, you may need to manual redeploy from the Render dashboard.

5. **If your app still doesn't work**, try deploying from a fresh fork of the repository.

## Pricing Considerations

Render's free tier will put your service to sleep after 15 minutes of inactivity. The first request after inactivity may take up to 30 seconds to respond as the service wakes up.

For production use, consider upgrading to a paid plan to avoid this limitation. 