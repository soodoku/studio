
'use server';

/**
 * @fileOverview Summarizes audiobook chapters to provide quick key idea summaries.
 *
 * - summarizeAudiobookChapter - A function that handles the summarization process.
 * - SummarizeAudiobookChapterInput - The input type for the summarizeAudiobookChapter function.
 * - SummarizeAudiobookChapterOutput - The return type for the summarizeAudiobookChapter function.
 */

import {ai} from '@/ai/ai-instance';
import {z} from 'genkit';
import {GenerateResponse} from 'genkit'; // Import GenerateResponse type

const SummarizeAudiobookChapterInputSchema = z.object({
  chapterText: z
    .string()
    .min(10, { message: "Chapter text must be at least 10 characters long for summarization." }) // Add minimum length validation
    .describe('The text content of the audiobook chapter to summarize.'),
});
export type SummarizeAudiobookChapterInput = z.infer<typeof SummarizeAudiobookChapterInputSchema>;

const SummarizeAudiobookChapterOutputSchema = z.object({
  summary: z.string().describe('A concise summary of the audiobook chapter.'),
  // Removed progress field as it's not essential for the core functionality
});
export type SummarizeAudiobookChapterOutput = z.infer<typeof SummarizeAudiobookChapterOutputSchema>;

export async function summarizeAudiobookChapter(
  input: SummarizeAudiobookChapterInput
): Promise<SummarizeAudiobookChapterOutput> {
   // Validate input using Zod schema before calling the flow
   const validationResult = SummarizeAudiobookChapterInputSchema.safeParse(input);
   if (!validationResult.success) {
     // Throw a more informative error
     const issues = validationResult.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join(', ');
     throw new Error(`Invalid input for summarization: ${issues}`);
   }
  return summarizeAudiobookChapterFlow(validationResult.data);
}

const prompt = ai.definePrompt({
  name: 'summarizeAudiobookChapterPrompt',
  input: {
    schema: z.object({ // Match the flow's input schema
      chapterText: z
        .string()
        .describe('The text content of the audiobook chapter to summarize.'),
    }),
  },
  output: {
    schema: SummarizeAudiobookChapterOutputSchema, // Use the defined output schema
  },
  prompt: `Summarize the following audiobook chapter. Focus on the key ideas and main points. Keep the summary concise, ideally 2-4 sentences.\n\nChapter Text:\n{{{chapterText}}}`,
});


const summarizeAudiobookChapterFlow = ai.defineFlow<
  typeof SummarizeAudiobookChapterInputSchema,
  typeof SummarizeAudiobookChapterOutputSchema
>(
  {
    name: 'summarizeAudiobookChapterFlow',
    inputSchema: SummarizeAudiobookChapterInputSchema,
    outputSchema: SummarizeAudiobookChapterOutputSchema,
  },
  async (input): Promise<SummarizeAudiobookChapterOutput> => {
    let response: GenerateResponse | undefined;
    try {
      // Directly await the prompt call
      response = await prompt(input);

      const output = response?.output; // Access output property directly

      if (!output || typeof output.summary !== 'string') {
        console.error('Invalid output structure from AI (summarizeAudiobookChapterFlow):', output);
        throw new Error('Failed to generate a valid summary structure.');
      }

      return { summary: output.summary }; // Return only the summary

    } catch (error: any) {
        console.error("Error during summarizeAudiobookChapterFlow (server-side):", error); // Log the full error object
         let errorMessage = 'Failed to generate summary due to an unexpected server error.';

         if (error instanceof Error) {
            // Check for specific error messages from Google AI or Genkit
             if (error.message.includes('API key not valid') || error.message.includes('Invalid API key') || (error as any).details?.includes?.('API_KEY_INVALID')) {
                  errorMessage = 'Google AI API key not valid. Please check your GOOGLE_GENAI_API_KEY configuration in .env.local and ensure the Genkit server was restarted after changes.';
             } else if (error.message.includes('fetch failed') || error.message.includes('ECONNREFUSED')) {
                 errorMessage = 'Network error: Could not connect to the AI service. Ensure the Genkit server is running and can reach Google AI.';
             } else if (error.message.includes('rate limit')) {
                 errorMessage = 'API rate limit exceeded. Please wait and try again.';
             } else if (error.message.includes('Billing account not configured')) {
                 errorMessage = 'Google Cloud project billing is not configured correctly for the API key used.';
             }
             else {
                 // Use the error message directly if it's somewhat informative
                 errorMessage = `Failed to generate summary: ${error.message}`;
             }
         }

        // Rethrow a new error with the refined message
        throw new Error(errorMessage);
    }
  }
);
