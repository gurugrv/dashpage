# Block-Based Editing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace CSS-selector-based editing with block-ID-based editing, add shared component extraction, and unify tool sets across single/multi-page modes.

**Architecture:** AI generates `data-block` attributes on semantic sections. New `editBlock` tool targets blocks by ID (primary) or CSS selector (fallback). Shared nav/footer auto-extracted to `_components/` files after first multi-page generation, injected at preview/download time. Single-page tool set eliminated — one unified tool set always.

**Tech Stack:** Next.js API routes, Vercel AI SDK, Cheerio (DOM ops), Zod (tool schemas), existing ProjectFiles type

---

### Task 1: Create `editBlock` Tool

**Files:**
- Create: `src/lib/chat/tools/block-tools.ts`
- Modify: `src/lib/chat/tools/index.ts:1-43`
- Modify: `src/lib/chat/tools/file-tools.ts` (remove editDOM export from `createEditDomTool`)

**Step 1: Create `src/lib/chat/tools/block-tools.ts`**

This is the core new tool. Uses Cheerio to target `[data-block="X"]` or CSS selectors. Returns `{ success, file, content }` matching the existing editDOM output shape (so useHtmlParser extraction at `src/hooks/useHtmlParser.ts:144-151` works without changes).

```typescript
import { tool } from 'ai';
import { z } from 'zod';
import * as cheerio from 'cheerio';
import type { ProjectFiles } from '@/types';

function availableFilesList(workingFiles: ProjectFiles): string {
  return Object.keys(workingFiles).join(', ') || 'none';
}

function availableBlocks($: cheerio.CheerioAPI): string {
  const blocks: string[] = [];
  $('[data-block]').each((_, el) => {
    blocks.push($(el).attr('data-block')!);
  });
  return blocks.length > 0 ? blocks.join(', ') : 'none (no data-block attributes found)';
}

// Check if a blockId matches a known component name
function isComponentBlock(blockId: string, workingFiles: ProjectFiles): string | null {
  for (const filename of Object.keys(workingFiles)) {
    if (!filename.startsWith('_components/')) continue;
    const componentName = filename.replace('_components/', '').replace('.html', '');
    if (componentName === blockId) return filename;
  }
  return null;
}

export function createBlockTools(workingFiles: ProjectFiles) {
  return {
    editBlock: tool({
      description:
        'Edit HTML by targeting a data-block ID (preferred) or CSS selector (fallback). ' +
        'Block IDs guarantee unique matches. For shared components (nav, footer), edit the file in _components/. ' +
        'Returns { success, file, content } on success.',
      inputSchema: z.object({
        file: z.string().describe('The filename to edit, e.g. "index.html" or "_components/main-nav.html"'),
        blockId: z.string().optional()
          .describe('Target a [data-block="X"] element. Mutually exclusive with selector.'),
        selector: z.string().optional()
          .describe('CSS selector for fine-grained targeting within a block. Mutually exclusive with blockId.'),
        action: z.enum([
          'replace', 'replaceInner', 'setText', 'setAttribute',
          'addClass', 'removeClass', 'remove',
          'insertBefore', 'insertAfter',
        ]).describe('The edit operation to perform'),
        content: z.string().optional()
          .describe('New HTML content (for replace, replaceInner, insertBefore, insertAfter)'),
        value: z.string().optional()
          .describe('New value (for setText, setAttribute)'),
        attr: z.string().optional()
          .describe('Attribute name (for setAttribute)'),
        className: z.string().optional()
          .describe('Class name (for addClass, removeClass)'),
      }),
      execute: async ({ file: rawFile, blockId, selector, action, content, value, attr, className }) => {
        const file = rawFile.replace(/^['"](.+)['"]$/, '$1');
        const source = workingFiles[file];

        if (!source) {
          // Check if targeting a component block in a page file
          if (blockId) {
            const componentFile = isComponentBlock(blockId, workingFiles);
            if (componentFile) {
              return {
                success: false as const,
                error: `Block "${blockId}" is a shared component. Edit "${componentFile}" instead — changes will apply to all pages.`,
              };
            }
          }
          return {
            success: false as const,
            error: `File "${file}" not found. Available files: ${availableFilesList(workingFiles)}`,
          };
        }

        // Validate: exactly one targeting mode
        if (blockId && selector) {
          return {
            success: false as const,
            error: 'Provide either blockId OR selector, not both.',
          };
        }
        if (!blockId && !selector) {
          return {
            success: false as const,
            error: 'Provide either blockId or selector to target an element.',
          };
        }

        const $ = cheerio.load(source, { decodeEntities: false });
        const cssSelector = blockId ? `[data-block="${blockId}"]` : selector!;
        const matched = $(cssSelector);

        if (matched.length === 0) {
          const blocks = availableBlocks($);
          // If blockId not found, check if it's a component
          if (blockId) {
            const componentFile = isComponentBlock(blockId, workingFiles);
            if (componentFile) {
              return {
                success: false as const,
                error: `Block "${blockId}" not found in "${file}". This is a shared component — edit "${componentFile}" instead.`,
              };
            }
          }
          return {
            success: false as const,
            error: `${blockId ? `Block "${blockId}"` : `Selector "${selector}"`} not found in "${file}". Available blocks: ${blocks}`,
          };
        }

        // Content-modifying actions require single element match (when using selector mode)
        const contentActions = ['replace', 'replaceInner', 'setText', 'insertBefore', 'insertAfter'];
        if (selector && contentActions.includes(action) && matched.length > 1) {
          return {
            success: false as const,
            error: `Selector "${selector}" matched ${matched.length} elements. ${action} requires exactly 1 match. Use a more specific selector.`,
          };
        }

        try {
          switch (action) {
            case 'replace': {
              if (!content) return { success: false as const, error: 'replace action requires "content" parameter.' };
              // If replacing a block, ensure data-block is preserved on new content
              if (blockId) {
                const $new = cheerio.load(content, { decodeEntities: false });
                const newRoot = $new('body').children().first();
                if (newRoot.length > 0 && !newRoot.attr('data-block')) {
                  newRoot.attr('data-block', blockId);
                  matched.replaceWith($new('body').html()!);
                } else {
                  matched.replaceWith(content);
                }
              } else {
                matched.replaceWith(content);
              }
              break;
            }
            case 'replaceInner':
              if (!content) return { success: false as const, error: 'replaceInner action requires "content" parameter.' };
              matched.html(content);
              break;
            case 'setText':
              if (value === undefined) return { success: false as const, error: 'setText action requires "value" parameter.' };
              matched.text(value);
              break;
            case 'setAttribute':
              if (!attr || value === undefined) return { success: false as const, error: 'setAttribute requires "attr" and "value" parameters.' };
              matched.attr(attr, value);
              break;
            case 'addClass':
              if (!className) return { success: false as const, error: 'addClass requires "className" parameter.' };
              matched.addClass(className);
              break;
            case 'removeClass':
              if (!className) return { success: false as const, error: 'removeClass requires "className" parameter.' };
              matched.removeClass(className);
              break;
            case 'remove':
              matched.remove();
              break;
            case 'insertBefore':
              if (!content) return { success: false as const, error: 'insertBefore requires "content" parameter.' };
              matched.before(content);
              break;
            case 'insertAfter':
              if (!content) return { success: false as const, error: 'insertAfter requires "content" parameter.' };
              matched.after(content);
              break;
          }

          const newHtml = $.html();
          workingFiles[file] = newHtml;
          return { success: true as const, file, content: newHtml };
        } catch (err) {
          return {
            success: false as const,
            error: `editBlock failed: ${err instanceof Error ? err.message : String(err)}`,
          };
        }
      },
    }),
  };
}
```

