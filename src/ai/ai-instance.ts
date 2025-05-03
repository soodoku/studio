
import {genkit, type GenkitError} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';

// Flag to indicate AI initialization status and store error message
let isAiInitialized = false;
let aiInitializationError: string | null = null;
let ai: ReturnType<typeof genkit> | null = null; // Declare ai as potentially null

try {
    // Log the API key status ONLY during server startup for debugging
    // IMPORTANT: Avoid logging the actual key value in production environments
    const apiKey = process.env.GOOGLE_GENAI_API_KEY;
    if (!apiKey || apiKey === 'YOUR_GOOGLE_GENAI_API_KEY') {
        aiInitializationError = 'AI Instance: GOOGLE_GENAI_API_KEY is missing or set to the placeholder value "YOUR_GOOGLE_GENAI_API_KEY". AI features will be disabled. Please update your .env.local file and restart the Genkit server (npm run genkit:dev).';
        console.error(aiInitializationError); // Log error immediately
        isAiInitialized = false;
    } else {
        console.log('AI Instance: GOOGLE_GENAI_API_KEY found. Initializing Genkit...');

        // Initialize Genkit only if the API key seems valid
        ai = genkit({
            plugins: [
                googleAI({
                    apiKey: apiKey, // Pass the apiKey directly
                }),
            ],
            // Remove model definition here, specify in prompt/generate calls
            // model: 'googleai/gemini-pro', // Example model
             logLevel: 'debug', // Keep debug logging for development
             enableTracing: true, // Enable tracing if desired

            // Add an error handler to catch runtime issues, e.g., invalid key during a call
            errorHandler: (err: GenkitError) => {
                console.error('Genkit Runtime Error:', err.message, err.stack, err.details);
                // Update status on specific API key errors
                if (err.message.includes('API key not valid') || err.details?.includes?.('API_KEY_INVALID')) {
                    aiInitializationError = "Genkit Runtime Error: Google AI API key is not valid. Check .env.local and restart Genkit server.";
                    isAiInitialized = false; // Mark as uninitialized on runtime error
                    console.error(aiInitializationError);
                }
                // Optionally re-throw or handle other errors
            },
        });

        isAiInitialized = true; // Assume initialized if genkit() doesn't throw immediately
        console.log('AI Instance: Genkit configuration attempted.');
         // We can't *guarantee* success until a call is made, but mark as initialized for now.
         // The errorHandler will catch runtime key issues.
    }
} catch (initErr) {
    // Catch errors during the synchronous part of genkit() setup
    aiInitializationError = `Genkit failed to initialize: ${initErr instanceof Error ? initErr.message : String(initErr)}`;
    console.error(aiInitializationError);
    isAiInitialized = false;
    ai = null; // Ensure ai is null if initialization throws
}

// Export the 'ai' instance (potentially null) and the status flags
export { ai, isAiInitialized, aiInitializationError };
