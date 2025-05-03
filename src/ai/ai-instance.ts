
import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';

// Log the API key status ONLY during server startup for debugging
// IMPORTANT: Avoid logging the actual key value in production environments
const apiKey = process.env.GOOGLE_GENAI_API_KEY;
if (apiKey && apiKey !== 'YOUR_GOOGLE_GENAI_API_KEY') {
    console.log('AI Instance: GOOGLE_GENAI_API_KEY found.');
} else if (apiKey === 'YOUR_GOOGLE_GENAI_API_KEY') {
    console.warn('AI Instance: GOOGLE_GENAI_API_KEY is set to the placeholder value "YOUR_GOOGLE_GENAI_API_KEY". AI features will fail. Please update your .env.local file.');
}
else {
    console.error('AI Instance: GOOGLE_GENAI_API_KEY is missing from environment variables. AI features will fail.');
}


export const ai = genkit({
  promptDir: './prompts',
  plugins: [
    googleAI({
      // Pass the apiKey directly. If it's undefined or invalid, Genkit/Google AI plugin will handle the error.
      apiKey: apiKey,
    }),
  ],
  model: 'googleai/gemini-2.0-flash',
});