**Step 2: Update `src/lib/chat/tools/index.ts`**

Replace the two tool set functions with one unified function:

```typescript
import type { ToolSet } from 'ai';
import type { ProjectFiles } from '@/types';
import { createFileTools } from './file-tools';
import { createBlockTools } from './block-tools';
import { createImageTools } from './image-tools';
import { createIconTools } from './icon-tools';
import { createWebTools } from './web-tools';
import { createSearchTools } from './search-tools';

export function createWebsiteTools(currentFiles: ProjectFiles): { tools: ToolSet; workingFiles: ProjectFiles } {
  const workingFiles: ProjectFiles = { ...currentFiles };

  return {
    tools: {
      ...createFileTools(workingFiles),
      ...createBlockTools(workingFiles),
      ...createImageTools(),
      ...createIconTools(),
      ...createWebTools(),
      ...createSearchTools(),
    },
    workingFiles,
  };
}
```

Key changes:
- Remove `createSinglePageTools` export entirely
- Remove `createEditDomTool` import (editDOM is gone)
- Add `createBlockTools` import

**Step 3: Remove `createEditDomTool` from `file-tools.ts`**

In `src/lib/chat/tools/file-tools.ts`:
- Delete the `createEditDomTool` function (lines 40-85)
- Remove `...createEditDomTool(workingFiles)` from `createFileTools` return (line 250)
- Remove `domOperations` from `editFiles` tool schema (lines 258-259, 292-301) — editFiles becomes search/replace only
- Keep the `domOperationSchema` temporarily if editFiles still references it, otherwise delete it too

The `editFiles` tool simplifies to search/replace only:
- Remove `domOperations` from its input schema
- Remove Phase 1 (DOM operations) from execute function (lines 292-301)
- Keep Phase 2 (search/replace) unchanged

**Step 4: Update chat route tool selection**

In `src/app/api/chat/route.ts:257-263`, replace:

```typescript
const fileCount = Object.keys(currentFiles ?? {}).length;
const isSinglePageEdit = fileCount === 1;
const { tools } = isSinglePageEdit
  ? createSinglePageTools(currentFiles ?? {})
  : createWebsiteTools(currentFiles ?? {});
```

With:

```typescript
const fileCount = Object.keys(currentFiles ?? {}).length;
const { tools } = createWebsiteTools(currentFiles ?? {});
```

