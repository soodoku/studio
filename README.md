
# AudioBook Buddy

This is a Next.js application built with Firebase Studio that allows users to upload PDF/ePUB files, convert them to audio using Text-to-Speech, take notes, and test their comprehension with AI-generated quizzes.

## Getting Started

1.  **Install Dependencies**:
    ```bash
    npm install
    ```

2.  **Configure Firebase**:
    *   Create a Firebase project at [https://console.firebase.google.com/](https://console.firebase.google.com/).
    *   Enable **Authentication** (Email/Password provider), **Firestore Database**, and **Storage** in your Firebase project.
    *   Go to Project settings > General > Your apps.
    *   Register a new Web app.
    *   Copy the Firebase configuration details.
    *   Rename the `.env.example` file (if present) or create a new file named `.env.local`.
    *   Paste your Firebase configuration into `.env.local`, replacing the placeholder values:

        ```dotenv
        # Firebase configuration - Replace placeholders with your actual Firebase project settings
        # IMPORTANT: Ensure these variables are prefixed with NEXT_PUBLIC_ to be exposed to the browser.
        NEXT_PUBLIC_FIREBASE_API_KEY="YOUR_API_KEY"
        NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN="YOUR_AUTH_DOMAIN"
        NEXT_PUBLIC_FIREBASE_PROJECT_ID="YOUR_PROJECT_ID"
        NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET="YOUR_STORAGE_BUCKET"
        NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID="YOUR_MESSAGING_SENDER_ID"
        NEXT_PUBLIC_FIREBASE_APP_ID="YOUR_APP_ID"
        NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID="YOUR_MEASUREMENT_ID" # Optional

        # Google Generative AI API Key (For Genkit) - Keep this secret, DO NOT prefix with NEXT_PUBLIC_
        # This key is used by the Genkit server process.
        GOOGLE_GENAI_API_KEY="YOUR_GOOGLE_GENAI_API_KEY"

        # Optional: Set to true to use Firebase Emulators during development
        # NEXT_PUBLIC_USE_FIREBASE_EMULATORS=false
        # NEXT_PUBLIC_AUTH_EMULATOR_HOST=localhost
        # NEXT_PUBLIC_AUTH_EMULATOR_PORT=9099
        # NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST=localhost
        # NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT=8080
        # NEXT_PUBLIC_STORAGE_EMULATOR_HOST=localhost # Added for Storage Emulator
        # NEXT_PUBLIC_STORAGE_EMULATOR_PORT=9199     # Added for Storage Emulator
        ```

    *   **Important**: Ensure you replace `"YOUR_..."` placeholders with your actual Firebase credentials. If you are using Firebase Studio, these variables might be injected automatically, but verify they are correct and not the placeholders. **Especially `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`, etc.**

3.  **Configure and DEPLOY Firebase Security Rules (CRITICAL!)**:
    *   **Firestore Rules:** Review and update `firestore.rules` to restrict document access to authenticated users based on their `userId`. Example rules are provided. **Ensure they match your data structure and access patterns.**
    *   **Storage Rules:** Review and update `storage.rules` to restrict file access in Firebase Storage to authenticated users based on their `userId` and the correct storage path (e.g., `audiobooks/{userId}/...`). Example rules are provided. **Ensure they match your file upload paths.**
    *   **Deployment:** You **MUST** deploy these rules to your Firebase project using the Firebase CLI for them to take effect, especially in your public/live environment. If you don't deploy, default (often insecure or overly restrictive) rules might apply.
        *   Install Firebase CLI: `npm install -g firebase-tools` (if not already installed).
        *   Login: `firebase login`
        *   **IMPORTANT:** Select the correct Firebase project: `firebase use YOUR_FIREBASE_PROJECT_ID` (Replace `YOUR_FIREBASE_PROJECT_ID` with the ID of your *live* project). Verify the selected project with `firebase projects:list`.
        *   Deploy rules:
            ```bash
            # Deploy Firestore rules AND Storage rules
            firebase deploy --only firestore:rules,storage:rules
            ```
        *   **Note:** If you don't have a `firebase.json` file, the CLI might prompt you to create one or specify the rule files directly. Ensure `firebase.json` correctly points to `firestore.rules` and `storage.rules` if you use it. You can create a basic one like this:
            ```json
            // firebase.json
            {
              "firestore": {
                "rules": "firestore.rules"
              },
              "storage": {
                "rules": "storage.rules"
              }
            }
            ```
        *   **Verification:** After deploying, go to the Firebase Console (Firestore > Rules and Storage > Rules tabs) to see the deployed rules. **Use the Rules Simulator** in the console to test specific read/write operations for different users and paths to confirm they work as expected. Test file uploads and data access in your deployed application to confirm the "permission denied" error is resolved.

4.  **Configure Google AI (Genkit)**:
    *   Obtain an API key for Google Generative AI (e.g., Gemini) from [Google AI Studio](https://aistudio.google.com/app/apikey).
    *   Add the API key to your `.env.local` file:
        ```dotenv
        GOOGLE_GENAI_API_KEY="YOUR_GOOGLE_GENAI_API_KEY"
        ```
    *   **Crucial**: Ensure this key is NOT the placeholder value.

5.  **Run Genkit Development Server**:
    *   This server handles the AI flow executions (summarization, quiz generation).
    *   **IMPORTANT**: This server process needs access to the `GOOGLE_GENAI_API_KEY` environment variable defined in your `.env.local` file. Ensure your terminal session or run configuration makes these variables available to the script. The `npm run genkit:dev` script should load `.env.local` automatically in most setups.
    *   Open a **separate terminal** and run:
        ```bash
        npm run genkit:dev
        ```
    *   Watch this terminal for logs, including messages about the Google GenAI API key status.
    *   Keep this terminal running while developing.

6.  **Run Next.js Development Server**:
    *   In your main terminal, run:
        ```bash
        npm run dev
        ```
    *   Open [http://localhost:9002](http://localhost:9002) (or the specified port) in your browser.

## Features

*   **Authentication**: User login and sign-up using Email/Password via Firebase Auth.
*   **File Upload**: Upload PDF and ePUB files to Firebase Storage. Uploads are stored securely under a user-specific path (`audiobooks/{userId}/...`).
*   **Text Extraction**: Extracts text content from uploaded PDF files using `pdfjs-dist`. (ePUB support requires additional libraries).
*   **Text-to-Speech (Browser)**: Converts the extracted text into audio using the browser's SpeechSynthesis API for immediate playback.
*   **Audio Playback (Browser TTS)**: Play, pause, resume, and stop controls for the browser-generated audio.
*   **Audio File Generation (Simulated)**: Placeholder for generating persistent audio files (e.g., MP3) and storing them in Firebase Storage under a user-specific path (`audiobooks_generated/{userId}/...`).
*   **Audio File Playback**: Playback controls for persisted audio files stored in Firebase Storage.
*   **Book Reading View**: Displays the extracted text content for reading.
*   **AI Summarization**: Generate concise summaries of the book content using Genkit and Google AI.
*   **AI Quiz Generation**: Create multiple-choice quizzes based on the book content using Genkit and Google AI. Quiz answers are evaluated and scored.
*   **Firestore Integration**: Stores user book metadata (name, storage URL, user ID) securely in Firestore, ensuring data privacy via security rules. Uploaded files are stored in Firebase Storage. **Data Persistence:** Uploaded files and their metadata persist across sessions.
*   **Real-time Updates**: Bookshelf updates in real-time using Firestore snapshots.
*   **Responsive Design**: Adapts layout for mobile and desktop views.
*   **Collapsible Sidebar**: Sidebar can be collapsed to icon view on desktop.
*   **PWA Support**: The application is configured as a Progressive Web App (PWA), allowing it to be installed on devices like Android.

## Testing on Android

You can test AudioBook Buddy on an Android device or emulator by leveraging its PWA capabilities:

1.  **Prepare PWA Assets**:
    *   Ensure you have `icon-192x192.png` and `icon-512x512.png` files in the `public/` directory. These are referenced in `public/manifest.json`. You may need to create or download suitable icons if they don't exist.
    *   Verify that `public/manifest.json` is configured correctly and linked in `src/app/layout.tsx`.
2.  **Serve the App**:
    *   For development testing: Run `npm run dev` (typically on `http://localhost:9002`).
    *   For production testing (recommended for more realistic PWA behavior):
        *   Run `npm run build`
        *   Run `npm start` (this might run on a different port like 3000 by default, check the output).
3.  **Find Your Computer's IP**:
    *   On your computer, find its local network IP address (e.g., `ipconfig` on Windows, `ifconfig` or `ip addr` on macOS/Linux). It usually looks like `192.168.x.x` or `10.0.x.x`.
4.  **Access from Android**:
    *   **Emulator**: Open the Chrome browser in the Android Emulator and navigate to `http://10.0.2.2:PORT` (replace `PORT` with the port your Next.js app is running on, e.g., 9002 or 3000). `10.0.2.2` is a special alias for your computer's localhost from the emulator.
    *   **Real Device**: Ensure your Android device and computer are on the **same Wi-Fi network**. Open Chrome on your Android device and navigate to `http://YOUR_COMPUTER_IP:PORT` (replace `YOUR_COMPUTER_IP` with the IP address from step 3 and `PORT` with the correct port).
5.  **Install PWA**:
    *   Once the app loads in Chrome on your Android device, you should see a prompt or find an option in the Chrome menu (three dots) like "Install app" or "Add to Home screen". Tap it to install the PWA.
    *   The PWA will appear as an icon on your home screen and launch in a standalone window without the browser address bar.

## Publishing to Google Play Store (via TWA)

To publish your PWA to the Google Play Store, you need to wrap it using a Trusted Web Activity (TWA). This requires some additional setup outside of the Next.js project itself.

1.  **Prerequisites**:
    *   **Install Node.js and npm**: Needed for the Bubblewrap CLI.
    *   **Install Java Development Kit (JDK)**: Version 8 or higher is typically required for Android development tools.
    *   **Install Android Studio**: Provides the Android SDK and build tools. ([https://developer.android.com/studio](https://developer.android.com/studio))
    *   **Deploy Your PWA**: Your Next.js app must be built (`npm run build`) and deployed to a publicly accessible HTTPS URL. TWA requires HTTPS.
    *   **Verify Domain Ownership**: You must verify ownership of the domain where your PWA is hosted in the Google Play Console. This involves configuring Digital Asset Links (`assetlinks.json`).

2.  **Install Bubblewrap CLI**:
    ```bash
    npm install -g @bubblewrap/cli
    ```

3.  **Initialize Bubblewrap Project**:
    *   Navigate to your Next.js project directory in your terminal.
    *   Run the init command:
        ```bash
        bubblewrap init --manifest https://YOUR_DEPLOYED_PWA_URL/manifest.json
        ```
        (Replace `https://YOUR_DEPLOYED_PWA_URL` with the actual URL where your PWA is hosted).
    *   Bubblewrap will guide you through configuration, asking for details like:
        *   **Application ID**: (e.g., `com.yourcompany.audiobookbuddy`)
        *   **App Name**: (e.g., `AudioBook Buddy`)
        *   **Launcher Icon Path**: Path to your app icon (e.g., `public/icon-512x512.png`).
        *   **Signing Key Information**: You'll need to create or provide details for a signing key to sign your Android app. Follow the prompts carefully and **securely back up your signing key and its password**. Losing it means you cannot update your app.

4.  **Build the Android Project**:
    ```bash
    bubblewrap build
    ```
    *   This command generates an Android project (usually in an `android/` subfolder) and builds a signed Android App Bundle (`app-release-bundle.aab`) and potentially an APK (`app-release-signed.apk`). The AAB is the recommended format for uploading to Google Play.

5.  **Upload to Google Play Console**:
    *   Go to the [Google Play Console](https://play.google.com/console/).
    *   Create a developer account (requires a one-time fee).
    *   Create a new app entry.
    *   Fill in all required store listing details (description, screenshots, privacy policy, content rating, etc.).
    *   Upload the generated `app-release-bundle.aab` file under the "Production" or a testing track (Internal, Closed, Open).
    *   Ensure you have correctly set up Digital Asset Links (`assetlinks.json`) on your web server at `https://YOUR_DOMAIN/.well-known/assetlinks.json` to verify the link between your website and your Android app. Bubblewrap can help generate this file (`assetlinks.json` will be created during the `build` step).
    *   Submit your app for review.

**Important Notes for TWA**:
*   **HTTPS is Mandatory**: Your PWA *must* be served over HTTPS.
*   **Digital Asset Links**: Correctly setting up `assetlinks.json` is crucial for the TWA to work without the browser address bar showing.
*   **Updates**: Updates to your web app (PWA) content are usually reflected automatically in the installed Android app after a short delay. You only need to rebuild and resubmit the TWA package via Bubblewrap and the Play Console if you change fundamental aspects like the manifest URL, app icon, signing key, or add native Android features.

## Project Structure

*   `src/app/`: Next.js App Router pages and layouts.
    *   `src/app/page.tsx`: Main application component handling library, reader, and AI features.
    *   `src/app/auth/page.tsx`: Authentication page.
    *   `src/app/layout.tsx`: Root application layout (includes PWA manifest link).
    *   `src/app/globals.css`: Global styles and Tailwind CSS/ShadCN theme variables.
*   `src/components/`: Reusable UI components.
    *   `src/components/feature/`: Feature-specific components (AuthForm, FileUpload).
    *   `src/components/ui/`: ShadCN UI components (Button, Card, Sidebar, etc.).
*   `src/contexts/`: React Context providers (e.g., AuthContext).
*   `src/hooks/`: Custom React hooks (e.g., useToast, useIsMobile).
*   `src/lib/`: Utility functions and libraries.
    *   `src/lib/firebase/clientApp.ts`: Firebase client initialization and configuration validation.
    *   `src/lib/utils.ts`: General utility functions (e.g., `cn` for class names).
*   `src/services/`: Service functions for external interactions.
    *   `src/services/file-conversion.ts`: Handles PDF text extraction using `pdfjs-dist`.
    *   `src/services/tts.ts`: Handles Text-to-Speech operations using browser API.
    *   `src/services/storage.ts`: Handles file uploads to Firebase Storage.
*   `src/ai/`: Genkit AI related files.
    *   `src/ai/ai-instance.ts`: Genkit initialization and Google AI plugin configuration.
    *   `src/ai/dev.ts`: Entry point for the Genkit development server.
    *   `src/ai/flows/`: Genkit flow definitions (summarization, quiz generation).
*   `public/`: Static assets.
    *   `public/manifest.json`: PWA manifest file.
    *   `public/icon-*.png`: Application icons for PWA (ensure these exist).
*   `firestore.rules`: Firebase Firestore security rules.
*   `storage.rules`: Firebase Storage security rules.
*   `firebase.json`: Firebase CLI configuration (for deploying rules).
*   `.env.local`: Environment variables (Firebase keys, AI keys). **DO NOT COMMIT THIS FILE**.
*   `next.config.ts`: Next.js configuration (includes webpack config for pdf.js worker).
*   `tailwind.config.ts`: Tailwind CSS configuration.
*   `tsconfig.json`: TypeScript configuration.
*   `package.json`: Project dependencies and scripts.
*   `components.json`: ShadCN UI configuration.

## Troubleshooting

*   **Firebase Errors (Auth/Firestore/Storage)**:
    *   **Verify `.env.local`:** Ensure all `NEXT_PUBLIC_FIREBASE_...` variables are correct and **not** placeholder values (like `YOUR_API_KEY`). If using Firebase Studio, double-check the injected environment variables in the deployed environment. **This is the most common cause of "invalid key" errors.**
    *   **Enable Services:** Verify Email/Password authentication, Firestore, and Storage are enabled in your Firebase project console.
    *   **Check Deployed Firestore and Storage Rules:** Ensure `firestore.rules` and `storage.rules` have been **deployed** using the Firebase CLI (`firebase deploy --only firestore:rules,storage:rules`). Check the Rules tab in the Firebase console and use the **Rules Simulator** to test access. **Deployed rules must allow the necessary read/write access for authenticated users based on their `request.auth.uid` and the correct paths (e.g., `audiobooks/{userId}/...`).**
    *   **Check Browser Console & `clientApp.ts`:** Look for specific initialization error messages in the browser console and review logs from `src/lib/firebase/clientApp.ts`.
    *   **"Permission Denied" errors (Storage/Firestore):** This *usually* means the security rules are incorrect or haven't been deployed correctly. Verify the `match` paths in your rules files align with the paths used in your code (`src/services/storage.ts` and `src/app/page.tsx`) and that the `request.auth.uid == userId` (or similar) condition is met. Use the Rules Simulator!
*   **Genkit Errors (Summarize/Quiz)**:
    *   **Verify `GOOGLE_GENAI_API_KEY`:** Ensure the `GOOGLE_GENAI_API_KEY` in `.env.local` is correct and **not** the placeholder value.
    *   **Check Genkit Server:** Confirm the `npm run genkit:dev` process is running in a separate terminal.
    *   **Check Genkit Terminal Logs:** Look for errors related to API key validation or model access in the **Genkit terminal**.
    *   **Enable Google AI API:** Make sure the Google AI (Generative Language API) is enabled in your Google Cloud project associated with the API key.
*   **PDF Text Extraction Errors (`pdf.worker.min.mjs` Not Found / Worker Errors)**:
    *   **Ensure Worker Copy:** Confirm `pdfjs-dist` worker file (`pdf.worker.min.mjs`) is copied by Webpack (check `next.config.ts`).
    *   **Verify Worker Path:** In your browser's DevTools (Network tab), check if the request for `/_next/static/chunks/pdf.worker.min.mjs` returns a 200 status code. If it's a 404, the path is wrong or the file wasn't copied correctly. The path in `src/services/file-conversion.ts` must exactly match where Webpack places the file.
    *   **Check Browser Console:** Look for errors related to PDF parsing or worker loading (`Failed to fetch dynamically imported module`, `Setting up fake worker failed`, etc.). Password-protected or corrupted PDFs will cause errors.
*   **Text-to-Speech Issues**:
    *   TTS relies on the browser's built-in capabilities (SpeechSynthesis API). Ensure your browser supports it. Some browsers/OS might have limited voice options or require specific settings.
*   **PWA/Android Testing Issues**:
    *   Ensure your computer and Android device/emulator are on the same network.
    *   Check firewall settings if you cannot connect from Android to your computer's IP.
    *   Verify the port number used in the URL (`9002` for dev, maybe `3000` for prod).
    *   Ensure the PWA icons (`icon-192x192.png`, `icon-512x512.png`) exist in the `public` folder and are correctly referenced in `manifest.json`.
    *   Check Chrome DevTools (Remote Devices) for console errors on the Android device.
*   **Hydration Errors**:
    *   These often occur when server-rendered HTML differs from the initial client render. Check for browser extensions interfering, use of `window` or `Date.now()` outside `useEffect`, or conditional rendering mismatches. Adding `suppressHydrationWarning` to `<html>` in `layout.tsx` can help ignore minor issues often caused by extensions.
*   **TWA Issues**:
    *   **Address Bar Showing**: Usually means `assetlinks.json` is missing, incorrect, or not accessible on your server at the correct path (`/.well-known/assetlinks.json`). Use Google's [Asset Link Testing Tool](https://developers.google.com/digital-asset-links/tools/generator).
    *   **Build Errors**: Check JDK/Android Studio setup and Bubblewrap output for specific error messages.
    *   **Play Store Rejection**: Review Google Play policies carefully. Common issues involve metadata, permissions, or content.
