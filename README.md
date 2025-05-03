
# AudioBook Buddy

This is a Next.js application built with Firebase Studio that allows users to upload PDF/ePUB files, convert them to audio using Text-to-Speech, take notes, and test their comprehension with AI-generated quizzes.

## Getting Started

1.  **Install Dependencies**:
    ```bash
    npm install
    ```

2.  **Configure Firebase**:
    *   Create a Firebase project at [https://console.firebase.google.com/](https://console.firebase.google.com/).
    *   Enable **Authentication** (Email/Password provider) and **Firestore Database** in your Firebase project.
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
        ```

    *   **Important**: Ensure you replace `"YOUR_..."` placeholders with your actual Firebase credentials.

3.  **Configure Google AI (Genkit)**:
    *   Obtain an API key for Google Generative AI (e.g., Gemini) from [Google AI Studio](https://aistudio.google.com/app/apikey).
    *   Add the API key to your `.env.local` file:
        ```dotenv
        GOOGLE_GENAI_API_KEY="YOUR_GOOGLE_GENAI_API_KEY"
        ```
    *   **Crucial**: Ensure this key is NOT the placeholder value.

4.  **Run Genkit Development Server**:
    *   This server handles the AI flow executions (summarization, quiz generation).
    *   **IMPORTANT**: This server process needs access to the `GOOGLE_GENAI_API_KEY` environment variable defined in your `.env.local` file. Ensure your terminal session or run configuration makes these variables available to the script. The `npm run genkit:dev` script should load `.env.local` automatically in most setups.
    *   Open a **separate terminal** and run:
        ```bash
        npm run genkit:dev
        ```
    *   Watch this terminal for logs, including messages about the Google GenAI API key status.
    *   Keep this terminal running while developing.

5.  **Run Next.js Development Server**:
    *   In your main terminal, run:
        ```bash
        npm run dev
        ```
    *   Open [http://localhost:9002](http://localhost:9002) (or the specified port) in your browser.

## Features

*   **Authentication**: User login and sign-up using Email/Password via Firebase Auth.
*   **File Upload**: Upload PDF and ePUB files.
*   **Text Extraction**: Extracts text content from uploaded PDF files using `pdfjs-dist`. (ePUB support requires additional libraries).
*   **Text-to-Speech**: Converts the extracted text into audio using the browser's SpeechSynthesis API.
*   **Audio Playback**: Play, pause, resume, and stop controls for the generated audio.
*   **Book Reading View**: Displays the extracted text content for reading.
*   **AI Summarization**: Generate concise summaries of the book content using Genkit and Google AI.
*   **AI Quiz Generation**: Create multiple-choice quizzes based on the book content using Genkit and Google AI. Quiz answers are evaluated and scored.
*   **Firestore Integration**: Stores user book data (name, content, user ID) securely in Firestore, ensuring data privacy via security rules (must be configured).
*   **Real-time Updates**: Bookshelf updates in real-time using Firestore snapshots.
*   **Responsive Design**: Adapts layout for mobile and desktop views.
*   **Collapsible Sidebar**: Sidebar can be collapsed to icon view on desktop.

## Project Structure

*   `src/app/`: Next.js App Router pages and layouts.
    *   `src/app/page.tsx`: Main application component handling library, reader, and AI features.
    *   `src/app/auth/page.tsx`: Authentication page.
    *   `src/app/layout.tsx`: Root application layout.
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
*   `src/ai/`: Genkit AI related files.
    *   `src/ai/ai-instance.ts`: Genkit initialization and Google AI plugin configuration.
    *   `src/ai/dev.ts`: Entry point for the Genkit development server.
    *   `src/ai/flows/`: Genkit flow definitions (summarization, quiz generation).
*   `public/`: Static assets.
*   `.env.local`: Environment variables (Firebase keys, AI keys). **DO NOT COMMIT THIS FILE**.
*   `next.config.ts`: Next.js configuration (includes webpack config for pdf.js worker).
*   `tailwind.config.ts`: Tailwind CSS configuration.
*   `tsconfig.json`: TypeScript configuration.
*   `package.json`: Project dependencies and scripts.
*   `components.json`: ShadCN UI configuration.

## Troubleshooting

*   **Firebase Errors (Auth/Firestore)**:
    *   Ensure all `NEXT_PUBLIC_FIREBASE_...` variables in `.env.local` are correct and **not** placeholder values.
    *   Verify Email/Password authentication and Firestore are enabled in your Firebase project console.
    *   Check the browser console and `src/lib/firebase/clientApp.ts` for specific initialization error messages.
*   **Genkit Errors (Summarize/Quiz)**:
    *   Ensure the `GOOGLE_GENAI_API_KEY` in `.env.local` is correct and **not** the placeholder value.
    *   Confirm the `npm run genkit:dev` process is running in a separate terminal.
    *   Check the **Genkit terminal** for errors related to API key validation or model access.
    *   Make sure the Google AI (Generative Language API) is enabled in your Google Cloud project associated with the API key.
*   **PDF Text Extraction Errors**:
    *   Ensure the `pdfjs-dist` worker file (`pdf.worker.min.mjs`) is correctly copied by Webpack (check `next.config.ts`). The path `/_next/static/chunks/pdf.worker.min.mjs` should be accessible.
    *   Check browser console for errors related to PDF parsing or worker loading. Password-protected or corrupted PDFs will cause errors.
*   **Text-to-Speech Issues**:
    *   TTS relies on the browser's built-in capabilities (SpeechSynthesis API). Ensure your browser supports it. Some browsers/OS might have limited voice options or require specific settings.