Remove `createSinglePageTools` from the import at line 5.

Also update `buildContinuePrompt` (line 41-44) — remove `isSinglePage` parameter since the distinction is gone. Always use the multi-page continue prompt.

Update auto-continue logic (line 533): remove `hasTextHtml` check since text HTML output is no longer a workflow.

**Step 5: Commit**

```bash
git add src/lib/chat/tools/block-tools.ts src/lib/chat/tools/index.ts src/lib/chat/tools/file-tools.ts src/app/api/chat/route.ts
git commit -m "feat: add editBlock tool, unify tool sets, remove editDOM"
```

---

### Task 2: Post-Generation Pipeline (Block Validation + Component Extraction)

**Files:**
- Create: `src/lib/blocks/validate-blocks.ts`
- Create: `src/lib/blocks/extract-components.ts`

**Step 1: Create `src/lib/blocks/validate-blocks.ts`**

Parses HTML files, ensures all top-level semantic elements have `data-block` attributes.

```typescript
import * as cheerio from 'cheerio';
import type { ProjectFiles } from '@/types';

const SEMANTIC_TAGS = new Set(['nav', 'header', 'main', 'section', 'footer', 'aside']);

/**
 * Ensure all top-level semantic elements in HTML files have data-block attributes.
 * Auto-assigns IDs based on tag + position for elements that lack them.
 * Mutates the files in place.
 * Returns list of auto-assigned block IDs for logging.
 */
export function validateBlocks(files: ProjectFiles): string[] {
  const autoAssigned: string[] = [];

  for (const [filename, content] of Object.entries(files)) {
    if (!filename.endsWith('.html') || filename.startsWith('_components/')) continue;

    const $ = cheerio.load(content, { decodeEntities: false });
    const usedIds = new Set<string>();

    // Collect existing block IDs
    $('[data-block]').each((_, el) => {
      usedIds.add($(el).attr('data-block')!);
    });

    // Find top-level semantic elements without data-block
    // "Top-level" = direct children of body, or one level deep (inside a wrapper div)
    const candidates = $('body').find(
      [...SEMANTIC_TAGS].map(tag => tag).join(',')
    );

    const tagCounters = new Map<string, number>();

    candidates.each((_, el) => {
      const $el = $(el);
      if ($el.attr('data-block')) return; // already has one

      const tag = el.tagName?.toLowerCase() ?? 'section';
      if (!SEMANTIC_TAGS.has(tag)) return;

      // Generate ID: tag name, or tag-N if tag already used
      const count = (tagCounters.get(tag) ?? 0) + 1;
      tagCounters.set(tag, count);

      let id = tag;
      if (usedIds.has(id)) {
        id = `${tag}-${count}`;
      }
      // Handle remaining collisions
      while (usedIds.has(id)) {
        id = `${tag}-${count + 1}`;
        tagCounters.set(tag, count + 1);
      }

      $el.attr('data-block', id);
      usedIds.add(id);
      autoAssigned.push(`${filename}: ${tag} → ${id}`);
    });

    if (autoAssigned.length > 0) {
      files[filename] = $.html();
    }
  }

  return autoAssigned;
}
```

**Step 2: Create `src/lib/blocks/extract-components.ts`**

Detects duplicate nav/footer across pages, extracts to `_components/`.

```typescript
import * as cheerio from 'cheerio';
import type { ProjectFiles } from '@/types';

interface ExtractedComponent {
  blockId: string;
  filename: string; // e.g. "_components/main-nav.html"
  content: string;
}

/**
 * Normalize HTML for similarity comparison: collapse whitespace, remove comments.
 */
function normalizeForComparison(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calculate similarity between two strings (0-1).
 * Simple approach: normalized exact match or length-based heuristic.
 */
function similarity(a: string, b: string): number {
  if (a === b) return 1;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;

  // Use character-level comparison for reasonable-length strings
  let matches = 0;
  const minLen = Math.min(a.length, b.length);
  for (let i = 0; i < minLen; i++) {
    if (a[i] === b[i]) matches++;
  }
  return matches / maxLen;
}

/**
 * Detect duplicate nav/footer blocks across pages and extract to _components/.
 * Only runs when: 2+ pages, no _components/ files exist yet.
 * Mutates files in place: adds _components/ entries, replaces inline content with placeholders.
 * Returns list of extracted components.
 */
export function extractComponents(files: ProjectFiles): ExtractedComponent[] {
  const pageFiles = Object.keys(files).filter(
    f => f.endsWith('.html') && !f.startsWith('_components/')
  );

  // Only extract when 2+ pages and no components yet
  if (pageFiles.length < 2) return [];
  if (Object.keys(files).some(f => f.startsWith('_components/'))) return [];

  const extracted: ExtractedComponent[] = [];

  // Candidate tags for component extraction
  const componentTags = ['nav', 'footer'];

  for (const tag of componentTags) {
    // Collect the outerHTML of this tag from each page, keyed by data-block ID
    const blocksByPage: Array<{ page: string; blockId: string; outerHtml: string; normalized: string }> = [];

    for (const page of pageFiles) {
      const $ = cheerio.load(files[page], { decodeEntities: false });
      const el = $(tag).first();
      if (el.length === 0) continue;

      const blockId = el.attr('data-block');
      if (!blockId) continue; // validateBlocks should have assigned one

      const outerHtml = $.html(el);
      blocksByPage.push({
        page,
        blockId,
        outerHtml,
        normalized: normalizeForComparison(outerHtml),
      });
    }

    // Need the element on all (or most) pages to qualify as shared
    if (blocksByPage.length < 2) continue;

    // Check similarity: compare all against the first page's version
    const reference = blocksByPage[0];
    const allSimilar = blocksByPage.every(
      b => similarity(reference.normalized, b.normalized) >= 0.9
    );

    if (!allSimilar) continue;

    // All pages have similar content for this tag — extract it
    const blockId = reference.blockId;
    const componentFilename = `_components/${blockId}.html`;

    // Use the first page's version as the canonical component
    extracted.push({
      blockId,
      filename: componentFilename,
      content: reference.outerHtml,
    });

    // Add component file
    files[componentFilename] = reference.outerHtml;

    // Replace inline content with placeholder in each page
    for (const entry of blocksByPage) {
      const $ = cheerio.load(files[entry.page], { decodeEntities: false });
      const el = $(`[data-block="${entry.blockId}"]`);
      if (el.length > 0) {
        el.replaceWith(`<!-- @component:${blockId} -->`);
        files[entry.page] = $.html();
      }
    }
  }

  return extracted;
}
```

