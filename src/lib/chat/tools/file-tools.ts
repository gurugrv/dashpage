import { tool } from 'ai';
import { z } from 'zod';
import { applyEditOperations } from '@/lib/parser/edit-operations/apply-edit-operations';
import { applyDomOperations } from '@/lib/parser/edit-operations/apply-dom-operations';
import type { DomOperation, EditOperation } from '@/lib/parser/edit-operations/types';
import type { ProjectFiles } from '@/types';

// Track consecutive failures per file for escalation
type MistakeTracker = Map<string, number>;

const domOperationSchema = z.object({
  selector: z.string().describe('CSS selector targeting the element(s), e.g. "img.hero", "#title", ".cta-button"'),
  action: z.enum([
    'setAttribute', 'setText', 'setHTML',
    'addClass', 'removeClass', 'replaceClass',
    'remove', 'insertAdjacentHTML',
  ]).describe('The DOM manipulation to perform'),
  attr: z.string().optional().describe('Attribute name (for setAttribute)'),
  value: z.string().optional().describe('New value for the operation'),
  oldClass: z.string().optional().describe('Class to remove (for replaceClass)'),
  newClass: z.string().optional().describe('Class to add (for replaceClass)'),
  position: z.enum(['beforebegin', 'afterbegin', 'beforeend', 'afterend']).optional()
    .describe('Insert position (for insertAdjacentHTML)'),
});

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
 * Create only the editDOM tool (for single-page mode where HTML is output as text).
 */
export function createEditDomTool(workingFiles: ProjectFiles) {
  return {
    editDOM: tool({
      description:
        'Apply targeted DOM operations to an existing HTML file using CSS selectors. Preferred for small changes: text, images, links, colors, classes, attributes, removing elements, adding elements near existing ones. Returns { success, file, content } on full success. On partial/failure returns details about which operations failed and why.',
      inputSchema: z.object({
        file: z.string().describe('The filename to edit, e.g. "index.html" or "about.html"'),
        operations: z.array(domOperationSchema).describe('Ordered list of DOM operations to apply'),
      }),
      execute: async ({ file, operations }) => {
        const source = workingFiles[file];
        if (!source) {
          return {
            success: false as const,
            error: `File "${file}" not found. Available files: ${availableFilesList(workingFiles)}`,
          };
        }

        const { html, results } = applyDomOperations(source, operations as DomOperation[]);
        const failures = results.filter((r) => !r.success);

        if (failures.length === 0) {
          workingFiles[file] = html;
          return { success: true as const, file, content: html };
        }

        if (failures.length < operations.length) {
          workingFiles[file] = html;
          return {
            success: 'partial' as const,
            file,
            content: html,
            appliedCount: operations.length - failures.length,
            errors: failures.map((f) => `Operation ${f.index + 1}: ${'error' in f ? f.error : 'unknown error'}`),
          };
        }

        return {
          success: false as const,
          error: `All ${operations.length} DOM operations failed:\n${failures.map((f) => `  Operation ${f.index + 1}: ${'error' in f ? f.error : 'unknown error'}`).join('\n')}`,
        };
      },
    }),
  };
}

/**
 * Normalize malformed writeFiles input from models that pass structured objects
 * instead of a flat Record<string, string>. Handles cases like:
 *   { version: 1, id: "services", content: "<!DOCTYPE..." }
 *   { "services.html": { content: "<!DOCTYPE..." } }
 * Strips non-file keys and extracts HTML content where possible.
 */
function normalizeFilesInput(val: unknown): unknown {
  if (!val || typeof val !== 'object' || Array.isArray(val)) return val;

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
      // Nested object — try to extract HTML from content/html/body fields
      const nested = value as Record<string, unknown>;
      const html = nested.content ?? nested.html ?? nested.body ?? nested.source;
      if (typeof html === 'string') {
        result[key] = html;
      }
    }
  }

  return Object.keys(result).length > 0 ? result : val;
}

