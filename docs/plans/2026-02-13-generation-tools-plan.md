# Generation Tools Expansion — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add 4 new LLM-callable tools (searchImages, readFile, fetchUrl, validateHtml) to the generation pipeline, replacing the proxy-based image approach with direct tool-based image selection.

**Architecture:** Modular tool factories split by category (file, image, web, validation), composed into a single `createWebsiteTools()` in an index file. File tools share a `workingFiles` closure. External tools are stateless. System prompts updated to reference new tools. Step limit raised from 3→5.

**Tech Stack:** Vercel AI SDK v6 (`tool()`), Zod v4 schemas, `html-validate` npm package, existing Pexels API client (`src/lib/images/pexels.ts`)

---

### Task 1: Install html-validate dependency

**Files:**
- Modify: `package.json`

**Step 1: Install the package**

Run:
```bash
npm install html-validate
```

Expected: Package added to dependencies in `package.json`.

**Step 2: Verify installation**

Run:
```bash
node -e "const { HtmlValidate } = require('html-validate'); const v = new HtmlValidate(); console.log('html-validate loaded OK');"
```

Expected: "html-validate loaded OK"

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add html-validate dependency for generation validation tool"
```

---

### Task 2: Create file-tools.ts (writeFiles, editFile, readFile)

**Files:**
- Create: `src/lib/chat/tools/file-tools.ts`

Extract existing `writeFiles` and `editFile` from `src/lib/chat/tools.ts` into the new file, and add the new `readFile` tool. All three share the `workingFiles` mutable closure.

**Step 1: Create the file tools module**

```typescript
// src/lib/chat/tools/file-tools.ts
import { tool } from 'ai';
import { z } from 'zod';
import { applyEditOperations } from '@/lib/parser/edit-operations/apply-edit-operations';
import type { ProjectFiles } from '@/types';