**Step 3: Commit**

```bash
git add src/lib/blocks/validate-blocks.ts src/lib/blocks/extract-components.ts
git commit -m "feat: add post-generation block validation and component extraction"
```

---

### Task 3: Integrate Post-Generation Pipeline into Chat Route

**Files:**
- Modify: `src/app/api/chat/route.ts` (onFinish area, around line 566+)

**Step 1: Add post-generation processing**

After the streaming loop completes and before final persistence, run the block pipeline on workingFiles. The chat route already has access to `workingFiles` via the tool creation.

First, restructure tool creation to capture workingFiles reference:

At `src/app/api/chat/route.ts:257-263`, change to:

```typescript
const fileCount = Object.keys(currentFiles ?? {}).length;
const { tools, workingFiles } = createWebsiteTools(currentFiles ?? {});
```

Then after the streaming loop (after `debugSession.finish('complete')` around line 567), add:

```typescript
// Post-generation: validate blocks and extract components
import { validateBlocks } from '@/lib/blocks/validate-blocks';
import { extractComponents } from '@/lib/blocks/extract-components';

// Run on workingFiles (which now contain all AI tool outputs)
// Only process if we have files to work with
const outputFiles = { ...workingFiles };
if (Object.keys(outputFiles).some(f => f.endsWith('.html'))) {
  validateBlocks(outputFiles);
  extractComponents(outputFiles);
  // workingFiles is what gets sent to the client via tool outputs,
  // but we need to emit the post-processed files too.
  // Write updated files as a final data event on the stream.
  Object.assign(workingFiles, outputFiles);
}
```

Note: The imports go at the top of the file. The actual integration point depends on how workingFiles flows to the client. The key constraint is:
- Tool outputs are already streamed to the client during generation
- Post-processing happens AFTER generation
- The client needs the post-processed files

The cleanest approach: emit a custom stream event with the post-processed files, and have the client apply it. Or: the post-processed files are what gets persisted as `htmlArtifact`, and the client uses that on next load.

**Step 2: Emit post-processed files via stream**

After the pipeline runs, write a custom data event:

```typescript
if (autoAssigned.length > 0 || extracted.length > 0) {
  writer.write({
    type: 'data',
    data: JSON.stringify({
      type: 'post-processed-files',
      files: outputFiles,
    }),
  });
}
```

The client (`useHtmlParser` or Builder) listens for this event and updates `currentFiles`.

**Step 3: Commit**

```bash
git add src/app/api/chat/route.ts
git commit -m "feat: integrate block validation and component extraction into chat route"
```

---

### Task 4: Update Preview System (Component Injection)

**Files:**
- Modify: `src/lib/preview/combine-files.ts:8-16` (`getHtmlPages`)
- Modify: `src/lib/preview/combine-files.ts:25-166` (`combineForPreview`)
- Modify: `src/components/PreviewPanel.tsx:66-97` (`handleDownload`)

**Step 1: Update `getHtmlPages` to exclude components**

In `src/lib/preview/combine-files.ts:8-16`:

```typescript
export function getHtmlPages(files: ProjectFiles): string[] {
  const pages = Object.keys(files).filter(
    f => f.endsWith('.html') && !f.startsWith('_components/')
  );
  pages.sort((a, b) => {
    if (a === 'index.html') return -1;
    if (b === 'index.html') return 1;
    return a.localeCompare(b);
  });
  return pages;
}
```

**Step 2: Add component injection to `combineForPreview`**

At the start of `combineForPreview`, after getting the raw HTML (line 26-27), add component injection before any other processing:

