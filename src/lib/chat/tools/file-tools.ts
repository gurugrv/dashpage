import { tool } from 'ai';
import { z } from 'zod';
import { applyEditOperations } from '@/lib/parser/edit-operations/apply-edit-operations';
import type { ProjectFiles } from '@/types';

export function createFileTools(workingFiles: ProjectFiles) {
  return {
    writeFiles: tool({
      description:
        'Create or rewrite complete HTML files. Use for new sites, major redesigns, structural overhauls, or adding new pages. Include ONLY files being created or fully rewritten — unchanged files are preserved automatically. Returns { success, files } with the written file map.',
      inputSchema: z.object({
        files: z
          .record(z.string(), z.string())
          .describe(
            'Map of filename to complete file content. Each HTML file must be a standalone document with its own <head>, Tailwind CDN, fonts, and design system.',
          ),
      }),
      execute: async ({ files }) => {
        Object.assign(workingFiles, files);
        return { success: true as const, files };
      },
    }),

    editFile: tool({
      description:
        'Apply targeted search/replace edits to an existing file. Each search string must match EXACTLY including whitespace and indentation. Batch multiple changes into one call using the operations array. Returns { success, file, content } on success. On failure returns { success: false, error } with the failed operation index — fall back to readFile then writeFiles if exact match fails.',
      inputSchema: z.object({
        file: z
          .string()
          .describe('The filename to edit, e.g. "index.html" or "about.html"'),
        operations: z
          .array(
            z.object({
              search: z
                .string()
                .describe(
                  'Exact substring to find in the file. Must match precisely including whitespace and indentation.',
                ),
              replace: z
                .string()
                .describe(
                  'Replacement text. Use empty string to delete the matched content.',
                ),
            }),
          )
          .describe('Ordered list of search/replace operations to apply sequentially'),
      }),
      execute: async ({ file, operations }) => {
        const source = workingFiles[file];
        if (!source) {
          return {
            success: false as const,
            error: `File "${file}" not found. Available files: ${Object.keys(workingFiles).join(', ') || 'none'}. Use writeFiles to create it.`,
          };
        }

        const result = applyEditOperations(source, operations);
        if (result.success) {
          workingFiles[file] = result.html;
          return { success: true as const, file, content: result.html };
        }

        return {
          success: false as const,
          error: `Edit operation ${(result.failedIndex ?? 0) + 1} of ${operations.length} failed: search text not found in "${file}". Use writeFiles to provide the complete replacement file instead.`,
        };
      },
    }),

    readFile: tool({
      description:
        'Read the current contents of a file. Returns { success, file, content, length }. Use before editFile to see exact whitespace/indentation for accurate search strings, or after edits to verify changes.',
      inputSchema: z.object({
        file: z
          .string()
          .describe('The filename to read, e.g. "index.html" or "about.html"'),
      }),
      execute: async ({ file }) => {
        const content = workingFiles[file];
        if (content === undefined) {
          return {
            success: false as const,
            error: `File "${file}" not found. Available files: ${Object.keys(workingFiles).join(', ') || 'none'}.`,
          };
        }
        return { success: true as const, file, content, length: content.length };
      },
    }),
  };
}
