
import {genkit, type GenkitError} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';

// Flag to indicate AI initialization status
let isAiInitialized = false;
let aiInitializationError: string | null = null;

// Log the API key status ONLY during server startup for debugging
// IMPORTANT: Avoid logging the actual key value in production environments
const apiKey = process.env.GOOGLE_GENAI_API_KEY;
if (!apiKey || apiKey === 'YOUR_GOOGLE_GENAI_API_KEY') {
    aiInitializationError = 'AI Instance: GOOGLE_GENAI_API_KEY is missing or set to the placeholder value "YOUR_GOOGLE_GENAI_API_KEY". AI features will be disabled. Please update your .env.local file and restart the Genkit server (npm run genkit:dev).';
    console.error(aiInitializationError); // Log error immediately
} else {
    console.log('AI Instance: GOOGLE_GENAI_API_KEY found.');
}

// Initialize Genkit only if the API key seems valid
// Export 'ai' as potentially null
export const ai = !aiInitializationError ? genkit({
  promptDir: './prompts',
  plugins: [
    googleAI({
      apiKey: apiKey, // Pass the apiKey directly
    }),
  ],
  model: 'googleai/gemini-2.0-flash',
   // Add an error handler to catch runtime issues, e.g., invalid key during a call
   errorHandler: (err: GenkitError) => {
     console.error('Genkit Runtime Error:', err.message, err.stack, err.details);
     // You might want to re-throw or handle specific errors differently
     // For API key errors, update the status
     if (err.message.includes('API key not valid') || err.details?.includes?.('API_KEY_INVALID')) {
         aiInitializationError = "Genkit Runtime Error: Google AI API key is not valid. Check .env.local and restart Genkit server.";
         isAiInitialized = false; // Mark as uninitialized on runtime error
         console.error(aiInitializationError);
     }
   },
}) : null; // Set ai to null if the initial key check failed

if (ai) {
    isAiInitialized = true;
    console.log('AI Instance: Genkit initialized successfully.');
}

// Export the status flags
export { isAiInitialized, aiInitializationError };

    