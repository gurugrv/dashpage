# Edit System Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Improve file editing accuracy by adding DOM-aware editing (Cheerio), 4-tier fuzzy matching, partial success, multi-file batch operations, and rich error messages.

**Architecture:** Three new/enhanced tools (`editDOM`, enhanced `editFile`, `editFiles`) built on top of the existing `workingFiles` mutable copy pattern. Cheerio handles DOM parsing for `editDOM`. `fastest-levenshtein` provides fuzzy similarity scoring. The `useHtmlParser` hook is updated to extract results from new tool output shapes. System prompts are updated to guide tool selection.

**Tech Stack:** Cheerio (HTML DOM manipulation), fastest-levenshtein (fuzzy matching), Zod (schema validation), Vercel AI SDK v6 (tool definitions)

**Design Doc:** `docs/plans/2026-02-14-edit-system-improvements-design.md`

---

### Task 1: Install Dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install cheerio and fastest-levenshtein**

Run:
```bash
npm install cheerio fastest-levenshtein
```

**Step 2: Verify installation**

Run:
```bash
node -e "require('cheerio'); require('fastest-levenshtein'); console.log('OK')"
```
Expected: `OK`

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "deps: add cheerio and fastest-levenshtein for edit improvements"
```

---

### Task 2: Update Types

**Files:**
- Modify: `src/lib/parser/edit-operations/types.ts`

**Step 1: Add new types for enhanced edit results and DOM operations**

Replace the entire file content with:

```typescript
// --- Search/Replace Types ---

export interface EditOperation {
  search: string;
  replace: string;
  expectedReplacements?: number;
}

export type MatchTier = 'exact' | 'whitespace' | 'token' | 'fuzzy';

export interface BestMatch {
  text: string;
  similarity: number;
  line: number;
}

export interface ApplySuccess {
  success: true;
  html: string;
  matchTiers: MatchTier[];
}

export interface ApplyPartial {
  success: 'partial';
  html: string;
  appliedCount: number;
  failedIndex: number;
  error: string;
  bestMatch: BestMatch | null;
  matchTiers: MatchTier[];
}

export interface ApplyFailure {
  success: false;
  html: string;
  error: string;
  bestMatch: BestMatch | null;
}

export type ApplyResult = ApplySuccess | ApplyPartial | ApplyFailure;

// --- DOM Operation Types ---

export type DomAction =
  | 'setAttribute'
  | 'setText'
  | 'setHTML'
  | 'addClass'
  | 'removeClass'
  | 'replaceClass'
  | 'remove'
  | 'insertAdjacentHTML';

export type InsertPosition = 'beforebegin' | 'afterbegin' | 'beforeend' | 'afterend';

export interface DomOperation {
  selector: string;
  action: DomAction;
  attr?: string;
  value?: string;
  oldClass?: string;
  newClass?: string;
  position?: InsertPosition;
}

export interface DomOpSuccess {
  index: number;
  success: true;
}

export interface DomOpFailure {
  index: number;
  success: false;
  error: string;
}

export type DomOpResult = DomOpSuccess | DomOpFailure;

// --- Legacy (keep for backward compat until removed) ---

export interface EditParseResult {
  operations: EditOperation[];
  explanation: string;
  isComplete: boolean;
  hasEditTag: boolean;
  targetFile: string;
}
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: May show existing errors but no new ones from types.ts

**Step 3: Commit**

```bash
git add src/lib/parser/edit-operations/types.ts
git commit -m "feat(types): add DOM operation and enhanced edit result types"
```

---

### Task 3: Implement 4-Tier Matching Engine

**Files:**
- Modify: `src/lib/parser/edit-operations/apply-edit-operations.ts`
- Modify: `src/lib/parser/edit-operations/find-original-position.ts` (no changes needed, kept as-is)

**Step 1: Rewrite apply-edit-operations.ts with 4-tier matching and partial success**

Replace the entire file with:

```typescript
import { distance } from 'fastest-levenshtein';
import { findOriginalPosition } from '@/lib/parser/edit-operations/find-original-position';
import type {
  ApplyResult,
  EditOperation,
  MatchTier,
  BestMatch,
} from '@/lib/parser/edit-operations/types';

const FUZZY_THRESHOLD = 0.85;

/**
 * Find the line number (1-indexed) for a character position in a string.
 */
function lineNumberAt(text: string, charIndex: number): number {
  let line = 1;
  for (let i = 0; i < charIndex && i < text.length; i++) {
    if (text[i] === '\n') line++;
  }
  return line;
}

/**
 * Tier 1: Exact substring match.
 */
function tryExactMatch(
  source: string,
  search: string,
  expectedCount: number,
): { index: number; length: number } | null {
  const firstIndex = source.indexOf(search);
  if (firstIndex === -1) return null;

  if (expectedCount === 1) {
    return { index: firstIndex, length: search.length };
  }

  // Count occurrences for expectedReplacements
  let count = 0;
  let pos = 0;
  while ((pos = source.indexOf(search, pos)) !== -1) {
    count++;
    pos += search.length;
  }
  if (count !== expectedCount) return null;
  return { index: firstIndex, length: search.length };
}

/**
 * Tier 2: Whitespace-tolerant match.
 * Collapses runs of whitespace in both source and search to single spaces.
 */
function tryWhitespaceMatch(
  source: string,
  search: string,
): { index: number; length: number } | null {
  const trimmed = search.trim();
  if (!trimmed) return null;

  const normalizedSource = source.replace(/\s+/g, ' ');
  const normalizedSearch = trimmed.replace(/\s+/g, ' ');
  const normalizedIndex = normalizedSource.indexOf(normalizedSearch);
  if (normalizedIndex === -1) return null;

  const actualStart = findOriginalPosition(source, normalizedIndex);
  const actualEnd = findOriginalPosition(source, normalizedIndex + normalizedSearch.length);
  if (actualStart === -1 || actualEnd === -1) return null;

  return { index: actualStart, length: actualEnd - actualStart };
}

/**
 * Tier 3: Token-based match.
 * Extracts word tokens (ignoring all whitespace), matches token sequences.
 */
function tryTokenMatch(
  source: string,
  search: string,
): { index: number; length: number } | null {
  const searchTokens = search.match(/\S+/g);
  if (!searchTokens || searchTokens.length === 0) return null;

  // Build a regex that matches the token sequence with flexible whitespace
  const escapedTokens = searchTokens.map((t) =>
    t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
  );
  const pattern = escapedTokens.join('\\s+');
  const regex = new RegExp(pattern);
  const match = regex.exec(source);
  if (!match) return null;

  return { index: match.index, length: match[0].length };
}

/**
 * Tier 4: Fuzzy Levenshtein sliding window match.
 * Slides a window across the source, scores each position by similarity.
 */
function tryFuzzyMatch(
  source: string,
  search: string,
): { index: number; length: number; similarity: number } | null {
  const searchLen = search.length;
  if (searchLen === 0 || source.length === 0) return null;

  // Use a window with some tolerance for length differences
  const minWindow = Math.floor(searchLen * 0.8);
  const maxWindow = Math.ceil(searchLen * 1.2);

  let bestScore = 0;
  let bestIndex = -1;
  let bestLength = 0;

  for (let windowSize = minWindow; windowSize <= maxWindow; windowSize++) {
    for (let i = 0; i <= source.length - windowSize; i++) {
      const candidate = source.slice(i, i + windowSize);
      const maxLen = Math.max(candidate.length, search.length);
      if (maxLen === 0) continue;
      const similarity = 1 - distance(candidate, search) / maxLen;
      if (similarity > bestScore) {
        bestScore = similarity;
        bestIndex = i;
        bestLength = windowSize;
      }
    }
  }

  if (bestScore >= FUZZY_THRESHOLD) {
    return { index: bestIndex, length: bestLength, similarity: bestScore };
  }
  return null;
}

/**
 * Find the best approximate match for error reporting, regardless of threshold.
 */
function findBestMatchForError(source: string, search: string): BestMatch | null {
  if (!search.trim() || !source) return null;

  const searchLen = search.length;
  const minWindow = Math.floor(searchLen * 0.8);
  const maxWindow = Math.ceil(searchLen * 1.2);

  let bestScore = 0;
  let bestIndex = -1;

  // Sample positions to avoid O(n*m) on huge files
  const step = Math.max(1, Math.floor(source.length / 500));
  for (let i = 0; i <= source.length - minWindow; i += step) {
    const candidate = source.slice(i, i + Math.min(maxWindow, source.length - i));
    const maxLen = Math.max(candidate.length, search.length);
    if (maxLen === 0) continue;
    const similarity = 1 - distance(candidate, search) / maxLen;
    if (similarity > bestScore) {
      bestScore = similarity;
      bestIndex = i;
    }
  }

  if (bestIndex === -1 || bestScore < 0.3) return null;

  const matchText = source.slice(bestIndex, bestIndex + maxWindow).split('\n').slice(0, 3).join('\n');
  return {
    text: matchText.length > 150 ? matchText.slice(0, 150) + '...' : matchText,
    similarity: Math.round(bestScore * 100) / 100,
    line: lineNumberAt(source, bestIndex),
  };
}

/**
 * Apply a single replacement handling expectedReplacements > 1.
 */
function applyReplacement(
  source: string,
  search: string,
  replace: string,
  matchResult: { index: number; length: number },
  expectedCount: number,
): string {
  if (expectedCount <= 1) {
    return source.slice(0, matchResult.index) + replace + source.slice(matchResult.index + matchResult.length);
  }

  // Replace all occurrences for expectedCount > 1
  // For exact matches, use split/join for simplicity
  return source.split(search).join(replace);
}

/**
 * Apply a sequence of edit operations with 4-tier matching and partial success.
 */
export function applyEditOperations(html: string, operations: EditOperation[]): ApplyResult {
  let result = html;
  const matchTiers: MatchTier[] = [];

  for (let index = 0; index < operations.length; index++) {
    const { search, replace, expectedReplacements } = operations[index];
    const expected = expectedReplacements ?? 1;

    if (!search) {
      if (index === 0) {
        return {
          success: false,
          html: result,
          error: `Operation ${index + 1}/${operations.length} failed: empty search string`,
          bestMatch: null,
        };
      }
      return {
        success: 'partial',
        html: result,
        appliedCount: index,
        failedIndex: index,
        error: `Operation ${index + 1}/${operations.length} failed: empty search string`,
        bestMatch: null,
        matchTiers,
      };
    }

    // Tier 1: Exact match
    const exactResult = tryExactMatch(result, search, expected);
    if (exactResult) {
      result = applyReplacement(result, search, replace, exactResult, expected);
      matchTiers.push('exact');
      continue;
    }

    // Tier 2: Whitespace-tolerant
    if (expected === 1) {
      const wsResult = tryWhitespaceMatch(result, search);
      if (wsResult) {
        result = result.slice(0, wsResult.index) + replace + result.slice(wsResult.index + wsResult.length);
        matchTiers.push('whitespace');
        continue;
      }
    }

    // Tier 3: Token-based
    if (expected === 1) {
      const tokenResult = tryTokenMatch(result, search);
      if (tokenResult) {
        result = result.slice(0, tokenResult.index) + replace + result.slice(tokenResult.index + tokenResult.length);
        matchTiers.push('token');
        continue;
      }
    }

    // Tier 4: Fuzzy Levenshtein
    if (expected === 1) {
      const fuzzyResult = tryFuzzyMatch(result, search);
      if (fuzzyResult) {
        result = result.slice(0, fuzzyResult.index) + replace + result.slice(fuzzyResult.index + fuzzyResult.length);
        matchTiers.push('fuzzy');
        continue;
      }
    }

    // All tiers failed
    const bestMatch = findBestMatchForError(result, search);
    const similarity = bestMatch ? ` (best match: ${Math.round(bestMatch.similarity * 100)}% similar at line ${bestMatch.line})` : '';

    if (index === 0) {
      return {
        success: false,
        html: result,
        error: `Operation ${index + 1}/${operations.length} failed: search text not found${similarity}`,
        bestMatch,
      };
    }

    return {
      success: 'partial',
      html: result,
      appliedCount: index,
      failedIndex: index,
      error: `Operation ${index + 1}/${operations.length} failed: search text not found${similarity}`,
      bestMatch,
      matchTiers,
    };
  }

  return { success: true, html: result, matchTiers };
}
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`