```typescript
export function combineForPreview(files: ProjectFiles, activePage = 'index.html'): string {
  let raw = files[activePage];
  if (!raw) return '';

  // Inject shared components: replace <!-- @component:X --> with _components/X.html content
  for (const [filename, content] of Object.entries(files)) {
    if (!filename.startsWith('_components/')) continue;
    const componentName = filename.replace('_components/', '').replace('.html', '');
    raw = raw.replace(`<!-- @component:${componentName} -->`, content);
  }

  const html = sanitizeFontsInHtml(raw);
  // ... rest of function unchanged
```

**Step 3: Update `handleDownload` to bake components in**

In `src/components/PreviewPanel.tsx:66-97`, before creating the zip/blob, process files to inject components:

```typescript
const handleDownload = useCallback(async () => {
  const activeFiles = files['index.html'] ? files : lastValidFiles;
  if (!activeFiles['index.html']) return;

  // Bake components into page files for download
  const downloadFiles: ProjectFiles = {};
  for (const [filename, content] of Object.entries(activeFiles)) {
    if (filename.startsWith('_components/')) continue; // skip component files
    let processed = content;
    // Inject components
    for (const [compFile, compContent] of Object.entries(activeFiles)) {
      if (!compFile.startsWith('_components/')) continue;
      const compName = compFile.replace('_components/', '').replace('.html', '');
      processed = processed.replace(`<!-- @component:${compName} -->`, compContent);
    }
    downloadFiles[filename] = processed;
  }

  const fileKeys = Object.keys(downloadFiles);

  if (fileKeys.length === 1) {
    const blob = new Blob([downloadFiles['index.html']], { type: 'text/html' });
    // ... rest unchanged, use downloadFiles instead of activeFiles
```

**Step 4: Commit**

```bash
git add src/lib/preview/combine-files.ts src/components/PreviewPanel.tsx
git commit -m "feat: add component injection to preview and download"
```

---

### Task 5: Update Manifest Generator (Block-Aware)

**Files:**
- Modify: `src/lib/prompts/manifest/generate-manifest.ts:82-119` (`extractSections`)
- Modify: `src/lib/prompts/manifest/generate-manifest.ts:237-276` (`generateManifest`)

**Step 1: Update `extractSections` to read `data-block` attributes**

Rename function to `extractBlocks`. Change from building CSS selectors to reading `data-block`:

```typescript
interface BlockEntry {
  id: string;        // data-block value
  tag: string;       // nav, section, footer, etc.
  component?: string; // component name if this is a placeholder
  summary: string;
}

export function extractBlocks(html: string, componentNames: Set<string>): BlockEntry[] {
  const blocks: BlockEntry[] = [];

  // Check for component placeholders: <!-- @component:X -->
  const placeholderRe = /<!-- @component:(\S+) -->/g;
  let placeholderMatch;
  while ((placeholderMatch = placeholderRe.exec(html)) !== null) {
    const compName = placeholderMatch[1];
    blocks.push({
      id: compName,
      tag: 'component',
      component: compName,
      summary: `(shared component — edit _components/${compName}.html)`,
    });
  }

  // Extract data-block elements
  const tagRe = /<(nav|header|section|footer|aside|main)(\s[^>]*)?>([\s\S]*?)(?=<\/\1>)/gi;
  let match;

  while ((match = tagRe.exec(html)) !== null) {
    const tag = match[1].toLowerCase();
    const attrs = match[2] || '';
    const inner = match[3];

    const blockMatch = attrs.match(/data-block=["']([^"']+)["']/);
    if (!blockMatch) continue; // skip elements without data-block

    const id = blockMatch[1];

    // Skip if this block is a component (already listed as placeholder)
    if (componentNames.has(id)) continue;

    const summary = summarizeContent(inner);
    blocks.push({ id, tag, summary });
  }

  return blocks;
}
```

**Step 2: Update `generateManifest` to use blocks format**

Change the per-file output from `<sections>` to `<blocks>`, using block IDs:

```typescript
export function generateManifest(files: ProjectFiles): { perFile: string; siteOverview: string } {
  const entries: string[] = [];
  const componentNames = new Set<string>();

  // Collect component names
  for (const filename of Object.keys(files)) {
    if (filename.startsWith('_components/')) {
      componentNames.add(filename.replace('_components/', '').replace('.html', ''));
    }
  }

  for (const [filename, content] of Object.entries(files)) {
    if (content.length <= SMALL_FILE_THRESHOLD) {
      entries.push(`<file name="${filename}" size="${content.length}">\n${content}\n</file>`);
      continue;
    }

    const tokens = extractDesignTokens(content);
    const fonts = extractFonts(content);
    const blocks = extractBlocks(content, componentNames);

    let manifest = `<file name="${filename}" size="${content.length}">`;

    if (tokens.length > 0) {
      manifest += `\n  <design_tokens>\n${tokens.map((t) => `    ${t}`).join('\n')}\n  </design_tokens>`;
    }

    if (fonts.length > 0) {
      manifest += `\n  <fonts>${fonts.join(', ')}</fonts>`;
    }

    if (blocks.length > 0) {
      manifest += `\n  <blocks>\n${blocks.map((b) => {
        let line = `    ${b.id}`;
        if (b.component) line += ` (component:${b.component})`;
        line += ` — ${b.summary}`;
        return line;
      }).join('\n')}\n  </blocks>`;
    }

    manifest += '\n</file>';
    entries.push(manifest);
  }

  return {
    perFile: entries.join('\n\n'),
    siteOverview: extractSiteOverview(files),
  };
}
```

