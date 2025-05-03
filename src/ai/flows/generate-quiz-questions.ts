'use server';

/**
 * @fileOverview Generates multiple-choice quiz questions from audiobook content.
 *
 * - generateQuizQuestions - A function that generates quiz questions.
 * - GenerateQuizQuestionsInput - The input type for the generateQuizQuestions function.
 * - GenerateQuizQuestionsOutput - The return type for the generateQuizQuestions function.
 */

import {ai} from '@/ai/ai-instance';
import {z} from 'genkit';

const GenerateQuizQuestionsInputSchema = z.object({
  text: z
    .string()
    .describe('The text content from which to generate quiz questions.'),
  numQuestions: z
    .number()
    .default(3)
    .describe('The number of quiz questions to generate.'),
});
export type GenerateQuizQuestionsInput = z.infer<
  typeof GenerateQuizQuestionsInputSchema
>;

const GenerateQuizQuestionsOutputSchema = z.object({
  questions: z.array(
    z.object({
      question: z.string().describe('The quiz question.'),
      options: z.array(z.string()).describe('The multiple-choice options.'),
      answer: z.string().describe('The correct answer.'),
    })
  ),
});
export type GenerateQuizQuestionsOutput = z.infer<
  typeof GenerateQuizQuestionsOutputSchema
>;

export async function generateQuizQuestions(
  input: GenerateQuizQuestionsInput
): Promise<GenerateQuizQuestionsOutput> {
  return generateQuizQuestionsFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateQuizQuestionsPrompt',
  input: {
    schema: z.object({
      text: z
        .string()
        .describe('The text content from which to generate quiz questions.'),
      numQuestions: z
        .number()
        .default(3)
        .describe('The number of quiz questions to generate.'),
    }),
  },
  output: {
    schema: z.object({
      questions: z.array(
        z.object({
          question: z.string().describe('The quiz question.'),
          options: z.array(z.string()).describe('The multiple-choice options.'),
          answer: z.string().describe('The correct answer.'),
        })
      ),
    }),
  },
  prompt: `You are an expert in creating quizzes from text. You will generate multiple-choice questions from the given text content.

Text content: {{{text}}}
Number of questions to generate: {{{numQuestions}}}

Ensure that each question has 4 options, one of which is the correct answer.  The answer must be one of the options.

Output a JSON array of questions, each with the keys 'question', 'options', and 'answer'.  Options should be an array of strings.

Example:
[
  {
    "question": "What is the capital of France?",
    "options": ["Berlin", "Paris", "London", "Rome"],
    "answer": "Paris"
  },
  {
    "question": "What is the highest mountain in the world?",
    "options": ["K2", "Kangchenjunga", "Matterhorn", "Mount Everest"],
    "answer": "Mount Everest"
  }
]
`,
});

const generateQuizQuestionsFlow = ai.defineFlow<
  typeof GenerateQuizQuestionsInputSchema,
  typeof GenerateQuizQuestionsOutputSchema
>({
  name: 'generateQuizQuestionsFlow',
  inputSchema: GenerateQuizQuestionsInputSchema,
  outputSchema: GenerateQuizQuestionsOutputSchema,
},
async input => {
  const {output} = await prompt(input);
  return output!;
});
