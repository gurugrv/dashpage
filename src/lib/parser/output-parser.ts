import { z } from 'zod';

export const htmlOutputSchema = z.object({
  explanation: z.string().describe('Brief explanation of what was built/changed (2-3 sentences)'),
  files: z.record(z.string(), z.string()).describe('Map of filename to file contents. Use "index.html" as the key.'),
});

export type HtmlOutput = z.infer<typeof htmlOutputSchema>;