**Step 3: Commit**

```bash
git add src/lib/prompts/manifest/generate-manifest.ts
git commit -m "feat: update manifest to use block IDs instead of CSS selectors"
```

---

### Task 6: Update System Prompts

**Files:**
- Modify: `src/lib/prompts/sections/tool-output-format.ts` (both exports)
- Modify: `src/lib/prompts/sections/context-blocks.ts:5-31` (`buildEditModeBlock`)
- Modify: `src/lib/prompts/system-prompt.ts:10,52-53`

**Step 1: Delete `SINGLE_PAGE_TOOL_FORMAT_SECTION`**

In `src/lib/prompts/sections/tool-output-format.ts`, delete lines 1-57 entirely (the `SINGLE_PAGE_TOOL_FORMAT_SECTION` export).

**Step 2: Update `TOOL_OUTPUT_FORMAT_SECTION`**

Replace with updated version referencing editBlock and data-block attributes:

```typescript
export const TOOL_OUTPUT_FORMAT_SECTION = `<tool_output_format>
You have 9 tools across 3 categories: file (writeFile, writeFiles, editBlock, editFiles, readFile), resource (searchImages, searchIcons), web (fetchUrl, webSearch). Call multiple independent tools in the same step when possible.

<block_ids>
EVERY semantic section you generate MUST have a data-block attribute with a unique, semantic name:
<nav data-block="main-nav">...</nav>
<section data-block="hero">...</section>
<section data-block="features">...</section>
<footer data-block="site-footer">...</footer>

Rules:
- Names must be unique within a file, descriptive, and kebab-case (e.g. "pricing-table", "team-section", "contact-form")
- Apply to: nav, header, main, section, footer, aside — every top-level semantic element
- Preserve existing data-block attributes when editing — never remove or rename them
</block_ids>

<tool_selection>
File editing — choose the right tool:
- editBlock (preferred for ALL edits): target a block by its data-block ID or a CSS selector. Use blockId for section-level changes (replace hero, update footer). Use selector for fine-grained changes within a block (change a heading, update an image src).
- editFiles (for text substitutions): search/replace for renaming text, changing values, or small string changes across files. Uses multi-tier matching (exact → whitespace → token → fuzzy).
- writeFile: write a single HTML page. Preferred for single-page generation.
- writeFiles: write multiple files at once. Use for multi-page sites or when creating several files. Include ONLY files being created or fully rewritten.
- readFile: inspect a file before editing to see exact content.

Shared components:
- Blocks marked (component:X) in the manifest are shared across all pages.
- To edit shared nav/footer, edit the _components/ file (e.g. _components/main-nav.html). Changes apply to ALL pages automatically.
- NEVER edit component blocks directly in page files — they contain placeholders, not HTML.

When to call webSearch (for specific real-world information):
- Prompt references a real business, brand, person, or organization → search for their actual details
- Prompt references a specific address, city, or neighborhood → search for real info
- Request requires embed codes or integration details
- User shares a URL and you need to fetch its content → webSearch + fetchUrl

Do NOT call webSearch for:
- Generic design inspiration, layout ideas, or "examples of X websites"
- Typical services, pricing, or FAQs for a type of business (use your own knowledge)
- Content you can generate from general knowledge
</tool_selection>

<tool_workflows>
NEW SITE (first generation):
1. webSearch (if prompt references a real business, person, place, or location)
2. searchImages + searchIcons (parallel — all image/icon needs in this step)
3. writeFiles → generate HTML with data-block attributes on every section

EDIT (small change — text, colors, layout tweaks, removing/hiding elements):
1. editBlock → target by blockId or selector
DO NOT call searchImages, searchIcons, or webSearch for small edits.

EDIT (structural change — new sections, major rework):
1. readFile (if unsure about current file state)
2. webSearch (only if adding content requiring real-world facts)
3. searchImages/searchIcons (ONLY if adding NEW images/icons)
4. editBlock with action "replace" or "replaceInner" → replace entire section

EDIT (shared component — nav, footer):
1. editBlock on _components/ file → edit once, all pages update

EXTERNAL CONTENT:
1. webSearch → find sources/embed codes
2. fetchUrl → get full content from a result URL if snippets insufficient
3. writeFiles or editBlock → integrate content into HTML

Call multiple independent tools in the same step when possible.
</tool_workflows>