export function createFileTools(workingFiles: ProjectFiles) {
  return {
    writeFiles: tool({
      description:
        'Create or rewrite complete HTML files. Use for new sites, major redesigns (>40% of page changes), or adding new pages. Include ONLY new or rewritten files — unchanged files are preserved automatically.',
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
        'Apply targeted search/replace edits to an existing file. Use for small-medium changes: colors, text, adding/removing elements, CSS tweaks, bug fixes. Each search string must match EXACTLY in the file (including whitespace). Preferred over writeFiles when changes are localized.',
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
        'Read the current contents of a file. Use to inspect a file before editing, or to verify changes after an edit. Useful for multi-step edits where you need to see the current state.',
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
```

**Step 2: Verify file compiles**

Run:
```bash
npx tsc --noEmit src/lib/chat/tools/file-tools.ts 2>&1 | head -20
```

Note: This may show import resolution issues — that's OK, we'll verify with `npm run build` at the end.

---

### Task 3: Create image-tools.ts (searchImages)

**Files:**
- Create: `src/lib/chat/tools/image-tools.ts`

**Step 1: Create the image tools module**

```typescript
// src/lib/chat/tools/image-tools.ts
import { tool } from 'ai';
import { z } from 'zod';
import { searchPhotos } from '@/lib/images/pexels';

export function createImageTools() {
  return {
    searchImages: tool({
      description:
        'Search for high-quality stock photos from Pexels. Returns image URLs you can use directly in <img> tags. Call this BEFORE writing HTML that needs images — pick the best result for each placement. Use descriptive, specific queries for better results.',
      inputSchema: z.object({
        query: z
          .string()
          .describe('Descriptive search query, 2-5 words (e.g. "modern office workspace", "fresh pasta dish", "woman professional headshot")'),
        count: z
          .number()
          .int()
          .min(1)
          .max(5)
          .default(3)
          .describe('Number of image results to return (1-5). Default 3.'),
        orientation: z
          .enum(['landscape', 'portrait', 'square'])
          .optional()
          .describe('Image orientation. landscape for heroes/banners, portrait for people/tall cards, square for avatars/thumbnails.'),
      }),
      execute: async ({ query, count, orientation }) => {
        try {
          const photos = await searchPhotos(query, {
            orientation,
            perPage: count,
          });

          if (photos.length === 0) {
            return {
              success: true as const,
              images: [],
              message: `No images found for "${query}". Use a placeholder or try a different query.`,
            };
          }

          return {
            success: true as const,
            images: photos.map((photo) => ({
              url: photo.src.large2x,
              alt: photo.alt || query,
              photographer: photo.photographer,
              width: photo.width,
              height: photo.height,
            })),
          };
        } catch (error) {
          return {
            success: false as const,
            error: `Image search failed: ${error instanceof Error ? error.message : 'Unknown error'}. Use placeholder images instead.`,
          };
        }
      },
    }),
  };
}
```

---

### Task 4: Create web-tools.ts (fetchUrl)

**Files:**
- Create: `src/lib/chat/tools/web-tools.ts`

**Step 1: Create the web tools module with SSRF protection**

```typescript
// src/lib/chat/tools/web-tools.ts
import { tool } from 'ai';
import { z } from 'zod';

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '[::1]',
  'metadata.google.internal',
]);

const BLOCKED_IP_PREFIXES = [
  '10.',        // Private Class A
  '172.16.',    // Private Class B (172.16-31)
  '172.17.', '172.18.', '172.19.',
  '172.20.', '172.21.', '172.22.', '172.23.',
  '172.24.', '172.25.', '172.26.', '172.27.',
  '172.28.', '172.29.', '172.30.', '172.31.',
  '192.168.',   // Private Class C
  '169.254.',   // Link-local / cloud metadata
  'fd',         // IPv6 private
  'fe80:',      // IPv6 link-local
];

const ALLOWED_CONTENT_TYPES = [
  'text/html',
  'text/plain',
  'text/css',
  'text/csv',
  'text/xml',
  'application/json',
  'application/xml',
  'application/rss+xml',
  'application/atom+xml',
];

const FETCH_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_SIZE = 50_000; // 50KB text cap

function isBlockedHost(hostname: string): boolean {
  if (BLOCKED_HOSTNAMES.has(hostname)) return true;
  for (const prefix of BLOCKED_IP_PREFIXES) {
    if (hostname.startsWith(prefix)) return true;
  }
  return false;
}

function isAllowedContentType(contentType: string | null): boolean {
  if (!contentType) return false;
  const base = contentType.split(';')[0].trim().toLowerCase();
  return ALLOWED_CONTENT_TYPES.some((allowed) => base === allowed);
}

export function createWebTools() {
  return {
    fetchUrl: tool({
      description:
        'Fetch content from a public URL. Use to retrieve API data, webpage content, or structured data to incorporate into the website. Returns text content (HTML, JSON, XML, plain text). Cannot access private/internal URLs.',
      inputSchema: z.object({
        url: z
          .string()
          .url()
          .describe('The public URL to fetch (must be https:// or http://)'),
      }),
      execute: async ({ url }) => {
        try {
          const parsed = new URL(url);

          if (!['http:', 'https:'].includes(parsed.protocol)) {
            return { success: false as const, error: 'Only HTTP and HTTPS URLs are supported.' };
          }

          if (isBlockedHost(parsed.hostname)) {
            return { success: false as const, error: 'Cannot fetch from private or internal URLs.' };
          }

          const response = await fetch(url, {
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
            headers: {
              'User-Agent': 'AIBuilder/1.0',
              'Accept': 'text/html, application/json, text/plain, */*',
            },
            redirect: 'follow',
          });

          if (!response.ok) {
            return {
              success: false as const,
              error: `HTTP ${response.status}: ${response.statusText}`,
            };
          }

          const contentType = response.headers.get('content-type');
          if (!isAllowedContentType(contentType)) {
            return {
              success: false as const,
              error: `Unsupported content type: ${contentType}. Only text and JSON content is supported.`,
            };
          }

          const text = await response.text();
          const truncated = text.length > MAX_RESPONSE_SIZE;
          const content = truncated ? text.slice(0, MAX_RESPONSE_SIZE) : text;

          return {
            success: true as const,
            content,
            contentType: contentType?.split(';')[0].trim() ?? 'unknown',
            length: text.length,
            truncated,
          };
        } catch (error) {
          if (error instanceof Error && error.name === 'TimeoutError') {
            return { success: false as const, error: 'Request timed out after 10 seconds.' };
          }
          return {
            success: false as const,
            error: `Fetch failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          };
        }
      },
    }),
  };
}
```

---

### Task 5: Create validation-tools.ts (validateHtml)

**Files:**
- Create: `src/lib/chat/tools/validation-tools.ts`

**Step 1: Create the validation tools module**

```typescript
// src/lib/chat/tools/validation-tools.ts
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
```

---

### Task 6: Create tools/index.ts — compose all tools

**Files:**
- Create: `src/lib/chat/tools/index.ts`
- Delete: `src/lib/chat/tools.ts` (old monolithic file)

**Step 1: Create the composition module**

```typescript
// src/lib/chat/tools/index.ts
import type { ToolSet } from 'ai';
import type { ProjectFiles } from '@/types';
import { createFileTools } from './file-tools';
import { createImageTools } from './image-tools';
import { createWebTools } from './web-tools';
import { createValidationTools } from './validation-tools';

export function createWebsiteTools(currentFiles: ProjectFiles): ToolSet {
  // Mutable working copy accumulates changes across multi-step tool calls
  const workingFiles: ProjectFiles = { ...currentFiles };

  return {
    ...createFileTools(workingFiles),
    ...createImageTools(),
    ...createWebTools(),
    ...createValidationTools(workingFiles),
  };
}
```

**Step 2: Delete old tools.ts**

```bash
rm src/lib/chat/tools.ts
```

**Step 3: Update import in route.ts**

In `src/app/api/chat/route.ts`, line 5, change:
```typescript
// OLD:
import { createWebsiteTools } from '@/lib/chat/tools';
// NEW:
import { createWebsiteTools } from '@/lib/chat/tools/index';
```

**Step 4: Check for any other imports of the old path**

Run:
```bash
grep -r "from '@/lib/chat/tools'" src/ --include="*.ts" --include="*.tsx"
```

Update any matches to point to `@/lib/chat/tools/index'`.

**Step 5: Commit**

```bash
git add src/lib/chat/tools/ src/app/api/chat/route.ts
git add -u  # Picks up the deleted tools.ts
git commit -m "feat: modular tool architecture with searchImages, readFile, fetchUrl, validateHtml"
```

---

### Task 7: Update route.ts — raise step limit + add progress labels

**Files:**
- Modify: `src/app/api/chat/route.ts`

**Step 1: Raise step limit from 3 to 5**

In `src/app/api/chat/route.ts`, line 97, change:
```typescript
// OLD:
stopWhen: stepCountIs(3),
// NEW:
stopWhen: stepCountIs(5),
```

**Step 2: Add tool-specific progress labels**

In the tool lifecycle tracking section (around lines 117-152), update the `tool-input-start` handler to show tool-specific labels:

```typescript
// Replace the existing tool-input-start handler (lines 118-128)
if (part.type === 'tool-input-start') {
  const toolName = part.toolName as string;
  debugSession.logToolCall({
    toolName,
    toolCallId: part.toolCallId as string,
  });

  const progressLabels: Record<string, string> = {
    writeFiles: 'Generating code...',
    editFile: 'Applying edits...',
    readFile: 'Reading file...',
    searchImages: 'Searching for images...',
    fetchUrl: 'Fetching content...',
    validateHtml: 'Validating HTML...',
  };

  writer.write({
    type: 'data-buildProgress',
    data: {
      phase: 'generating' as const,
      label: progressLabels[toolName] ?? 'Processing...',
      file: 'index.html',
      percent: 15,
      timestamp: Date.now(),
    },
    transient: true,
  });
}
```

**Step 3: Commit**

```bash
git add src/app/api/chat/route.ts
git commit -m "feat: raise tool step limit to 5 and add tool-specific progress labels"
```

---

### Task 8: Update system prompts

**Files:**
- Modify: `src/lib/prompts/sections/base-rules.ts` (remove proxy URL, add searchImages instruction)
- Modify: `src/lib/prompts/sections/tool-output-format.ts` (add all 4 new tool descriptions)
- Modify: `src/lib/prompts/sections/context-blocks.ts` (mention readFile in edit guidance)

**Step 1: Update base-rules.ts — replace rule #6**

In `src/lib/prompts/sections/base-rules.ts`, replace rule 6 (the proxy URL line):

```typescript
// OLD (line 10):
6. For images, use ${appUrl}/api/images/proxy?q={keyword}&orientation={orientation}&w={width}&h={height} for real photos. Use inline SVG for icons.
   - keyword: descriptive 2-4 word phrase matching the image content (e.g. "modern office workspace", "fresh pasta dish", "woman professional headshot")
   - orientation: landscape (heroes, banners, wide cards), portrait (people, tall cards), square (avatars, thumbnails)
   - w/h: match your layout (hero: 1200x800, card: 600x400, thumb: 400x300, avatar: 200x200)
   - Use DIFFERENT keywords for each image on the page to ensure variety
   - For people/team photos, vary keywords per person (e.g. "professional woman portrait", "young man business headshot")
// NEW:
6. For images, use the searchImages tool to find real photos from Pexels. Call it BEFORE writing HTML that needs images, then use the returned URLs directly in <img> tags. Use inline SVG for icons.
   - Use descriptive 2-5 word queries (e.g. "modern office workspace", "fresh pasta dish")
   - Use DIFFERENT queries for each image to ensure variety
   - Pick the best result from the returned images for each placement
   - Choose orientation: landscape (heroes, banners), portrait (people, tall cards), square (avatars, thumbnails)
```

**Step 2: Update tool-output-format.ts — add new tool descriptions**

Replace the entire `TOOL_OUTPUT_FORMAT_SECTION` export:

```typescript
export const TOOL_OUTPUT_FORMAT_SECTION = `<tool_output_format>
You have these tools for building websites:

**File Tools:**
- **writeFiles** — Create or rewrite complete HTML files. Use for: new sites, major redesigns (>40% of page changes), adding new pages. Include ONLY new or rewritten files.
- **editFile** — Apply targeted search/replace edits to an existing file. Use for: small-medium changes. Each search must match EXACTLY including whitespace. Preferred when changes are localized.
- **readFile** — Read the current contents of a file. Use to inspect before editing, or verify changes after edits. Helpful for multi-step modifications.

**Image Tool:**
- **searchImages** — Search for stock photos from Pexels. Call BEFORE writing HTML that needs images. Returns image URLs you place directly in <img> tags. Use descriptive queries and pick the best result.

**Web Tool:**
- **fetchUrl** — Fetch content from a public URL. Use to retrieve API data, webpage text, or structured data to incorporate into the site. Supports HTML, JSON, XML, and plain text.

**Validation Tool:**
- **validateHtml** — Check an HTML file for syntax errors. Use after generating or editing to catch issues. Fix any errors with editFile.

Rules:
- Each HTML file must be a complete standalone document with its own <head>, Tailwind CDN, fonts, and design system
- Never split CSS/JS into separate files unless the user explicitly asks
- Never add pages unless the user explicitly asks
- Inter-page links: use plain relative filenames (href="about.html")
- For images: call searchImages first, then use the returned URLs in your HTML
- Before calling a tool, explain what you'll build/change in 2-3 sentences
- After the tool call completes, add a 1-sentence summary of what was delivered
</tool_output_format>`;
```

**Step 3: Update context-blocks.ts — mention readFile in edit guidance**

In `src/lib/prompts/sections/context-blocks.ts`, update the `buildEditModeBlock` function:

```typescript
// OLD edit_guidance content:
Choose the right tool based on scope:
- **editFile** — for targeted changes (colors, text, elements, CSS, bug fixes). Preferred when changes are localized.
- **writeFiles** — for major redesigns, structural overhauls, or when more than ~40% of the page changes. Include ONLY rewritten files.
- **Adding a page** — use editFile to add nav links to existing pages, then writeFiles for the new page only. Do NOT add pages unless the user explicitly asks.

You can call both tools in the same turn when needed (e.g. editFile for nav links + writeFiles for a new page).

// NEW:
Choose the right tool based on scope:
- **readFile** — inspect a file before editing to see its current state. Useful for complex multi-step edits.
- **editFile** — for targeted changes (colors, text, elements, CSS, bug fixes). Preferred when changes are localized.
- **writeFiles** — for major redesigns, structural overhauls, or when more than ~40% of the page changes. Include ONLY rewritten files.
- **Adding a page** — use editFile to add nav links to existing pages, then writeFiles for the new page only. Do NOT add pages unless the user explicitly asks.

You can call multiple tools in the same turn when needed (e.g. searchImages + editFile, or editFile for nav links + writeFiles for a new page).
After making edits, optionally call validateHtml to verify correctness.
```

**Step 4: Commit**

```bash
git add src/lib/prompts/sections/base-rules.ts src/lib/prompts/sections/tool-output-format.ts src/lib/prompts/sections/context-blocks.ts
git commit -m "feat: update system prompts for new generation tools"
```

---

### Task 9: Update design-quality.ts anti-patterns reference

**Files:**
- Modify: `src/lib/prompts/sections/design-quality.ts`

**Step 1: Update image reference in anti_patterns**

In the `<anti_patterns>` section, find the line (around line 132):
```
-> INSTEAD: Use purposeful visual elements — real Pexels photos via the image proxy, Lucide/Heroicons-style SVG icons, meaningful illustrations.
```

Replace with:
```
-> INSTEAD: Use purposeful visual elements — real photos from the searchImages tool, Lucide/Heroicons-style SVG icons, meaningful illustrations.
```

**Step 2: Commit**

```bash
git add src/lib/prompts/sections/design-quality.ts
git commit -m "fix: update anti-patterns to reference searchImages tool instead of proxy"
```

---

### Task 10: Build verification + lint

**Step 1: Run linter**

Run:
```bash
npm run lint
```

Expected: No new errors. Fix any lint issues.

**Step 2: Run build**

Run:
```bash
npm run build
```

Expected: Build succeeds. This is the definitive check that all imports resolve, types check, and the module structure is valid.

**Step 3: Fix any issues and commit**

If there are build/lint errors, fix them and commit:

```bash
git add -A
git commit -m "fix: resolve lint and build issues from tool expansion"
```

---

### Task 11: Manual smoke test

**Step 1: Start the dev server**

Run:
```bash
npm run dev
```

**Step 2: Test basic generation**

Open `http://localhost:3000`, create a new conversation, and prompt: "Build me a bakery landing page with photos of bread and pastries"

**Verify:**
- [ ] searchImages tool is called (check progress label "Searching for images...")
- [ ] Generated HTML uses direct Pexels CDN URLs (not `/api/images/proxy` URLs)
- [ ] writeFiles tool produces valid HTML
- [ ] Preview renders correctly

**Step 3: Test edit flow**

Prompt: "Change the hero section background color to warm amber"

**Verify:**
- [ ] editFile tool works correctly
- [ ] Progress shows "Applying edits..."

**Step 4: Test fetchUrl (optional)**

Prompt: "Fetch the data from https://jsonplaceholder.typicode.com/posts/1 and display it on the page"

**Verify:**
- [ ] fetchUrl tool is called
- [ ] Progress shows "Fetching content..."
- [ ] Data appears in generated HTML

---

## File Summary

| Action | File |
|--------|------|
| Create | `src/lib/chat/tools/file-tools.ts` |
| Create | `src/lib/chat/tools/image-tools.ts` |
| Create | `src/lib/chat/tools/web-tools.ts` |
| Create | `src/lib/chat/tools/validation-tools.ts` |
| Create | `src/lib/chat/tools/index.ts` |
| Delete | `src/lib/chat/tools.ts` |
| Modify | `src/app/api/chat/route.ts` (import path + step limit + progress labels) |
| Modify | `src/lib/prompts/sections/base-rules.ts` (remove proxy URL, add searchImages) |
| Modify | `src/lib/prompts/sections/tool-output-format.ts` (add all tool descriptions) |
| Modify | `src/lib/prompts/sections/context-blocks.ts` (add readFile + validateHtml guidance) |
| Modify | `src/lib/prompts/sections/design-quality.ts` (update anti-pattern reference) |
| Modify | `package.json` (add html-validate) |
