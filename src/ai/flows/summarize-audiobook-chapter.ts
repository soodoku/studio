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

const SummarizeAudiobookChapterInputSchema = z.object({
  chapterText: z
    .string()
    .describe('The text content of the audiobook chapter to summarize.'),
});
export type SummarizeAudiobookChapterInput = z.infer<typeof SummarizeAudiobookChapterInputSchema>;

const SummarizeAudiobookChapterOutputSchema = z.object({
  summary: z.string().describe('A concise summary of the audiobook chapter.'),
  progress: z.string().describe('Tracks the progress of the summarization process'),
});
export type SummarizeAudiobookChapterOutput = z.infer<typeof SummarizeAudiobookChapterOutputSchema>;

export async function summarizeAudiobookChapter(
  input: SummarizeAudiobookChapterInput
): Promise<SummarizeAudiobookChapterOutput> {
  return summarizeAudiobookChapterFlow(input);
}

const prompt = ai.definePrompt({
  name: 'summarizeAudiobookChapterPrompt',
  input: {
    schema: z.object({
      chapterText: z
        .string()
        .describe('The text content of the audiobook chapter to summarize.'),
    }),
  },
  output: {
    schema: z.object({
      summary: z.string().describe('A concise summary of the audiobook chapter.'),
      progress: z.string().describe('Tracks the progress of the summarization process'),
    }),
  },
  prompt: `Summarize the following audiobook chapter. Focus on the key ideas and main points.\n\nChapter Text:\n{{{chapterText}}}`,
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
  async input => {
    const {output} = await prompt(input);
    return {
      ...output!,
      progress: 'Generated a short summary of what was passed in the input.',
    };
  }
);