<tool_error_handling>
If a tool returns success: false, use these fallbacks:
- searchImages failed → use https://placehold.co/800x400/eee/999?text=Image placeholder
- searchIcons failed → use a simple inline SVG or Unicode symbol
- editBlock failed (block not found) → check error for available blocks, retry with correct blockId. If targeting a component, edit the _components/ file instead. If no blocks exist, use selector mode.
- editFiles failed (search text not found) → check bestMatch for closest match. After 2 failures on same file, use writeFiles.
- webSearch failed → proceed using your own knowledge
- fetchUrl failed → use the search result snippets instead
Always have a fallback path — tool failures should not halt generation.
</tool_error_handling>

<tool_rules>
- Each HTML file must be a complete standalone document with its own <head>, Tailwind CDN, fonts, and design system.
- Keep CSS/JS inline in the HTML file. Only split into separate files if the user explicitly asks.
- Only add new pages when the user explicitly asks for them.
- Inter-page links: use plain relative filenames (href="about.html").
- EVERY top-level semantic element (nav, header, main, section, footer, aside) MUST have a data-block attribute.
- For colors: generate a unique palette per the color_system rules, apply values to :root CSS custom properties.
- For images: call searchImages ONCE with all queries. Use DIFFERENT queries per image for variety.
- For icons: call searchIcons ONCE with all queries. Use "outline" style for UI chrome, "solid" for emphasis.
- Before calling a tool, explain what you'll build/change in 2-3 sentences max.
- After tool calls complete, add a 1-sentence summary of what was delivered.
- File content passed to tools must be pure code — start with valid HTML. No conversational text or markdown inside file content.
- writeFiles keys must be valid filenames with extensions. Values must be complete file content, not placeholders.
</tool_rules>
</tool_output_format>`;
```

**Step 3: Update `buildEditModeBlock` in `context-blocks.ts`**

Replace `src/lib/prompts/sections/context-blocks.ts:5-31`:

```typescript
export function buildEditModeBlock(currentFiles?: ProjectFiles): string {
  if (!currentFiles?.['index.html']) return '';

  const hasComponents = Object.keys(currentFiles).some(f => f.startsWith('_components/'));

  const componentBlock = hasComponents
    ? `\nShared components:
- Blocks marked (component:X) are shared across all pages. Edit them in _components/ — changes apply everywhere.
- NEVER edit component blocks in page files — they contain placeholders, not HTML.
- To give a page a unique version, replace the placeholder with inline HTML using a different data-block name.`
    : '';

  const isMultiPage = Object.keys(currentFiles).filter(f => f.endsWith('.html') && !f.startsWith('_components/')).length > 1;

  const crossPageBlock = isMultiPage
    ? `\nCross-page awareness:
- New pages must use the same design_system tokens and font imports from site_overview.
- Only add new pages when the user explicitly asks for them.`
    : '';

  return `\n<edit_guidance>
Modify the existing HTML based on the user's request.
Build on the existing design — preserve what works, change what's requested.

BEFORE EDITING: Check the manifest above. It shows every block's data-block ID and content summary. Target blocks by ID using editBlock.

Tool selection:
- editBlock (blockId): section-level changes — replace, modify, add, remove entire blocks. Primary tool.
- editBlock (selector): fine-grained changes within a block — change a heading, update an image, tweak classes.
- editFiles: text-level search/replace for small string changes. MUST call readFile first for exact content.
- writeFiles: full page rewrites or new pages only.${componentBlock}${crossPageBlock}
</edit_guidance>`;
}
```

**Step 4: Update `system-prompt.ts`**

In `src/lib/prompts/system-prompt.ts`:

Line 10 — remove `SINGLE_PAGE_TOOL_FORMAT_SECTION` from import:
```typescript
import { TOOL_OUTPUT_FORMAT_SECTION } from '@/lib/prompts/sections/tool-output-format';
```

Lines 52-53 — remove the conditional, always use `TOOL_OUTPUT_FORMAT_SECTION`:
```typescript
const toolSection = TOOL_OUTPUT_FORMAT_SECTION;
```

Remove `isSinglePageEdit` and `fileCount` variables if no longer used elsewhere in the function.

**Step 5: Commit**

```bash
git add src/lib/prompts/sections/tool-output-format.ts src/lib/prompts/sections/context-blocks.ts src/lib/prompts/system-prompt.ts
git commit -m "feat: update system prompts for editBlock and block-based editing"
```

---

### Task 7: Update `useHtmlParser` for `editBlock` Output

**Files:**
- Modify: `src/hooks/useHtmlParser.ts:144-151`

**Step 1: Verify editBlock output compatibility**

The `editBlock` tool returns `{ success, file, content }` — the same shape as editDOM. The extraction at line 144 checks:

```typescript
else if ('file' in output && 'content' in output) {
```

This already matches `editBlock` output. **No code change needed** for basic extraction.

However, update the comment at line 144 from `editDOM` to `editBlock`:

```typescript
// editBlock output: { success: true|"partial", file: string, content: string }
```

Also update the comment at line 271:
```typescript
// If tools produced file content (writeFiles, editBlock, editFiles), use that
```

**Step 2: Handle post-processed files event**

