import { tool } from 'ai';
import { z } from 'zod';
import { applyEditOperations } from '@/lib/parser/edit-operations/apply-edit-operations';
import type { EditOperation } from '@/lib/parser/edit-operations/types';
import type { ProjectFiles } from '@/types';

// Track consecutive failures per file for escalation
type MistakeTracker = Map<string, number>;

const replaceOperationSchema = z.object({
  search: z.string().describe('Exact substring to find in the file. Must match precisely including whitespace and indentation.'),
  replace: z.string().describe('Replacement text. Use empty string to delete the matched content.'),
  expectedReplacements: z.coerce.number().int().min(1).optional()
    .describe('Number of occurrences to replace. Default 1 (first match only). Set higher to replace multiple occurrences.'),
});

function availableFilesList(workingFiles: ProjectFiles): string {
  return Object.keys(workingFiles).join(', ') || 'none';
}

/**
 * Normalize malformed writeFiles input from models that pass structured objects
 * instead of a flat Record<string, string>. Handles cases like:
 *   { version: 1, id: "services", content: "<!DOCTYPE..." }
 *   { "services.html": { content: "<!DOCTYPE..." } }
 * Strips non-file keys and extracts HTML content where possible.
 */
function normalizeFilesInput(val: unknown): unknown {
  if (!val || typeof val !== 'object') return val;

  // Handle array format: [{ name: "header.html", content: "..." }, ...]
  if (Array.isArray(val)) {
    const result: Record<string, string> = {};
    for (const item of val) {
      if (item && typeof item === 'object') {
        const obj = item as Record<string, unknown>;
        const name = obj.name ?? obj.filename ?? obj.file ?? obj.path;
        const content = obj.content ?? obj.html ?? obj.body ?? obj.source ?? obj.code;
        if (typeof name === 'string' && typeof content === 'string') {
          result[name.replace(/^['"](.+)['"]$/, '$1').toLowerCase()] = content;
        }
      }
    }
    return Object.keys(result).length > 0 ? result : val;
  }

  const obj = val as Record<string, unknown>;
  const keys = Object.keys(obj);

  // Already valid: all values are strings — pass through
  if (keys.length > 0 && keys.every(k => typeof obj[k] === 'string')) return val;

  const result: Record<string, string> = {};

  // Metadata keys that models hallucinate — never filenames
  const metadataKeys = new Set(['version', 'id', 'type', 'name', 'title', 'description', 'metadata', 'schema']);

  for (const [key, value] of Object.entries(obj)) {
    // Skip obvious metadata (non-string values like numbers/booleans)
    if (metadataKeys.has(key) && typeof value !== 'string') continue;
    if (metadataKeys.has(key) && typeof value === 'string' && !value.includes('<')) continue;

    if (typeof value === 'string') {
      // String value — keep as-is (likely filename -> HTML)
      result[key] = value;
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      const nested = value as Record<string, unknown>;
      const nestedKeys = Object.keys(nested);

      // Try to extract HTML from content/html/body fields first
      const html = nested.content ?? nested.html ?? nested.body ?? nested.source;
      if (typeof html === 'string') {
        result[key] = html;
      } else if (nestedKeys.length > 0 && nestedKeys.every(k => typeof nested[k] === 'string')) {
        // Directory wrapper pattern: { "_components": { "footer": "<footer>...", "header": "<header>..." } }
        // Flatten inner entries as individual files
        for (const [innerKey, innerVal] of Object.entries(nested)) {
          result[innerKey] = innerVal as string;
        }
      }
    }
  }

  return Object.keys(result).length > 0 ? result : val;
}

export function createFileTools(workingFiles: ProjectFiles, fileSnapshots: ProjectFiles) {
  const editFileMistakes: MistakeTracker = new Map();
  let writeFilesEmptyCount = 0;

  return {
    writeFiles: tool({
      description:
        'Create or rewrite complete HTML files. Use for new sites, major redesigns, structural overhauls, or adding new pages. Include ONLY files being created or fully rewritten — unchanged files are preserved automatically. Returns { success, fileNames } with the list of written filenames.',
      inputSchema: z.object({
        files: z.preprocess(
          (val) => normalizeFilesInput(val),
          z.record(z.string(), z.string()),
        ).describe(
            'Map of filename (with extension, e.g. "index.html", "about.html") to complete file content. Each HTML file must be a standalone document starting with <!DOCTYPE html>, containing <head> with Tailwind CDN, fonts, and design system, and a full <body>. Values must be complete HTML — never single words or placeholders.',
          ),
        summary: z.string().optional().describe('Brief 1-2 sentence description of what was created or changed, highlighting key design choices and sections. Shown to the user as a completion message.'),
      }),
      execute: async ({ files }) => {
        // Reject completely empty files map
        if (!files || Object.keys(files).length === 0) {
          writeFilesEmptyCount++;
          const base = 'The "files" parameter is empty. Use writeFile (singular) instead — it is simpler: writeFile({ filename: "index.html", content: "<!DOCTYPE html><html>...</html>" }).';
          if (writeFilesEmptyCount >= 2) {
            return {
              success: false as const,
              error: `${base} This is attempt #${writeFilesEmptyCount} with empty files. You MUST use writeFile (singular) now — do NOT call writeFiles again.`,
              fatal: true as const,
            };
          }
          return { success: false as const, error: base };
        }

        // Reset empty counter on non-empty call
        writeFilesEmptyCount = 0;

        // Normalize keys: strip wrapping quotes, lowercase, convert underscores to dots for extension
        const normalized: Record<string, string> = {};
        for (const [key, value] of Object.entries(files)) {
          // Strip wrapping single/double quotes (hallucinated by some models)
          let fixedKey = key.replace(/^['"](.+)['"]$/, '$1').toLowerCase();
          // Convert _components_header_html -> _components/header.html
          if (fixedKey.startsWith('_components_') && !fixedKey.includes('/')) {
            fixedKey = fixedKey.replace('_components_', '_components/');
          }
          if (!fixedKey.includes('.')) {
            // Try underscore convention first: "index_html" -> "index.html"
            const underscored = fixedKey.replace(/_([a-z]+)$/, '.$1');
            // If regex matched, use it; otherwise default to .html
            fixedKey = underscored !== fixedKey ? underscored : `${fixedKey}.html`;
          }
          normalized[fixedKey] = value;
        }

        // Validate: reject files with trivially small content (likely hallucinated garbage)
        const MIN_HTML_LENGTH = 50;
        const tooSmall = Object.entries(normalized).filter(
          ([name, content]) => name.endsWith('.html') && content.length < MIN_HTML_LENGTH,
        );
        if (tooSmall.length > 0 && tooSmall.length === Object.keys(normalized).length) {
          const names = tooSmall.map(([n, c]) => `"${n}" (${c.length} chars)`).join(', ');
          return {
            success: false as const,
            error: `All files are too small to be valid HTML: ${names}. Each HTML file must be a complete document with <!DOCTYPE html>, <head>, and <body>. Generate the FULL page content, not placeholders.`,
          };
        }

        // Filter out garbage files but keep valid ones
        for (const [name] of tooSmall) {
          delete normalized[name];
        }

        if (Object.keys(normalized).length === 0) {
          return { success: false as const, error: 'No valid files to write after filtering invalid entries. Each HTML file must be a complete document starting with <!DOCTYPE html>.' };
        }

        Object.assign(workingFiles, normalized);
        Object.assign(fileSnapshots, normalized);
        return { success: true as const, fileNames: Object.keys(normalized) };
      },
    }),

    // Flat single-file variant — easier for models that struggle with nested Record schemas
    // (e.g. Gemini 3 Flash/Pro get MALFORMED_FUNCTION_CALL with large Record<string,string> args)
    writeFile: tool({
      description:
        'Write a single complete HTML file. Use this to create or rewrite one page. The content must be a complete HTML document starting with <!DOCTYPE html>. Returns { success, fileName }.',
      inputSchema: z.object({
        filename: z.string().describe('Filename with extension, e.g. "index.html", "about.html"'),
        content: z.string().describe('Complete HTML document starting with <!DOCTYPE html>. Must include <head> with Tailwind CDN, fonts, design system, and a full <body>. Never use placeholders or abbreviated content.'),
        summary: z.string().optional().describe('Brief 1-2 sentence description of what was created or changed, highlighting key design choices and sections. Shown to the user as a completion message.'),
      }),
      execute: async ({ filename, content }) => {
        // Strip wrapping quotes hallucinated by some models, lowercase
        let fixedName = filename.replace(/^['"](.+)['"]$/, '$1').toLowerCase();
        if (!fixedName.includes('.')) {
          const underscored = fixedName.replace(/_([a-z]+)$/, '.$1');
          fixedName = underscored !== fixedName ? underscored : `${fixedName}.html`;
        }

        const MIN_HTML_LENGTH = 50;
        if (fixedName.endsWith('.html') && content.length < MIN_HTML_LENGTH) {
          return {
            success: false as const,
            error: `File "${fixedName}" is too small (${content.length} chars). Must be a complete HTML document with <!DOCTYPE html>, <head>, and <body>.`,
          };
        }

        workingFiles[fixedName] = content;
        fileSnapshots[fixedName] = content;
        return { success: true as const, fileName: fixedName };
      },
    }),

    editFiles: tool({
      description:
        'Edit one or more files using search/replace operations. Uses 4-tier matching: exact → whitespace-tolerant → token-based → fuzzy (≥85%). All operations are attempted even if some fail — successful edits are kept. Per-file atomicity: a failed file does not block successful ones. After 2 consecutive failures on the same file, consider using writeFiles instead.',
      inputSchema: z.object({
        edits: z.array(z.object({
          file: z.string().describe('The filename to edit'),
          replaceOperations: z.array(replaceOperationSchema)
            .describe('Search/replace operations to apply'),
        })).describe('Array of per-file edit specifications'),
      }),
      execute: async ({ edits }) => {
        const results: Array<{
          file: string;
          success: true | 'partial' | false;
          content?: string;
          _fullContent?: string;
          error?: string;
          appliedCount?: number;
          failedOperations?: unknown;
          matchTiers?: string[];
          bestMatch?: unknown;
        }> = [];

        for (const rawEdit of edits) {
          const edit = { ...rawEdit, file: rawEdit.file.replace(/^['"](.+)['"]$/, '$1').toLowerCase() };
          const source = workingFiles[edit.file];
          if (!source) {
            results.push({
              file: edit.file,
              success: false,
              error: `File "${edit.file}" not found. Available: ${availableFilesList(workingFiles)}.`,
            });
            continue;
          }

          let currentHtml = source;
          let fileSuccess: true | 'partial' | false = true;
          let fileError: string | undefined;

          // Search/replace operations
          let matchTiers: string[] | undefined;
          let bestMatch: unknown;
          let failedOperations: unknown;
          if (edit.replaceOperations && edit.replaceOperations.length > 0) {
            const replaceResult = applyEditOperations(currentHtml, edit.replaceOperations as EditOperation[]);
            currentHtml = replaceResult.html;
            if (replaceResult.success === true || replaceResult.success === 'partial') {
              matchTiers = replaceResult.matchTiers;
            }
            if (replaceResult.success === 'partial' || replaceResult.success === false) {
              bestMatch = replaceResult.bestMatch ?? undefined;
            }
            if (replaceResult.success === 'partial') {
              fileSuccess = 'partial';
              const cascadeCount = replaceResult.failedOperations?.filter(f => f.cascade).length ?? 0;
              const cascadeNote = cascadeCount > 0 ? ` (${cascadeCount} cascade failure${cascadeCount > 1 ? 's' : ''} — dependent operations skipped)` : '';
              fileError = [fileError, replaceResult.error + cascadeNote].filter(Boolean).join('; ');
              failedOperations = replaceResult.failedOperations;
            } else if (replaceResult.success === false) {
              fileSuccess = false;
              fileError = [fileError, replaceResult.error].filter(Boolean).join('; ');
            }
          }

          // Mistake tracking for escalation
          if (fileSuccess === true) {
            editFileMistakes.delete(edit.file);
          } else if (fileSuccess === 'partial' || fileSuccess === false) {
            const count = (editFileMistakes.get(edit.file) ?? 0) + 1;
            editFileMistakes.set(edit.file, count);
            if (count >= 2) {
              fileError = (fileError ?? '') + ' This is the 2nd consecutive failure on this file — consider using writeFiles for a complete replacement.';
            }
          }

          if (fileSuccess === true) {
            workingFiles[edit.file] = currentHtml;
            fileSnapshots[edit.file] = currentHtml;
          } else if (fileSuccess === 'partial') {
            // Commit partial changes to working files but keep old snapshot for rollback
            workingFiles[edit.file] = currentHtml;
          } else {
            // Total failure — restore from last-known-good snapshot
            if (fileSnapshots[edit.file] !== undefined) {
              workingFiles[edit.file] = fileSnapshots[edit.file];
            }
          }

          // For successful edits, split content: truncated summary for AI context,
          // full content in _fullContent for client parser (Fix #13: context bloat)
          const TRUNCATE_THRESHOLD = 20_000; // 20KB
          const SUMMARY_LINES = 50;
          let content: string | undefined;
          let _fullContent: string | undefined;

          if (fileSuccess !== false) {
            if (currentHtml.length > TRUNCATE_THRESHOLD) {
              const lines = currentHtml.split('\n');
              const head = lines.slice(0, SUMMARY_LINES).join('\n');
              const tail = lines.slice(-SUMMARY_LINES).join('\n');
              content = `${head}\n\n/* ... ${lines.length - SUMMARY_LINES * 2} lines omitted (${currentHtml.length} chars total) ... */\n\n${tail}`;
              _fullContent = currentHtml;
            } else {
              content = currentHtml;
            }
          }

          results.push({
            file: edit.file,
            success: fileSuccess,
            content,
            _fullContent,
            error: fileError,
            failedOperations,
            matchTiers,
            bestMatch,
          });
        }

        const allSuccess = results.every((r) => r.success === true);
        const allFailed = results.every((r) => r.success === false);

        return {
          success: allSuccess ? (true as const) : allFailed ? (false as const) : ('partial' as const),
          results,
        };
      },
    }),

    readFile: tool({
      description:
        'Read the current contents of a file. Returns { success, file, content, length }. Use before editFiles to see exact whitespace/indentation for accurate search strings, or after edits to verify changes.',
      inputSchema: z.object({
        file: z.string().describe('The filename to read, e.g. "index.html" or "about.html"'),
      }),
      execute: async ({ file: rawFile }) => {
        const file = rawFile.replace(/^['"](.+)['"]$/, '$1').toLowerCase();
        const content = workingFiles[file];
        if (content === undefined) {
          return {
            success: false as const,
            error: `File "${file}" not found. Available files: ${availableFilesList(workingFiles)}.`,
          };
        }
        return { success: true as const, file, content, length: content.length };
      },
    }),
  };
}
