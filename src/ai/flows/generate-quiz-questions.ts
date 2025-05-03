
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
import {GenerateResponse} from 'genkit'; // Import GenerateResponse type

const QuestionSchema = z.object({
    question: z.string().describe('The quiz question.'),
    options: z.array(z.string()).length(4, { message: "Must have exactly 4 options." }).describe('The multiple-choice options (exactly 4).'),
    answer: z.string().describe('The correct answer (must be one of the options).'),
}).refine(data => data.options.includes(data.answer), {
    message: "Answer must be one of the provided options.",
    path: ["answer"], // specify the path of the error
});


const GenerateQuizQuestionsInputSchema = z.object({
  text: z
    .string()
    .min(50, { message: "Text must be at least 50 characters long to generate meaningful questions." })
    .describe('The text content from which to generate quiz questions.'),
  numQuestions: z
    .number()
    .int()
    .min(1, { message: "Number of questions must be at least 1."})
    .max(10, { message: "Number of questions cannot exceed 10."}) // Add a reasonable max
    .default(3)
    .describe('The number of quiz questions to generate (1-10).'),
});
export type GenerateQuizQuestionsInput = z.infer<
  typeof GenerateQuizQuestionsInputSchema
>;

const GenerateQuizQuestionsOutputSchema = z.object({
  questions: z.array(QuestionSchema)
    .min(1, { message: "Must generate at least one question." }) // Ensure at least one question is generated
    .describe('An array of quiz questions.'),
});
export type GenerateQuizQuestionsOutput = z.infer<
  typeof GenerateQuizQuestionsOutputSchema
>;

export async function generateQuizQuestions(
  input: GenerateQuizQuestionsInput
): Promise<GenerateQuizQuestionsOutput> {
   // Validate input using Zod schema before calling the flow
   const validationResult = GenerateQuizQuestionsInputSchema.safeParse(input);
   if (!validationResult.success) {
      const issues = validationResult.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join(', ');
      throw new Error(`Invalid input for quiz generation: ${issues}`);
   }
  return generateQuizQuestionsFlow(validationResult.data);
}

const prompt = ai.definePrompt({
  name: 'generateQuizQuestionsPrompt',
  input: {
    schema: GenerateQuizQuestionsInputSchema, // Use the validated input schema
  },
  output: {
    schema: GenerateQuizQuestionsOutputSchema, // Use the defined output schema
  },
  prompt: `You are an expert in creating multiple-choice quizzes based on provided text. Generate exactly {{{numQuestions}}} distinct multiple-choice questions from the text content below.

Text content:
{{{text}}}

Constraints for each question:
1.  The question must be relevant to the provided text.
2.  There must be exactly 4 options.
3.  One option must be the single correct answer.
4.  The correct answer MUST be listed within the 4 options.
5.  Options should be plausible but clearly distinguishable based on the text.

Output ONLY a valid JSON array containing the question objects. Each object must have the keys 'question' (string), 'options' (array of 4 strings), and 'answer' (string, matching one of the options).

Example JSON structure:
[
  {
    "question": "...",
    "options": ["...", "...", "...", "..."],
    "answer": "..."
  },
  {
    "question": "...",
    "options": ["...", "...", "...", "..."],
    "answer": "..."
  }
]
`,
});

const generateQuizQuestionsFlow = ai.defineFlow<
  typeof GenerateQuizQuestionsInputSchema,
  typeof GenerateQuizQuestionsOutputSchema
>(
  {
    name: 'generateQuizQuestionsFlow',
    inputSchema: GenerateQuizQuestionsInputSchema,
    outputSchema: GenerateQuizQuestionsOutputSchema,
  },
  async (input): Promise<GenerateQuizQuestionsOutput> => {
      let response: GenerateResponse | undefined;
      try {
        response = await prompt(input);

        const output = response?.output; // Access output property directly

        // Validate the structure and content of the output
        const validation = GenerateQuizQuestionsOutputSchema.safeParse(output);

        if (!validation.success) {
            console.error('Invalid output structure from AI:', validation.error.issues);
             // Try to provide more specific feedback if possible
             const errorDetails = validation.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
            throw new Error(`AI returned invalid quiz data: ${errorDetails}`);
        }

        // Ensure the number of questions matches the request
        if (validation.data.questions.length !== input.numQuestions) {
             console.warn(`AI generated ${validation.data.questions.length} questions, but ${input.numQuestions} were requested.`);
             // Decide how to handle this: return what was generated, or throw an error?
             // Let's return what was generated but maybe cap it or log a warning.
             // For now, just return the generated questions.
        }


        return validation.data; // Return the validated data

      } catch (error) {
        console.error("Error during generateQuizQuestionsFlow:", error);
         if (error instanceof Error && error.message.includes('API key not valid')) {
              throw new Error('API key not valid. Please check your configuration.');
         }
         // Rethrow specific validation errors or generic server errors
         if (error instanceof Error && error.message.startsWith('AI returned invalid quiz data')) {
            throw error; // Propagate the specific validation error
         }
        throw new Error('Failed to generate quiz questions due to a server error.');
      }
  }
);