If the server emits a `post-processed-files` data event (from Task 3), the client needs to apply it. This can be handled in the Builder component's stream data handling, or by simply updating the `htmlArtifact` on persistence (which already captures the final workingFiles state).

The simplest approach: don't emit a custom event. Instead, ensure the `onFinish` callback in the chat route persists the post-processed workingFiles as the `htmlArtifact`. The client will pick these up on conversation reload. During the current session, the last tool output already set the files — block validation only adds attributes (invisible change), and component extraction only runs on first multi-page gen (before any edits happen).

**Revised approach for Task 3**: Skip the custom stream event. Run post-processing on workingFiles in-place before persistence. The client's live `currentFiles` will be slightly out of sync (missing auto-assigned block IDs), but this is harmless — the next edit will use the persisted version which has them.

**Step 3: Commit**

```bash
git add src/hooks/useHtmlParser.ts
git commit -m "refactor: update useHtmlParser comments for editBlock"
```

---

### Task 8: Update Blueprint Routes

**Files:**
- Modify: `src/app/api/blueprint/components/route.ts:93`
- Modify: `src/app/api/blueprint/pages/route.ts:275`
- Modify: `src/lib/blueprint/prompts/page-system-prompt.ts` (add data-block instructions)
- Modify: `src/lib/blueprint/prompts/components-system-prompt.ts` (add data-block instructions)

**Step 1: Blueprint routes already use `createWebsiteTools`**

Both routes already call `createWebsiteTools({})` — no tool set change needed.

**Step 2: Add data-block instructions to blueprint prompts**

In `src/lib/blueprint/prompts/page-system-prompt.ts`, add a block requiring data-block attributes:

```
EVERY semantic section must have a data-block attribute with a unique, semantic name:
<nav data-block="main-nav">, <section data-block="hero">, <footer data-block="site-footer">, etc.
```

Same for `src/lib/blueprint/prompts/components-system-prompt.ts`:
```
The shared component element MUST have a data-block attribute (e.g. <nav data-block="main-nav">).
```

**Step 3: Run post-generation pipeline after blueprint page generation**

In `src/app/api/blueprint/pages/route.ts`, after all pages are generated, run `validateBlocks` and `extractComponents` on the combined output files before persistence.

**Step 4: Commit**

```bash
git add src/app/api/blueprint/components/route.ts src/app/api/blueprint/pages/route.ts src/lib/blueprint/prompts/page-system-prompt.ts src/lib/blueprint/prompts/components-system-prompt.ts
git commit -m "feat: add block-based editing support to blueprint routes"
```

---

### Task 9: Update CLAUDE.md and Clean Up

**Files:**
- Modify: `CLAUDE.md` (update tool descriptions, add block-based editing section)
- Delete references to `createSinglePageTools` and `editDOM` throughout docs
- Modify: `src/lib/parser/edit-operations/types.ts` (remove DomOperation if no longer used by editFiles)

**Step 1: Update CLAUDE.md tool descriptions**

Replace references to `editDOM` with `editBlock`. Update tool set descriptions. Add `_components/` to source layout. Update data flow diagram.

**Step 2: Clean up unused code**

- If `domOperationSchema` is no longer imported anywhere, delete it from `file-tools.ts`
- If `applyDomOperations` is no longer imported, it can stay (editBlock uses Cheerio directly, but the file is still useful code)
- Remove `createEditDomTool` export from `file-tools.ts` if not already done in Task 1
- Remove `DomOperation` type export if `editFiles` no longer uses DOM ops

**Step 3: Commit**

```bash
git add CLAUDE.md src/lib/chat/tools/file-tools.ts src/lib/parser/edit-operations/types.ts
git commit -m "docs: update CLAUDE.md for block-based editing, clean up unused code"
```

---

## Task Dependencies

```
Task 1 (editBlock tool) ──────────────┐
Task 2 (post-gen pipeline) ───────────┤
                                      ├── Task 3 (integrate into chat route)
Task 5 (manifest generator) ──────────┤
Task 6 (system prompts) ──────────────┘

Task 4 (preview system) ── independent, can run in parallel with Tasks 1-3
Task 7 (useHtmlParser) ── depends on Task 1 (needs editBlock output shape finalized)
Task 8 (blueprint routes) ── depends on Tasks 1, 2, 6
Task 9 (cleanup) ── last, depends on all others
```

## Verification Checklist

After all tasks complete:

- [ ] `npm run build` passes with no TypeScript errors
- [ ] Single-page site: editBlock with blockId works
- [ ] Single-page site: editBlock with selector works (fallback)
- [ ] Multi-page site: first generation adds data-block attrs
- [ ] Multi-page site: post-gen extracts nav/footer to _components/
- [ ] Multi-page site: editing _components/ file updates all pages in preview
- [ ] Download: component files baked into exported HTML
- [ ] Download: _components/ files excluded from zip
- [ ] Existing conversation (no blocks): graceful fallback to selector mode
- [ ] Blueprint mode: pages generated with data-block attrs
- [ ] Manifest shows block IDs instead of CSS selectors
- [ ] No references to editDOM or createSinglePageTools remain in source code
