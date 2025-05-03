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
        GOOGLE_GENAI_API_KEY="YOUR_GOOGLE_GENAI_API_KEY"
        ```

    *   **Important**: Ensure you replace `"YOUR_..."` placeholders with your actual Firebase credentials.

3.  **Configure Google AI (Genkit)**:
    *   Obtain an API key for Google Generative AI (e.g., Gemini) from [Google AI Studio](https://aistudio.google.com/app/apikey).
    *   Add the API key to your `.env.local` file:
        ```dotenv
        GOOGLE_GENAI_API_KEY="YOUR_GOOGLE_GENAI_API_KEY"
        ```

4.  **Run Genkit Development Server**:
    *   This server handles the AI flow executions (summarization, quiz generation).
    *   Open a **separate terminal** and run:
        ```bash
        npm run genkit:dev
        ```
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
*   **Text Extraction**: Extracts text content from uploaded PDF files. (ePUB support might require additional libraries).
*   **Text-to-Speech**: Converts the extracted text into audio using the browser's SpeechSynthesis API.
*   **Audio Playback**: Play, pause, and stop controls for the generated audio.
*   **AI Summarization**: Generate concise summaries of the book content using Genkit and Google AI.
*   **AI Quiz Generation**: Create multiple-choice quizzes based on the book content using Genkit and Google AI.
*   **Firestore Integration**: Stores user book data (name, content, user ID) securely in Firestore, ensuring data privacy.
*   **Real-time Updates**: Bookshelf updates in real-time using Firestore snapshots.

## Project Structure

*   `src/app/`: Next.js App Router pages and layouts.
    *   `src/app/page.tsx`: Main application component handling library, reader, and AI features.
    *   `src/app/auth/page.tsx`: Authentication page.
    *   `src/app/layout.tsx`: Root application layout.
    *   `src/app/globals.css`: Global styles and Tailwind CSS/ShadCN theme variables.
*   `src/components/`: Reusable UI components.
    *   `src/components/feature/`: Feature-specific components (AuthForm, FileUpload).
    *   `src/components/ui/`: ShadCN UI components.
*   `src/contexts/`: React Context providers (e.g., AuthContext).
*   `src/hooks/`: Custom React hooks (e.g., useToast, useIsMobile).
*   `src/lib/`: Utility functions and libraries.
    *   `src/lib/firebase/clientApp.ts`: Firebase client initialization.
    *   `src/lib/utils.ts`: General utility functions (e.g., `cn` for class names).
*   `src/services/`: Service functions for external interactions.
    *   `src/services/file-conversion.ts`: Handles PDF text extraction.
    *   `src/services/tts.ts`: Handles Text-to-Speech operations.
*   `src/ai/`: Genkit AI related files.
    *   `src/ai/ai-instance.ts`: Genkit initialization.
    *   `src/ai/dev.ts`: Entry point for the Genkit development server.
    *   `src/ai/flows/`: Genkit flow definitions (summarization, quiz generation).
*   `public/`: Static assets.
*   `.env.local`: Environment variables (Firebase keys, AI keys). **DO NOT COMMIT THIS FILE** if it contains sensitive information.
*   `next.config.ts`: Next.js configuration.
*   `tailwind.config.ts`: Tailwind CSS configuration.
*   `tsconfig.json`: TypeScript configuration.
*   `package.json`: Project dependencies and scripts.
