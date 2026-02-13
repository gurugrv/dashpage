import { tool } from 'ai';
import { z } from 'zod';
import { HtmlValidate } from 'html-validate';
import type { ProjectFiles } from '@/types';

// Relaxed config suitable for Tailwind CDN + inline styles generated websites
const htmlValidate = new HtmlValidate({
  extends: ['html-validate:recommended'],
  rules: {
    'require-sri': 'off',           // CDN scripts don't need SRI
    'no-inline-style': 'off',       // We use inline <style> tags
    'script-type': 'off',           // Tailwind config script has no type
    'no-raw-characters': 'off',     // Allow special chars in content
    'tel-non-breaking': 'off',      // Not relevant for generated sites
    'attribute-boolean-style': 'off', // Allow both styles
    'no-trailing-whitespace': 'off', // Not critical
    'element-permitted-content': 'off', // Too strict for Tailwind patterns
    'element-permitted-parent': 'off',  // Too strict for Tailwind patterns
    'void-style': 'off',            // Allow both self-closing and not
    'doctype-style': 'off',         // Allow any doctype style
  },
});

export function createValidationTools(workingFiles: ProjectFiles) {
  return {
    validateHtml: tool({
      description:
        'Validate an HTML file for syntax errors and common issues. Use after writing or editing files to catch problems. Returns errors with line numbers so you can fix them with editFile.',
      inputSchema: z.object({
        file: z
          .string()
          .describe('The filename to validate, e.g. "index.html"'),
      }),
      execute: async ({ file }) => {
        const content = workingFiles[file];
        if (content === undefined) {
          return {
            success: false as const,
            error: `File "${file}" not found. Available files: ${Object.keys(workingFiles).join(', ') || 'none'}.`,
          };
        }

        try {
          const report = htmlValidate.validateString(content, file);
          const messages = report.results.flatMap((r) => r.messages);

          // Filter to only errors and warnings (skip info)
          const issues = messages
            .filter((m) => m.severity >= 1) // 1 = warn, 2 = error
            .slice(0, 10) // Cap at 10 to avoid overwhelming the LLM
            .map((m) => ({
              severity: m.severity === 2 ? 'error' : 'warning',
              message: m.message,
              line: m.line,
              column: m.column,
              ruleId: m.ruleId,
            }));

          return {
            success: true as const,
            valid: issues.filter((i) => i.severity === 'error').length === 0,
            errorCount: issues.filter((i) => i.severity === 'error').length,
            warningCount: issues.filter((i) => i.severity === 'warning').length,
            issues,
          };
        } catch (error) {
          return {
            success: false as const,
            error: `Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          };
        }
      },
    }),
  };
}