**Step 3: Commit**

```bash
git add src/lib/parser/edit-operations/apply-edit-operations.ts
git commit -m "feat(editFile): 4-tier matching chain with partial success and fuzzy fallback"
```

---

### Task 4: Implement DOM Operations Engine

**Files:**
- Create: `src/lib/parser/edit-operations/apply-dom-operations.ts`

**Step 1: Create the DOM operations engine using Cheerio**

```typescript
import * as cheerio from 'cheerio';
import type { DomOperation, DomOpResult } from '@/lib/parser/edit-operations/types';

/**
 * Apply an array of DOM operations to HTML using Cheerio.
 * Returns the modified HTML and per-operation results.
 * Applies all successful operations even if some fail (partial success).
 */
export function applyDomOperations(
  html: string,
  operations: DomOperation[],
): { html: string; results: DomOpResult[] } {
  const $ = cheerio.load(html, { decodeEntities: false });
  const results: DomOpResult[] = [];

  for (let i = 0; i < operations.length; i++) {
    const op = operations[i];
    try {
      const $el = $(op.selector);

      if ($el.length === 0) {
        // Provide helpful suggestions for failed selectors
        const tagName = op.selector.match(/^(\w+)/)?.[1];
        const similar = tagName
          ? $(tagName).toArray().map((el) => {
              const id = $(el).attr('id') ? `#${$(el).attr('id')}` : '';
              const cls = $(el).attr('class')
                ? `.${$(el).attr('class')!.split(/\s+/).slice(0, 2).join('.')}`
                : '';
              return `${tagName}${id}${cls}`;
            }).slice(0, 5)
          : [];
        const suggestion = similar.length > 0
          ? ` Similar elements: ${similar.join(', ')}`
          : '';
        results.push({
          index: i,
          success: false,
          error: `Selector "${op.selector}" matched 0 elements.${suggestion}`,
        });
        continue;
      }

      // For most actions, warn if selector matches multiple elements unexpectedly
      if ($el.length > 1 && op.action !== 'addClass' && op.action !== 'removeClass' && op.action !== 'replaceClass') {
        results.push({
          index: i,
          success: false,
          error: `Selector "${op.selector}" matched ${$el.length} elements. Use a more specific selector (add ID, class, or nth-child).`,
        });
        continue;
      }

      switch (op.action) {
        case 'setAttribute':
          if (!op.attr || op.value === undefined) {
            results.push({ index: i, success: false, error: 'setAttribute requires attr and value' });
            continue;
          }
          $el.attr(op.attr, op.value);
          break;

        case 'setText':
          if (op.value === undefined) {
            results.push({ index: i, success: false, error: 'setText requires value' });
            continue;
          }
          $el.text(op.value);
          break;

        case 'setHTML':
          if (op.value === undefined) {
            results.push({ index: i, success: false, error: 'setHTML requires value' });
            continue;
          }
          $el.html(op.value);
          break;

        case 'addClass':
          if (!op.value) {
            results.push({ index: i, success: false, error: 'addClass requires value' });
            continue;
          }
          $el.addClass(op.value);
          break;

        case 'removeClass':
          if (!op.value) {
            results.push({ index: i, success: false, error: 'removeClass requires value' });
            continue;
          }
          $el.removeClass(op.value);
          break;

        case 'replaceClass':
          if (!op.oldClass || !op.newClass) {
            results.push({ index: i, success: false, error: 'replaceClass requires oldClass and newClass' });
            continue;
          }
          $el.removeClass(op.oldClass).addClass(op.newClass);
          break;

        case 'remove':
          $el.remove();
          break;

        case 'insertAdjacentHTML':
          if (!op.position || op.value === undefined) {
            results.push({ index: i, success: false, error: 'insertAdjacentHTML requires position and value' });
            continue;
          }
          switch (op.position) {
            case 'beforebegin': $el.before(op.value); break;
            case 'afterbegin': $el.prepend(op.value); break;
            case 'beforeend': $el.append(op.value); break;
            case 'afterend': $el.after(op.value); break;
          }
          break;

        default:
          results.push({ index: i, success: false, error: `Unknown action: ${op.action}` });
          continue;
      }

      results.push({ index: i, success: true });
    } catch (err) {
      results.push({
        index: i,
        success: false,
        error: `Operation failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  return { html: $.html(), results };
}
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`

**Step 3: Commit**

```bash
git add src/lib/parser/edit-operations/apply-dom-operations.ts
git commit -m "feat(editDOM): Cheerio-based DOM operations engine"
```

---

### Task 5: Rewrite File Tools with All New Tools

**Files:**
- Modify: `src/lib/chat/tools/file-tools.ts`

**Step 1: Rewrite file-tools.ts with editDOM, enhanced editFile, editFiles, and existing writeFiles/readFile**

```typescript
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
  expectedReplacements: z.number().int().min(1).optional()
    .describe('Number of occurrences to replace. Default 1 (first match only). Set higher to replace multiple occurrences.'),
});

function availableFilesList(workingFiles: ProjectFiles): string {
  return Object.keys(workingFiles).join(', ') || 'none';
}

export function createFileTools(workingFiles: ProjectFiles) {
  const editFileMistakes: MistakeTracker = new Map();

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
            error: `File "${file}" not found. Available files: ${availableFilesList(workingFiles)}. Use writeFiles to create it.`,
          };
        }

        const { html, results } = applyDomOperations(source, operations as DomOperation[]);
        const failures = results.filter((r) => !r.success);

        if (failures.length === 0) {
          workingFiles[file] = html;
          return { success: true as const, file, content: html };
        }

        if (failures.length < operations.length) {
          // Partial success — DOM operations that succeeded are already in html
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

    editFile: tool({
      description:
        'Apply targeted search/replace edits to an existing file. Uses multi-tier matching: exact → whitespace-tolerant → token-based → fuzzy. Batch multiple changes into one call using the operations array. Returns { success, file, content, matchTiers } on success. On partial failure returns applied changes + error details with the closest match found. If editFile fails twice on the same file, use writeFiles instead.',
      inputSchema: z.object({
        file: z.string().describe('The filename to edit, e.g. "index.html" or "about.html"'),
        operations: z.array(replaceOperationSchema)
          .describe('Ordered list of search/replace operations to apply sequentially'),
      }),
      execute: async ({ file, operations }) => {
        const source = workingFiles[file];
        if (!source) {
          return {
            success: false as const,
            error: `File "${file}" not found. Available files: ${availableFilesList(workingFiles)}. Use writeFiles to create it.`,
          };
        }

        const result = applyEditOperations(source, operations as EditOperation[]);

        if (result.success === true) {
          workingFiles[file] = result.html;
          editFileMistakes.delete(file);
          return { success: true as const, file, content: result.html, matchTiers: result.matchTiers };
        }

        if (result.success === 'partial') {
          workingFiles[file] = result.html;
          const count = (editFileMistakes.get(file) ?? 0) + 1;
          editFileMistakes.set(file, count);
          const escalation = count >= 2 ? ' This is the 2nd consecutive failure on this file — consider using writeFiles for a complete replacement.' : '';
          return {
            success: 'partial' as const,
            file,
            content: result.html,
            appliedCount: result.appliedCount,
            failedIndex: result.failedIndex,
            matchTiers: result.matchTiers,
            error: `${result.error}${escalation}`,
            bestMatch: result.bestMatch,
          };
        }

        // Full failure
        const count = (editFileMistakes.get(file) ?? 0) + 1;
        editFileMistakes.set(file, count);
        const escalation = count >= 2 ? ' This is the 2nd consecutive failure on this file — consider using writeFiles for a complete replacement.' : '';
        return {
          success: false as const,
          error: `${result.error}${escalation}`,
          bestMatch: result.bestMatch,
        };
      },
    }),

    editFiles: tool({
      description:
        'Batch edit multiple files in a single call. Each file can use DOM operations (CSS selectors) and/or search/replace operations. Use when the same or similar change applies to 2+ files (nav links, headers, branding). Atomicity is per-file: a failed file does not block successful ones.',
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
          failedIndex?: number;
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
          if (fileSuccess !== false && edit.replaceOperations && edit.replaceOperations.length > 0) {
            const replaceResult = applyEditOperations(currentHtml, edit.replaceOperations as EditOperation[]);
            currentHtml = replaceResult.html;
            if (replaceResult.success === 'partial') {
              fileSuccess = 'partial';
              fileError = [fileError, replaceResult.error].filter(Boolean).join('; ');
            } else if (replaceResult.success === false) {
              fileSuccess = edit.domOperations?.length ? 'partial' : false;
              fileError = [fileError, replaceResult.error].filter(Boolean).join('; ');
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
        'Read the current contents of a file. Returns { success, file, content, length }. Use before editFile to see exact whitespace/indentation for accurate search strings, or after edits to verify changes.',
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
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`

**Step 3: Commit**

```bash
git add src/lib/chat/tools/file-tools.ts
git commit -m "feat(tools): add editDOM and editFiles tools, enhance editFile with fuzzy matching"
```

---

### Task 6: Update useHtmlParser for New Tool Output Shapes

**Files:**
- Modify: `src/hooks/useHtmlParser.ts`

**Step 1: Update extractFilesFromToolParts to handle new tool outputs**

The new tools return different shapes:
- `editDOM`: `{ success, file, content }` (same as editFile) or `{ success: "partial", file, content, ... }`
- `editFiles`: `{ success, results: [{ file, success, content }] }`
- `editFile` enhanced: now can return `success: "partial"` with content

Modify the `extractFilesFromToolParts` function in `src/hooks/useHtmlParser.ts`. Replace lines 26-57:

```typescript
function extractFilesFromToolParts(
  parts: UIMessage['parts'],
  baseFiles: ProjectFiles,
): { files: ProjectFiles | null; hasToolActivity: boolean } {
  let files: ProjectFiles | null = null;
  let hasToolActivity = false;

  for (const part of parts) {
    if (!isToolPart(part)) continue;

    hasToolActivity = true;

    // Only extract from completed tool outputs
    if (part.state !== 'output-available' || !part.output) continue;

    const output = part.output as Record<string, unknown>;

    // Skip complete failures (no content to extract)
    if (output.success === false) continue;

    if (!files) files = { ...baseFiles };

    // writeFiles output: { success: true, files: Record<string, string> }
    if ('files' in output && typeof output.files === 'object' && output.files !== null) {
      Object.assign(files, output.files as Record<string, string>);
    }
    // editFile/editDOM output: { success: true|"partial", file: string, content: string }
    else if ('file' in output && 'content' in output) {
      files[output.file as string] = output.content as string;
    }
    // editFiles output: { success: true|"partial", results: [{ file, success, content }] }
    else if ('results' in output && Array.isArray(output.results)) {
      for (const result of output.results as Array<Record<string, unknown>>) {
        if (result.success !== false && result.content && result.file) {
          files[result.file as string] = result.content as string;
        }
      }
    }
  }

  return { files, hasToolActivity };
}
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`

**Step 3: Commit**

```bash
git add src/hooks/useHtmlParser.ts
git commit -m "feat(parser): handle editDOM, editFiles, and partial success tool outputs"
```

---

### Task 7: Update System Prompts

**Files:**
- Modify: `src/lib/prompts/sections/tool-output-format.ts`
- Modify: `src/lib/prompts/sections/context-blocks.ts`

**Step 1: Update tool-output-format.ts with new tool selection and workflows**

Replace the entire `TOOL_OUTPUT_FORMAT_SECTION` export:

```typescript
export const TOOL_OUTPUT_FORMAT_SECTION = `<tool_output_format>
You have 11 tools across 5 categories: file (writeFiles, editDOM, editFile, editFiles, readFile), resource (searchImages, searchIcons, generateColorPalette), web (fetchUrl, webSearch), and validation (validateHtml). Call multiple independent tools in the same step when possible.

<tool_selection>
File editing — choose the right tool:
- editDOM (preferred for targeted changes): change text, images, links, colors, classes, attributes. Remove or hide elements. Add elements adjacent to existing ones. Uses CSS selectors to target elements precisely — never fails on whitespace mismatches.
- editFile (for structural/block changes): add new HTML sections or blocks of code. Rearrange or reorder sections. Complex changes spanning multiple nested elements. Changes where CSS selectors can't isolate the target. Uses multi-tier matching (exact → whitespace → token → fuzzy).
- editFiles (for cross-page changes): same change needed on 2+ files (nav links, headers, footers, branding). Combines DOM and search/replace operations in one call. Each file can use DOM operations, replace operations, or both.
- writeFiles: new files, complete redesigns, structural overhauls, or when editFile fails twice on the same file. Include ONLY files being created or fully rewritten — unchanged files are preserved automatically.
- readFile: inspect a file before editing to get exact content for accurate search strings. Use for complex multi-step edits.

When to call webSearch:
- User mentions a specific business, brand, or real-world entity you need facts about
- Request requires current embed codes (Google Maps, YouTube, social media widgets)
- Industry-specific terminology, pricing, or data you're unsure about
- Do NOT search for: basic HTML/CSS patterns, common design layouts, Tailwind classes
</tool_selection>

<tool_workflows>
NEW SITE (first generation):
1. generateColorPalette → get design system colors
2. searchImages + searchIcons (parallel — all image/icon needs in this step)
3. writeFiles → generate HTML using all gathered resources
4. validateHtml → check for errors
5. editDOM or editFile → fix any errors found

EDIT (existing site — small change):
1. editDOM → apply change using CSS selectors (preferred for text/image/color/class changes)
2. validateHtml → verify correctness

EDIT (existing site — structural change):
1. readFile (if unsure about current file state)
2. searchImages/searchIcons (if adding new visual elements)
3. editFile → apply changes (batch all operations in one call)
4. validateHtml → verify correctness
5. editFile → fix any errors found

EDIT (cross-page change):
1. editFiles → batch all changes across files in one call
2. validateHtml → verify correctness

EXTERNAL CONTENT:
1. webSearch → find sources/embed codes
2. fetchUrl → get full content from a result URL if snippets insufficient
3. writeFiles or editFile → integrate content into HTML

Call multiple independent tools in the same step when possible (e.g. searchImages + searchIcons together). This is faster and saves steps.
</tool_workflows>

<tool_error_handling>
If a tool returns success: false, use these fallbacks:
- searchImages failed → use https://placehold.co/800x400/eee/999?text=Image placeholder, continue generating
- searchIcons failed → use a simple inline SVG or Unicode symbol instead
- generateColorPalette failed → pick colors manually, define in :root
- editDOM failed (selector not found) → check the error for similar element suggestions, retry with corrected selector. If still fails, try editFile with search/replace instead.
- editFile failed (search text not found) → check bestMatch in error for closest match. If partial success, retry just the failed operations. After 2 failures on same file, use writeFiles.
- editFiles partially failed → check per-file results, retry failed files individually
- webSearch failed → proceed using your own knowledge
- fetchUrl failed → use the search result snippets instead
- validateHtml failed → file likely doesn't exist yet, generate with writeFiles first

Never let a tool failure halt generation. Always have a fallback path.
</tool_error_handling>

<tool_rules>
- Each HTML file must be a complete standalone document with its own <head>, Tailwind CDN, fonts, and design system
- Never split CSS/JS into separate files unless the user explicitly asks
- Never add pages unless the user explicitly asks
- Inter-page links: use plain relative filenames (href="about.html")
- For colors: use generateColorPalette first, then apply returned values to :root CSS custom properties
- For images: use DIFFERENT search queries per image to ensure variety. Choose orientation: landscape (heroes/banners), portrait (people/cards), square (avatars/thumbnails)
- Call validateHtml after writeFiles, editDOM, or editFile to catch syntax errors before finishing
- Before calling a tool, explain what you'll build/change in 2-3 sentences max
- After tool calls complete, add a 1-sentence summary of what was delivered
</tool_rules>
</tool_output_format>`;
```

**Step 2: Update edit_guidance in context-blocks.ts**

In `src/lib/prompts/sections/context-blocks.ts`, update the `buildEditModeBlock` function (lines 13-22). Replace:

```typescript
export function buildEditModeBlock(currentFiles?: ProjectFiles): string {
  if (!currentFiles?.['index.html']) return '';

  return `\n<edit_guidance>
Modify the existing HTML based on the user's request.
Do NOT start from scratch unless the user explicitly asks for a redesign.
Do NOT add pages unless the user explicitly asks.
When adding a page: use editDOM or editFile to add nav links to existing pages, then writeFiles for the new page only.
For small changes (text, images, colors, classes): prefer editDOM with CSS selectors.
For structural changes (new sections, rearranging layout): use editFile with search/replace.
For cross-page changes (nav, header, branding): use editFiles to batch all file edits in one call.
</edit_guidance>`;
}
```

**Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`

**Step 4: Commit**

```bash
git add src/lib/prompts/sections/tool-output-format.ts src/lib/prompts/sections/context-blocks.ts
git commit -m "feat(prompts): update tool selection guidance for editDOM, editFiles, and enhanced editFile"
```

---

### Task 8: Update Tool Count in tools/index.ts

**Files:**
- Modify: `src/lib/chat/tools/index.ts`

**Step 1: No code changes needed**

The `createFileTools` function already spreads all tools from file-tools.ts. Since we added `editDOM` and `editFiles` to the same return object, they're automatically included via `...createFileTools(workingFiles)`.

Verify by checking the existing code — no modification required.

**Step 2: Verify the dev server starts**

Run: `npm run dev`
Expected: Server starts without errors on localhost:3000

**Step 3: Commit (skip if no changes)**

---

### Task 9: Manual Smoke Test

**No files to modify — this is a verification task.**

**Step 1: Start dev server**

Run: `npm run dev`

**Step 2: Test editDOM — create a site, then ask for a small edit**

1. Create a new conversation
2. Prompt: "Create a landing page for a coffee shop called Bean & Brew"
3. Wait for generation to complete
4. Prompt: "Change the main heading to Welcome to Bean & Brew Cafe"
5. Verify: AI uses `editDOM` with `setText` action
6. Verify: Preview updates correctly

**Step 3: Test editFile — ask for a structural change**

1. In same conversation, prompt: "Add a new testimonials section after the menu section with 3 customer quotes"
2. Verify: AI uses `editFile` (search/replace for structural addition)
3. Verify: Preview shows new section

**Step 4: Test editFiles — multi-page edit**

1. Prompt: "Add an About page"
2. Then: "Update the navigation on both pages to include links to each other"
3. Verify: AI uses `editFiles` to batch nav changes across both files

**Step 5: Test fallback chain**

1. Prompt: "Change the background color of the hero section to dark blue"
2. Verify: If AI uses editDOM → works via replaceClass
3. If editFile → verify fuzzy matching handles any whitespace differences

**Step 6: Commit any final fixes**

```bash
git add -A
git commit -m "fix: address smoke test findings"
```

---

### Task 10: Clean Up Dead Code

**Files:**
- Delete or verify unused: `src/lib/parser/edit-operations/edit-stream-extractor.ts`
- Delete or verify unused: `src/lib/parser/assistant-stream-parser.ts`

**Step 1: Verify edit-stream-extractor.ts is unused**

Run: `grep -r "edit-stream-extractor\|EditStreamExtractor" src/ --include="*.ts" --include="*.tsx"`
Expected: No imports found (only the file itself)

**Step 2: Verify assistant-stream-parser.ts is unused**

Run: `grep -r "assistant-stream-parser\|assistantStreamParser" src/ --include="*.ts" --include="*.tsx"`
Expected: No imports found (or only backward-compat stubs)

**Step 3: Delete confirmed dead code**

```bash
rm src/lib/parser/edit-operations/edit-stream-extractor.ts
# Only if confirmed unused:
# rm src/lib/parser/assistant-stream-parser.ts
```

**Step 4: Final build verification**

Run: `npm run build`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove dead code (legacy XML edit stream extractor)"
```