export function createFileTools(workingFiles: ProjectFiles) {
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
      }),
      execute: async ({ files }) => {
        // Reject completely empty files map
        if (!files || Object.keys(files).length === 0) {
          writeFilesEmptyCount++;
          const base = 'The "files" parameter is empty — you must provide at least one file. Example: writeFiles({ files: { "index.html": "<!DOCTYPE html><html>...</html>" } }).';
          if (writeFilesEmptyCount >= 3) {
            return {
              success: false as const,
              error: `${base} This is attempt #${writeFilesEmptyCount} with empty files. STOP calling writeFiles with empty content. Instead, generate the complete HTML document first, then pass it as the file value.`,
            };
          }
          return { success: false as const, error: base };
        }

        // Reset empty counter on non-empty call
        writeFilesEmptyCount = 0;

        // Normalize keys: convert underscores to dots for extension (e.g. "index_html" -> "index.html")
        const normalized: Record<string, string> = {};
        for (const [key, value] of Object.entries(files)) {
          let fixedKey = key;
          if (!key.includes('.')) {
            // Try underscore convention first: "index_html" -> "index.html"
            const underscored = key.replace(/_([a-z]+)$/, '.$1');
            // If regex matched, use it; otherwise default to .html
            fixedKey = underscored !== key ? underscored : `${key}.html`;
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
        return { success: true as const, fileNames: Object.keys(normalized), notice: 'Files written. Proceed without re-reading.' };
      },
    }),

    ...createEditDomTool(workingFiles),

    editFiles: tool({
      description:
        'Edit one or more files in a single call. Each file can use DOM operations (CSS selectors) and/or search/replace operations. Uses 5-tier matching for replace: exact → whitespace-tolerant → token-based → fuzzy (≥85%) → auto-correct (≥75%). All operations are attempted even if some fail — successful edits are kept. Per-file atomicity: a failed file does not block successful ones. After 2 consecutive failures on the same file, consider using writeFiles instead.',
      inputSchema: z.object({
        edits: z.array(z.object({
          file: z.string().describe('The filename to edit'),
          domOperations: z.array(domOperationSchema).optional()
            .describe('DOM operations to apply first (CSS selector-based)'),
          replaceOperations: z.array(replaceOperationSchema).optional()
            .describe('Search/replace operations to apply after DOM operations'),
        })).describe('Array of per-file edit specifications'),
      }),
      execute: async ({ edits }) => {
        const results: Array<{
          file: string;
          success: true | 'partial' | false;
          content?: string;
          error?: string;
          appliedCount?: number;
          failedOperations?: unknown;
          matchTiers?: string[];
          bestMatch?: unknown;
        }> = [];

        for (const edit of edits) {
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

          // Phase 1: DOM operations
          if (edit.domOperations && edit.domOperations.length > 0) {
            const domResult = applyDomOperations(currentHtml, edit.domOperations as DomOperation[]);
            const failures = domResult.results.filter((r) => !r.success);
            currentHtml = domResult.html;
            if (failures.length > 0) {
              fileSuccess = failures.length < edit.domOperations.length ? 'partial' : false;
              fileError = failures.map((f) => `DOM op ${f.index + 1}: ${'error' in f ? f.error : 'unknown'}`).join('; ');
            }
          }

          // Phase 2: Search/replace operations (only if DOM phase didn't fully fail)
          let matchTiers: string[] | undefined;
          let bestMatch: unknown;
          let failedOperations: unknown;
          if (fileSuccess !== false && edit.replaceOperations && edit.replaceOperations.length > 0) {
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
              fileError = [fileError, replaceResult.error].filter(Boolean).join('; ');
              failedOperations = replaceResult.failedOperations;
            } else if (replaceResult.success === false) {
              fileSuccess = edit.domOperations?.length ? 'partial' : false;
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

          if (fileSuccess !== false) {
            workingFiles[edit.file] = currentHtml;
          }

          results.push({
            file: edit.file,
            success: fileSuccess,
            content: fileSuccess !== false ? currentHtml : undefined,
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
      execute: async ({ file }) => {
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
