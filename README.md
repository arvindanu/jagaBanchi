# JAGA — Next.js chatbot

A mobile-first, black-and-white Swiss-minimalist chat interface powered by your Google Gemini API.

## Requirements
- Node.js 20.9+
- A Google Gemini API key and a model ID supported by your API account

## Setup

1. Extract this project.
2. Open the project folder in your terminal.
3. Install dependencies:

   ```bash
   npm install
   ```

4. Create `.env.local` in the project root:

   ```env
   GEMINI_API_KEY=your_actual_api_key
   GEMINI_MODEL=your_actual_model_id
   ```

   If you already have an `.env.local`, keep your existing values and make sure the variable names match. Do not add `NEXT_PUBLIC_` to either variable.

5. Start the development server:

   ```bash
   npm run dev
   ```

6. Open http://localhost:3000

## Privacy and storage
- No login, database, analytics, or server-side chat history is implemented.
- The browser saves chat history in `localStorage` on this device/browser.
- The current conversation is sent to your Next.js API route and then to Google Gemini to generate replies. Review Google's Gemini API data-use terms for your account before using it with sensitive information.
- If a browser storage write fails specifically because the local storage quota is full, the app removes the oldest messages until it can save. It does not routinely delete history.
- Clearing browser site data will also clear JAGA's saved history.
- Local storage is not encrypted and should not be treated as a secure vault.

## API setup
The Gemini key is read only by `src/app/api/chat/route.ts` on the server. It is never sent to the browser. The model name is read from `GEMINI_MODEL`.

## Notes
- The chat sends the current conversation context with each message (up to 40 messages) so Gemini can follow the thread. This is temporary request context, not a database or long-term memory.
- The personality prompt defaults to playful banter, with a clear instruction to become supportive when the user is genuinely serious.
- This project does not include push notifications or scheduled proactive check-ins yet.

## Install JAGA as a PWA

- Deploy the app to an HTTPS host (Vercel is a straightforward choice for this Next.js project).
- Open the deployed URL in Chrome on Android and choose **Install app** / **Add to Home screen**.
- On iPhone, open the site in Safari, tap **Share**, then **Add to Home Screen**.
- The service worker checks for a new deployment about once a minute while the app is open (and when it becomes visible). When a new version is detected, it activates and refreshes the open app. No reinstall is required.
- The service worker caches the app shell and fingerprinted static assets. Gemini API requests are never cached; chat still requires an internet connection.
- The top and bottom layout respect `safe-area-inset-top` and `safe-area-inset-bottom`, keeping the header border below the phone status bar and controls above the home indicator.

## GitHub deployment workflow

GitHub stores your source code; it does not host this Next.js API app as a normal GitHub Pages site. Connect the GitHub repository to Vercel (or another Node.js-capable Next.js host). Each push to the connected production branch triggers a deployment. Keep `GEMINI_API_KEY` and `GEMINI_MODEL` in the host's environment-variable settings, not in GitHub source files. Once deployment is complete, installed JAGA clients discover the new service worker and update automatically.
