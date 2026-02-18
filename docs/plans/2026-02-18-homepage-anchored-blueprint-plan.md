# Homepage-Anchored Blueprint Generation — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Generate the homepage first as a design anchor, extract a style digest, and feed it to components + remaining pages for visual consistency.

**Architecture:** Homepage generated sequentially in full creative mode (like single-page chat). A focused AI call extracts a concrete style digest (~1-2K tokens) from the homepage HTML. Components and remaining pages receive the digest as context. Client orchestration adds a new `generating-homepage` phase between `awaiting-approval` and `generating-components`.

**Tech Stack:** Next.js App Router, Vercel AI SDK `streamText`/`generateText`, TypeScript, Prisma, SSE streaming

---

### Task 1: Weighted Style Seed for Blueprint Planning

**Files:**
- Modify: `src/lib/blueprint/prompts/blueprint-system-prompt.ts:1-7`
- Modify: `src/lib/blueprint/resolve-blueprint-execution.ts:39`
- Modify: `src/app/api/blueprint/generate/route.ts:43`

**Step 1: Update `getBlueprintSystemPrompt` to accept `userPrompt`**

In `src/lib/blueprint/prompts/blueprint-system-prompt.ts`, change line 5 and the function signature:

```typescript
// Line 1: add import
import { getWeightedStyleSeed } from '@/lib/prompts/sections/context-blocks';

// Line 4-5: remove old import and random seed call
// REMOVE: import { getRandomStyleSeed } from '@/lib/prompts/sections/context-blocks';
// REMOVE: const seed = getRandomStyleSeed();

// Update function signature (currently line 7):
// FROM: export function getBlueprintSystemPrompt(temporalContext?: TemporalContext): string {
// TO:
export function getBlueprintSystemPrompt(temporalContext?: TemporalContext, userPrompt?: string): string {
  const seed = getWeightedStyleSeed(userPrompt ?? '');
```

**Step 2: Update `resolveBlueprintExecution` to pass `userPrompt`**

In `src/lib/blueprint/resolve-blueprint-execution.ts`:

```typescript
// Update interface (line 9-14):
interface ResolveBlueprintExecutionInput {
  provider: string;
  model: string;
  savedTimeZone?: string | null;
  browserTimeZone?: string;
  userPrompt?: string; // ADD
}

// Update function (line 39):
// FROM: const systemPrompt = getBlueprintSystemPrompt(temporalContext);
// TO:
const systemPrompt = getBlueprintSystemPrompt(temporalContext, userPrompt);
```

**Step 3: Update blueprint generate route to pass `userPrompt`**

In `src/app/api/blueprint/generate/route.ts`, line 43:

```typescript
// FROM:
const { modelInstance, systemPrompt } = await resolveBlueprintExecution({
  provider,
  model,
  savedTimeZone,
  browserTimeZone,
});

// TO:
const { modelInstance, systemPrompt } = await resolveBlueprintExecution({
  provider,
  model,
  savedTimeZone,
  browserTimeZone,
  userPrompt: prompt,
});
```

**Step 4: Verify build compiles**

Run: `npm run build 2>&1 | tail -20`
Expected: No TypeScript errors in modified files.

**Step 5: Commit**

```bash
git add src/lib/blueprint/prompts/blueprint-system-prompt.ts src/lib/blueprint/resolve-blueprint-execution.ts src/app/api/blueprint/generate/route.ts
git commit -m "feat: use weighted style seed for blueprint planning

Blueprint planning now uses getWeightedStyleSeed(userPrompt) instead of
getRandomStyleSeed(), matching what chat mode does. This ensures the
design mood/aesthetic is influenced by the user's prompt."
```

---

### Task 2: Create Style Digest Extractor

**Files:**
- Create: `src/lib/blueprint/extract-style-digest.ts`

**Step 1: Create the style digest extractor**

This function takes homepage HTML and uses a fast AI call to extract concrete design patterns.

```typescript
import { generateText } from 'ai';
import { resolveApiKey } from '@/lib/keys/key-manager';
import { PROVIDERS } from '@/lib/providers/registry';
import { createDebugSession } from '@/lib/chat/stream-debug';

const EXTRACTION_PROMPT = `Analyze this HTML page and extract a concrete style digest. Output ONLY the digest, no explanation.

Format your response as a structured reference that another developer can follow to build visually consistent pages:

## Typography
- Headings: exact Tailwind classes used (text-5xl font-bold tracking-tight, etc.)
- Subheadings: exact classes
- Body text: exact classes
- Captions/small text: exact classes
- Any special text treatments (gradients, shadows, decorative)

## Color Application
- How primary color is used (backgrounds, text, borders — with exact classes)
- How secondary/accent colors are applied
- Background patterns: section background alternation pattern (e.g., "alternates bg-[var(--color-bg)] and bg-[var(--color-surface)]")
- Text color usage on different backgrounds

## Layout Patterns
- Section spacing (py-* values, gap-* values)
- Max-width and container approach
- Grid/flex patterns used (columns, gaps)
- Any alternating or asymmetric patterns

## Component Styles
- Buttons: exact Tailwind classes (e.g., "bg-[var(--color-primary)] text-white px-8 py-4 rounded-full hover:opacity-90")
- Cards: exact classes for card containers
- Dividers/separators: how sections are visually separated
- Image treatments: rounded corners, shadows, aspect ratios

## Visual Vocabulary
- Border radius values used
- Shadow styles used
- Gradient patterns
- Animation/transition patterns (hover effects, entrance animations)
- Any decorative elements (SVG patterns, shapes, overlays)

Be specific and concrete. Use exact Tailwind classes and CSS values from the HTML. This digest will be used to ensure other pages match this visual style exactly.`;

export async function extractStyleDigest(
  homepageHtml: string,
  provider: string,
  model: string,
  conversationId?: string,
): Promise<string> {
  const apiKey = await resolveApiKey(provider);
  if (!apiKey) throw new Error(`No API key for ${provider}`);

  const providerConfig = PROVIDERS[provider];
  if (!providerConfig) throw new Error(`Unknown provider: ${provider}`);

  const modelInstance = providerConfig.createModel(apiKey, model);

  const debugSession = createDebugSession({
    scope: 'blueprint-style-digest',
    model,
    provider,
    conversationId,
  });

  const userPrompt = `<homepage_html>
${homepageHtml}
</homepage_html>

${EXTRACTION_PROMPT}`;

  debugSession.logPrompt({
    systemPrompt: 'Extract a concrete style digest from the homepage HTML.',
    messages: [{ role: 'user', content: '[homepage HTML + extraction prompt]' }],
    maxOutputTokens: 4096,
  });

  const result = await generateText({
    model: modelInstance,
    prompt: userPrompt,
    maxOutputTokens: 4096,
  });

  debugSession.logResponse({ response: result.text, status: 'complete' });
  debugSession.finish('complete');

  return result.text;
}
```

**Step 2: Verify build compiles**

Run: `npm run build 2>&1 | tail -20`
Expected: No TypeScript errors.

**Step 3: Commit**

```bash
git add src/lib/blueprint/extract-style-digest.ts
git commit -m "feat: add AI-based style digest extractor

Analyzes homepage HTML and extracts concrete design patterns (~1-2K tokens):
typography scale, color application, layout patterns, component styles,
and visual vocabulary with exact Tailwind classes."
```

---

### Task 3: Create Homepage Generation API Route

**Files:**
- Create: `src/app/api/blueprint/homepage/route.ts`

**Step 1: Create the homepage generation endpoint**

This is modeled after `src/app/api/blueprint/pages/route.ts` but generates only the homepage (`index.html`) using the `isSinglePage=true` code path in `getPageSystemPrompt` — so the homepage generates its own header/footer inline (not placeholders).

```typescript
import { hasToolCall, stepCountIs, streamText, type ModelMessage } from 'ai';
import { prisma } from '@/lib/db/prisma';
import { resolveApiKey } from '@/lib/keys/key-manager';
import { PROVIDERS } from '@/lib/providers/registry';
import { getPageSystemPrompt } from '@/lib/blueprint/prompts/page-system-prompt';
import { ChatRequestError } from '@/lib/chat/errors';
import { resolveMaxOutputTokens } from '@/lib/chat/constants';
import { createDebugSession, createGenerationTracker } from '@/lib/chat/stream-debug';
import { createWebsiteTools } from '@/lib/chat/tools';
import { TOOL_LABELS, summarizeToolInput, summarizeToolOutput } from '@/lib/blueprint/stream-utils';
import { validateBlocks } from '@/lib/blocks/validate-blocks';
import type { Blueprint } from '@/lib/blueprint/types';
import { createOpenRouterModel } from '@/lib/providers/configs/openrouter';

const MAX_HOMEPAGE_CONTINUATIONS = 2;

/**
 * Extract HTML from model text output (fallback for models that don't use writeFiles).
 */
function extractHtmlFromText(text: string): string | null {
  const rawMatch = text.match(/<!DOCTYPE html>[\s\S]*<\/html>/i);
  if (rawMatch) return rawMatch[0];
  const codeBlockMatch = text.match(/```html\s*\n([\s\S]*?)```/i);
  if (codeBlockMatch) {
    const content = codeBlockMatch[1].trim();
    if (content.includes('<html') || content.includes('<!DOCTYPE')) return content;
  }
  return null;
}

interface HomepageRequestBody {
  conversationId: string;
  provider: string;
  model: string;
  maxOutputTokens?: number;
  blueprint?: Blueprint;
  headTags?: string;
  stylesCss?: string;
  scriptsJs?: string;
  imageProvider?: 'pexels' | 'together';
  imageModel?: string;
}

export async function POST(req: Request) {
  let body: HomepageRequestBody;
  try {
    body = await req.json() as HomepageRequestBody;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { conversationId, provider, model, maxOutputTokens: clientMaxTokens, headTags, stylesCss, scriptsJs } = body;
  let blueprint = body.blueprint;

  if (!conversationId || !provider || !model) {
    return new Response(JSON.stringify({ error: 'conversationId, provider, and model are required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!blueprint) {
    const dbBlueprint = await prisma.blueprint.findUnique({ where: { conversationId } });
    if (!dbBlueprint) {
      return new Response(JSON.stringify({ error: 'Blueprint not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    blueprint = dbBlueprint.data as Blueprint;
  }

  let apiKey: string | null;
  try {
    apiKey = await resolveApiKey(provider);
    if (!apiKey) throw new ChatRequestError(`No API key for ${provider}`);
  } catch (err: unknown) {
    if (err instanceof ChatRequestError) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: err.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    throw err;
  }

  const providerConfig = PROVIDERS[provider];
  if (!providerConfig) {
    return new Response(JSON.stringify({ error: `Unknown provider: ${provider}` }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const maxOutputTokens = resolveMaxOutputTokens(providerConfig, model, clientMaxTokens);
  const homepage = blueprint.pages.find(p => p.filename === 'index.html') ?? blueprint.pages[0];
  const abortSignal = req.signal;

  // TRICK: Create a single-page version of the blueprint so getPageSystemPrompt
  // uses the isSinglePage path (inline header/footer, full creative freedom)
  const singlePageBlueprint: Blueprint = {
    ...blueprint,
    pages: [homepage],
  };

  const sharedAssets = stylesCss || scriptsJs ? { stylesCss, scriptsJs } : undefined;
  const systemPrompt = getPageSystemPrompt(singlePageBlueprint, homepage, headTags, sharedAssets);
  const modelInstance = provider === 'OpenRouter'
    ? createOpenRouterModel(apiKey, model, 'none')
    : providerConfig.createModel(apiKey, model);

  const { readable, writable } = new TransformStream();
  const encoder = new TextEncoder();
  const writer = writable.getWriter();

  function sendEvent(data: Record<string, unknown>) {
    writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`)).catch(() => {});
  }

  (async () => {
    sendEvent({ type: 'homepage-status', status: 'generating' });

    try {
      const tracker = createGenerationTracker('blueprint-homepage');
      const PAGE_GEN_TOOLS = new Set(['writeFile', 'writeFiles', 'readFile', 'searchImages', 'searchIcons', 'webSearch', 'fetchUrl']);
      const { tools, workingFiles } = createWebsiteTools({}, { toolSubset: PAGE_GEN_TOOLS, imageProvider: body.imageProvider, imageModel: body.imageModel });

      const pagePrompt = `Generate the complete HTML page for "${homepage.title}" (${homepage.filename}). This is the homepage — make it stunning.`;
      let prevMessages: ModelMessage[] = [];
      let writeFilesAttempted = false;
      let allTextOutput = '';

      for (let segment = 0; segment <= MAX_HOMEPAGE_CONTINUATIONS; segment++) {
        if (abortSignal.aborted) break;

        const debugSession = createDebugSession({
          scope: `blueprint-homepage${segment > 0 ? `:cont${segment}` : ''}`,
          model,
          provider,
          conversationId,
        });

        let result;
        if (segment === 0) {
          debugSession.logPrompt({
            systemPrompt,
            messages: [{ role: 'user', content: pagePrompt }],
            maxOutputTokens,
          });
          result = streamText({
            model: modelInstance,
            system: systemPrompt,
            prompt: pagePrompt,
            maxOutputTokens,
            tools,
            stopWhen: [hasToolCall('writeFile'), hasToolCall('writeFiles'), stepCountIs(8)],
            abortSignal,
          });
        } else {
          const instruction = writeFilesAttempted
            ? `Your previous file write call was cut off. Call writeFile again with the COMPLETE HTML.`
            : `You gathered resources but did not write the file. Call writeFile now with the complete HTML.`;
          const continuationPrompt = `${instruction}\n\nwriteFile({ filename: "${homepage.filename}", content: "<!DOCTYPE html>..." })`;

          result = streamText({
            model: modelInstance,
            system: systemPrompt,
            prompt: continuationPrompt,
            maxOutputTokens,
            tools,
            stopWhen: [hasToolCall('writeFile'), hasToolCall('writeFiles'), stepCountIs(8)],
            abortSignal,
          });
        }

        let segmentTextBuffer = '';

        for await (const part of result.fullStream) {
          if (part.type === 'text-delta') {
            debugSession.logDelta(part.text);
            segmentTextBuffer += part.text;
          } else if (part.type === 'tool-input-delta') {
            debugSession.logToolInputDelta({ toolCallId: part.id, delta: part.delta });
          } else if (part.type === 'tool-input-start') {
            debugSession.logToolStarting({ toolName: part.toolName, toolCallId: part.id });
            if (part.toolName === 'writeFiles' || part.toolName === 'writeFile') {
              writeFilesAttempted = true;
            }
            sendEvent({
              type: 'tool-activity',
              toolCallId: part.id,
              toolName: part.toolName,
              status: 'running',
              label: TOOL_LABELS[part.toolName] ?? part.toolName,
            });
          } else if (part.type === 'tool-call') {
            debugSession.logToolCall({ toolName: part.toolName, toolCallId: part.toolCallId, input: part.input });
            const detail = summarizeToolInput(part.toolName, part.input);
            if (detail) {
              sendEvent({
                type: 'tool-activity',
                toolCallId: part.toolCallId,
                toolName: part.toolName,
                status: 'running',
                label: TOOL_LABELS[part.toolName] ?? part.toolName,
                detail,
              });
            }
          } else if (part.type === 'tool-result') {
            debugSession.logToolResult({ toolName: part.toolName, toolCallId: part.toolCallId, output: part.output });
            sendEvent({
              type: 'tool-activity',
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              status: 'done',
              label: TOOL_LABELS[part.toolName] ?? part.toolName,
              detail: summarizeToolOutput(part.toolName, part.output),
            });
          } else if (part.type === 'tool-error') {
            const rawErr = (part as { error?: unknown }).error;
            const errMsg = rawErr instanceof Error ? rawErr.message.slice(0, 100) : typeof rawErr === 'string' ? rawErr.slice(0, 100) : 'Tool error';
            debugSession.logToolResult({ toolName: part.toolName, toolCallId: part.toolCallId, error: errMsg });
            sendEvent({
              type: 'tool-activity',
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              status: 'error',
              label: TOOL_LABELS[part.toolName] ?? part.toolName,
              detail: errMsg,
            });
          }
        }

        debugSession.finish('complete');
        const response = await result.response;
        prevMessages = response.messages;
        const finishReason = await result.finishReason;
        const usage = await result.usage;
        debugSession.logFullResponse(finishReason);
        tracker.addStep({ model, provider, usage });

        // Normalize filenames
        for (const key of Object.keys(workingFiles)) {
          const normalized = key.replace(/^_/, '').toLowerCase();
          if (normalized !== key && !workingFiles[normalized]) {
            workingFiles[normalized] = workingFiles[key];
          }
        }

        if (workingFiles[homepage.filename]) break;

        allTextOutput += segmentTextBuffer;
        if (allTextOutput) {
          const extracted = extractHtmlFromText(allTextOutput);
          if (extracted) {
            workingFiles[homepage.filename] = extracted;
            break;
          }
        }

        if (finishReason !== 'length' && writeFilesAttempted) break;
      }

      await tracker.logFinalSummary();

      let homepageHtml = workingFiles[homepage.filename]
        ?? Object.values(workingFiles).find(v => v.includes('<!DOCTYPE') || v.includes('<html'));

      if (!homepageHtml && allTextOutput) {
        homepageHtml = extractHtmlFromText(allTextOutput) ?? undefined;
      }

      if (homepageHtml) {
        const singleFileMap = { [homepage.filename]: homepageHtml };
        validateBlocks(singleFileMap);
        homepageHtml = singleFileMap[homepage.filename];

        // Persist homepage to generation state
        if (conversationId) {
          await prisma.generationState.update({
            where: { conversationId },
            data: {
              phase: 'homepage-complete',
              completedPages: { [homepage.filename]: homepageHtml },
            },
          }).catch(() => {});
        }

        sendEvent({
          type: 'homepage-status',
          status: 'complete',
          html: homepageHtml,
          filename: homepage.filename,
        });
      } else {
        sendEvent({
          type: 'homepage-status',
          status: 'error',
          error: 'Failed to generate homepage — model did not produce valid HTML',
        });
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        // Client disconnected
      } else {
        console.error('Homepage generation failed:', err);
        sendEvent({
          type: 'homepage-status',
          status: 'error',
          error: err instanceof Error ? err.message : 'Homepage generation failed',
        });
      }
    }

    writer.close().catch(() => {});
  })();

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
```

**Step 2: Verify build compiles**

Run: `npm run build 2>&1 | tail -20`
Expected: No TypeScript errors.

**Step 3: Commit**

```bash
git add src/app/api/blueprint/homepage/route.ts
git commit -m "feat: add homepage generation API route

Generates homepage (index.html) in full creative mode using the isSinglePage
path — inline header/footer, full design quality prompts. Streams progress
via SSE. Returns complete homepage HTML for style digest extraction."
```

---

### Task 4: Add Style Digest to Components Prompt

**Files:**
- Modify: `src/lib/blueprint/prompts/components-system-prompt.ts:5`
- Modify: `src/app/api/blueprint/components/route.ts:14,22,35,67`

**Step 1: Update `getComponentsSystemPrompt` to accept style digest**

In `src/lib/blueprint/prompts/components-system-prompt.ts`, update the function signature and add the digest block:

```typescript
// Line 5 — update function signature:
// FROM: export function getComponentsSystemPrompt(blueprint: Blueprint): string {
// TO:
export function getComponentsSystemPrompt(blueprint: Blueprint, styleDigest?: string): string {
```

Add the style digest block inside the returned string, right after the `</site_info>` block (after line 63):

```typescript
// After the siteFactsBlock (line 64), before <navigation> (line 65), add:
const styleDigestBlock = styleDigest
  ? `\n<style_digest>
The homepage has already been generated. Match its visual vocabulary exactly — use the same typography scale, color application, spacing rhythm, button styles, and visual treatments described below:

${styleDigest}

Your header and footer must feel like they belong on this homepage.
</style_digest>\n`
  : '';

// Insert ${styleDigestBlock} between ${siteFactsBlock} and the <navigation> block
```

**Step 2: Update components route to accept and pass style digest**

In `src/app/api/blueprint/components/route.ts`:

```typescript
// Line 14-22: add styleDigest to request body interface
interface ComponentsRequestBody {
  blueprint: Blueprint;
  provider: string;
  model: string;
  maxOutputTokens?: number;
  conversationId?: string;
  imageProvider?: 'pexels' | 'together';
  imageModel?: string;
  styleDigest?: string; // ADD
}

// Line 35: destructure styleDigest
const { blueprint, provider, model, maxOutputTokens: clientMaxTokens, conversationId, styleDigest } = body;

// Line 67: pass styleDigest to prompt builder
// FROM: const systemPrompt = getComponentsSystemPrompt(blueprint);
// TO:
const systemPrompt = getComponentsSystemPrompt(blueprint, styleDigest);
```

**Step 3: Verify build compiles**

Run: `npm run build 2>&1 | tail -20`

**Step 4: Commit**

```bash
git add src/lib/blueprint/prompts/components-system-prompt.ts src/app/api/blueprint/components/route.ts
git commit -m "feat: pass style digest to components generation

Components prompt now receives the homepage style digest so header/footer
match the visual vocabulary established by the homepage."
```

---

### Task 5: Add Style Digest to Page Prompt

**Files:**
- Modify: `src/lib/blueprint/prompts/page-system-prompt.ts:27-32`
- Modify: `src/app/api/blueprint/pages/route.ts:294`

**Step 1: Update `getPageSystemPrompt` to accept style digest**

In `src/lib/blueprint/prompts/page-system-prompt.ts`, update the function signature (line 27):

```typescript
// FROM:
export function getPageSystemPrompt(
  blueprint: Blueprint,
  page: BlueprintPage,
  headTags?: string,
  sharedAssets?: { stylesCss?: string; scriptsJs?: string },
): string {

// TO:
export function getPageSystemPrompt(
  blueprint: Blueprint,
  page: BlueprintPage,
  headTags?: string,
  sharedAssets?: { stylesCss?: string; scriptsJs?: string },
  styleDigest?: string,
): string {
```

Add the style digest block inside the returned string. Insert it right before `<creative_direction>` (before line 205):

```typescript
// Build the block conditionally:
const styleDigestBlock = styleDigest
  ? `<style_digest>
The homepage has already been generated. Match its visual vocabulary exactly. Use the same typography scale, color application patterns, spacing rhythm, and component styles described below. Your page should feel like it belongs to the same site — consistent but not identical. Adapt the patterns to this page's unique content.

${styleDigest}
</style_digest>

`
  : '';

// Insert ${styleDigestBlock} before ${BLUEPRINT_DESIGN_QUALITY_SECTION} in the template string
```

**Step 2: Update pages route to accept and pass style digest**

In `src/app/api/blueprint/pages/route.ts`:

```typescript
// Line 130-142: add styleDigest to request body interface
interface PagesRequestBody {
  // ... existing fields ...
  styleDigest?: string; // ADD
}

// Line 154-155: destructure styleDigest
const { conversationId, provider, model, maxOutputTokens: clientMaxTokens, headTags, stylesCss, scriptsJs, skipPages, styleDigest } = body;

// Line 294: pass styleDigest to getPageSystemPrompt
// FROM: const systemPrompt = getPageSystemPrompt(blueprint!, page, headTags, sharedAssets);
// TO:
const systemPrompt = getPageSystemPrompt(blueprint!, page, headTags, sharedAssets, styleDigest);
```

**Step 3: Verify build compiles**

Run: `npm run build 2>&1 | tail -20`

**Step 4: Commit**

```bash
git add src/lib/blueprint/prompts/page-system-prompt.ts src/app/api/blueprint/pages/route.ts
git commit -m "feat: pass style digest to page generation

Each page's system prompt now includes the homepage style digest so all
pages match the visual vocabulary established by the homepage."
```

---

### Task 6: Update Client Orchestration — Homepage Phase

**Files:**
- Modify: `src/hooks/useBlueprintGeneration.ts`

This is the largest change. The `approveAndGenerate` function (line 777-858) and `resumeFromState` function (line 860-961) need to be updated to include the homepage generation phase.

**Step 1: Add `'generating-homepage'` to `BlueprintPhase` type**

```typescript
// Line 8-17: add 'generating-homepage' after 'awaiting-approval'
export type BlueprintPhase =
  | 'idle'
  | 'generating-blueprint'
  | 'awaiting-approval'
  | 'generating-homepage'  // ADD
  | 'generating-components'
  | 'generating-assets'
  | 'generating-pages'
  | 'generating-site'
  | 'complete'
  | 'error';
```

**Step 2: Add `'homepage'` to `resolveStepModel` step type**

```typescript
// Line 35: update the step union type
resolveStepModel: (step: 'planning' | 'research' | 'components' | 'assets' | 'pages' | 'homepage') => {
```

**Step 3: Add `homepageHtml` state and `styleDigest` ref**

Add after line 149 (the `blueprintStreamingCodeRef` line):

```typescript
const [homepageHtml, setHomepageHtml] = useState<string | null>(null);
const styleDigestRef = useRef<string | null>(null);
```

Update `reset` callback to clear these:

```typescript
// In the reset callback (line 226-243), add:
setHomepageHtml(null);
styleDigestRef.current = null;
```

**Step 4: Add `generateHomepage` function**

Add a new function after `generateComponents` (after line 416):

```typescript
const generateHomepage = useCallback(async (
  activeBlueprint: Blueprint,
  conversationId: string,
  headTags?: string,
  sharedAssets?: { stylesCss: string; scriptsJs: string } | null,
): Promise<string | null> => {
  const stepModel = resolveStepModel('homepage') ?? resolveStepModel('pages');
  if (!stepModel) {
    setError('No provider or model selected');
    setPhase('error');
    return null;
  }

  setPhase('generating-homepage');
  setError(null);

  const controller = abortControllerRef.current ?? new AbortController();

  try {
    const response = await fetch('/api/blueprint/homepage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversationId,
        provider: stepModel.provider,
        model: stepModel.model,
        maxOutputTokens: stepModel.maxOutputTokens,
        blueprint: activeBlueprint,
        headTags,
        stylesCss: sharedAssets?.stylesCss,
        scriptsJs: sharedAssets?.scriptsJs,
        imageProvider,
        imageModel,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: 'Homepage generation failed' }));
      throw new Error(data.error || 'Homepage generation failed');
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response stream');

    const decoder = new TextDecoder();
    let buffer = '';
    let resultHtml: string | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const jsonStr = line.slice(6).trim();
        if (!jsonStr) continue;

        try {
          const event = JSON.parse(jsonStr);
          if (event.type === 'homepage-status') {
            if (event.status === 'complete' && event.html) {
              resultHtml = event.html;
              setHomepageHtml(event.html);
              filesAccumulatorRef.current[event.filename ?? 'index.html'] = event.html;
            } else if (event.status === 'error') {
              throw new Error(event.error || 'Homepage generation failed');
            }
          }
        } catch (parseErr) {
          if (parseErr instanceof SyntaxError) continue;
          throw parseErr;
        }
      }
    }

    return resultHtml;
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') return null;
    setError(err instanceof Error ? err.message : 'Homepage generation failed');
    setPhase('error');
    return null;
  }
}, [resolveStepModel, imageProvider, imageModel]);
```

**Step 5: Add `extractDigest` helper**

Add after `generateHomepage`:

```typescript
const extractDigest = useCallback(async (
  html: string,
  conversationId: string,
): Promise<string | null> => {
  const stepModel = resolveStepModel('homepage') ?? resolveStepModel('pages');
  if (!stepModel) return null;

  try {
    const response = await fetch('/api/blueprint/style-digest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        homepageHtml: html,
        provider: stepModel.provider,
        model: stepModel.model,
        conversationId,
      }),
    });

    if (!response.ok) return null;
    const data = await response.json();
    return data.digest ?? null;
  } catch {
    return null; // Non-fatal — pages still work without digest
  }
}, [resolveStepModel]);
```

**Step 6: Update `approveAndGenerate` for multi-page flow**

Replace the multi-page branch (lines 800-857) in `approveAndGenerate`:

```typescript
} else {
  setPhase('generating-site');

  const controller = new AbortController();
  abortControllerRef.current = controller;

  // Step 1: Generate homepage (sequential, full creative mode)
  const homepageResult = await generateHomepage(activeBlueprint, conversationId, sharedStyles.headTags);
  if (abortControllerRef.current?.signal.aborted) return;

  // Step 2: Extract style digest from homepage
  let styleDigest: string | null = null;
  if (homepageResult) {
    styleDigest = await extractDigest(homepageResult, conversationId);
    styleDigestRef.current = styleDigest;
  }
  if (abortControllerRef.current?.signal.aborted) return;

  // Step 3: Generate components (header/footer) with style digest context
  const components = await generateComponentsWithRetry(activeBlueprint, conversationId);
  if (abortControllerRef.current?.signal.aborted) return;

  // Step 4: Generate shared assets (styles.css + scripts.js)
  const assets = await generateAssets(activeBlueprint, components, conversationId);
  if (abortControllerRef.current?.signal.aborted) return;

  // Step 5: Update headTags
  let headTags = sharedStyles.headTags;
  if (assets) {
    sharedStyles.stylesCss = assets.stylesCss;
    sharedStylesRef.current = { ...sharedStyles, stylesCss: assets.stylesCss };
    headTags += '\n<script src="scripts.js" defer></script>';
  }

  // Step 6: Generate remaining pages (parallel, skip homepage)
  const skipPages = [homepage?.filename ?? 'index.html'].filter(f =>
    filesAccumulatorRef.current[f],
  );
  await generatePages(conversationId, activeBlueprint, components ? components : undefined, headTags, skipPages, 0, assets);

  // Merge components into page HTML (replace placeholders)
  // Note: homepage has inline header/footer, so mergeComponentsIntoPages only affects pages 2-N
  const hasPages = Object.keys(filesAccumulatorRef.current).length > 0;
  if (components && hasPages) {
    const merged = mergeComponentsIntoPages(filesAccumulatorRef.current, components);
    filesAccumulatorRef.current = merged;
    let files = { ...merged };
    if (sharedStylesRef.current) {
      files['styles.css'] = sharedStylesRef.current.stylesCss;
    }
    if (assets?.scriptsJs) {
      files['scripts.js'] = assets.scriptsJs;
    }
    files = removeDeadNavLinks(files);
    onFilesReady(files);
    setPhase('complete');
  } else if (hasPages) {
    let files = { ...filesAccumulatorRef.current };
    if (sharedStylesRef.current) {
      files['styles.css'] = sharedStylesRef.current.stylesCss;
    }
    if (assets?.scriptsJs) {
      files['scripts.js'] = assets.scriptsJs;
    }
    files = removeDeadNavLinks(files);
    onFilesReady(files);
    setError('Shared components failed to generate — pages delivered without shared header/footer');
    setPhase('complete');
  } else {
    setError('Site generation failed');
    setPhase('error');
  }
}
```

Note: The `generateComponents` call needs updating to pass `styleDigest`. Update the fetch body in `generateComponents` (line 328-341) to include `styleDigest: styleDigestRef.current`:

```typescript
// In generateComponents, update the fetch body to include styleDigest
body: JSON.stringify({
  blueprint: activeBlueprint,
  provider: stepModel.provider,
  model: stepModel.model,
  maxOutputTokens: stepModel.maxOutputTokens,
  conversationId,
  imageProvider,
  imageModel,
  styleDigest: styleDigestRef.current, // ADD
}),
```

Similarly, update the `generatePages` fetch body (line 484-503) to include `styleDigest`:

```typescript
// In generatePages, update the fetch body to include styleDigest
body: JSON.stringify({
  conversationId,
  provider: stepModel.provider,
  model: stepModel.model,
  maxOutputTokens: stepModel.maxOutputTokens,
  blueprint: activeBlueprint,
  headerHtml: sharedHtml?.headerHtml,
  footerHtml: sharedHtml?.footerHtml,
  headTags,
  skipPages,
  stylesCss: sharedAssets?.stylesCss,
  scriptsJs: sharedAssets?.scriptsJs,
  imageProvider,
  imageModel,
  styleDigest: styleDigestRef.current, // ADD
}),
```

**Step 7: Update `resumeFromState` similarly**

The `resumeFromState` function needs the same homepage-first flow when resuming from early phases. For the `!state.componentHtml` branch (line 886), add homepage generation before components. The key change: check if homepage already exists in `completedPages` — if so, extract digest from it; if not, generate it.

**Step 8: Export `homepageHtml` from the hook return**

```typescript
// In the return object (line 975-995), add:
homepageHtml,
```

**Step 9: Verify build compiles**

Run: `npm run build 2>&1 | tail -20`

**Step 10: Commit**

```bash
git add src/hooks/useBlueprintGeneration.ts
git commit -m "feat: add homepage-first orchestration to blueprint generation

Multi-page blueprint flow now:
1. Generates homepage in full creative mode (sequential)
2. Extracts style digest from homepage HTML
3. Generates components with style digest context
4. Generates remaining pages with style digest context

Homepage is skipped from the parallel page batch."
```

---

### Task 7: Create Style Digest API Route

**Files:**
- Create: `src/app/api/blueprint/style-digest/route.ts`

**Step 1: Create the endpoint**

```typescript
import { NextResponse } from 'next/server';
import { extractStyleDigest } from '@/lib/blueprint/extract-style-digest';

interface StyleDigestRequestBody {
  homepageHtml: string;
  provider: string;
  model: string;
  conversationId?: string;
}

export async function POST(req: Request) {
  let body: StyleDigestRequestBody;
  try {
    body = await req.json() as StyleDigestRequestBody;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { homepageHtml, provider, model, conversationId } = body;

  if (!homepageHtml || !provider || !model) {
    return NextResponse.json({ error: 'homepageHtml, provider, and model are required' }, { status: 400 });
  }

  try {
    const digest = await extractStyleDigest(homepageHtml, provider, model, conversationId);
    return NextResponse.json({ digest });
  } catch (err: unknown) {
    console.error('Style digest extraction failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Style digest extraction failed' },
      { status: 500 },
    );
  }
}
```

**Step 2: Verify build compiles**

Run: `npm run build 2>&1 | tail -20`

**Step 3: Commit**

```bash
git add src/app/api/blueprint/style-digest/route.ts
git commit -m "feat: add style digest extraction API route

Simple POST endpoint that takes homepage HTML and returns a concrete
style digest extracted by AI (~1-2K tokens)."
```

---

### Task 8: Update UI Progress for Homepage Phase

**Files:**
- Modify: `src/features/blueprint/page-progress.tsx`

**Step 1: Add homepage status prop and display**

```typescript
// Update PageProgressProps interface (line 7-13):
interface PageProgressProps {
  pageStatuses: PageGenerationStatus[];
  componentsStatus?: 'generating' | 'complete';
  assetsStatus?: 'generating' | 'complete';
  homepageStatus?: 'generating' | 'complete'; // ADD
  isRetrying?: boolean;
  onCancel?: () => void;
}

// Update function signature:
export function PageProgress({ pageStatuses, componentsStatus, assetsStatus, homepageStatus, isRetrying, onCancel }: PageProgressProps) {

// Update progress calculation (lines 27-36) to include homepage step:
const hasHomepageStep = !!homepageStatus;
const homepageComplete = homepageStatus === 'complete';
// ... update extraSteps and extraCompleted:
const extraSteps = (hasHomepageStep ? 1 : 0) + (hasComponentsStep ? 1 : 0) + (hasAssetsStep ? 1 : 0);
const extraCompleted = (homepageComplete ? 1 : 0) + (componentsComplete ? 1 : 0) + (assetsComplete ? 1 : 0);

// Update the status text (lines 43-52) to include homepage:
{hasHomepageStep && !homepageComplete
  ? 'Generating homepage as design anchor...'
  : hasComponentsStep && !componentsComplete
    ? 'Preparing shared styles & components...'
    : // ... rest unchanged

// Add homepage step in the steps list, before components step (before line 80):
{hasHomepageStep && (
  <div
    className="flex items-center gap-2"
    style={{ animation: 'fadeSlideIn 0.3s ease-out both' }}
  >
    {homepageStatus === 'generating' ? (
      <Loader2 className="size-3.5 animate-spin text-primary" />
    ) : (
      <Check className="size-3.5 text-green-600 dark:text-green-500" style={{ animation: 'fadeSlideIn 0.2s ease-out' }} />
    )}
    <span
      className={`text-xs ${
        homepageComplete
          ? 'text-muted-foreground'
          : 'text-foreground font-medium'
      }`}
    >
      Homepage (design anchor)
    </span>
  </div>
)}
```

**Step 2: Update Builder.tsx to pass `homepageStatus` prop**

In `src/components/Builder.tsx`, find where `PageProgress` is rendered and add the `homepageStatus` prop. Derive it from the blueprint generation phase:

```typescript
homepageStatus={
  blueprintPhase === 'generating-homepage' ? 'generating'
    : ['generating-components', 'generating-assets', 'generating-pages', 'complete'].includes(blueprintPhase) ? 'complete'
    : undefined
}
```

**Step 3: Verify build compiles**

Run: `npm run build 2>&1 | tail -20`

**Step 4: Commit**

```bash
git add src/features/blueprint/page-progress.tsx src/components/Builder.tsx
git commit -m "feat: show homepage generation phase in progress UI

PageProgress now shows 'Homepage (design anchor)' step with spinner/check
icon. Appears before the components step in the progress list."
```

---

### Task 9: Update `use-model-selection.ts` for Homepage Step

**Files:**
- Modify: `src/features/builder/hooks/use-model-selection.ts`

**Step 1: Add `'homepage'` to the step type**

Check the `resolveStepModel` function and ensure it handles the `'homepage'` step. If it falls through to a default, it should use the `pages` config or the primary model. The `'homepage'` step should use the same model config as `'pages'` unless explicitly overridden.

Look at how `resolveStepModel` is implemented — if it has an explicit mapping, add `'homepage'` that falls through to `'pages'` config.

**Step 2: Verify build compiles**

Run: `npm run build 2>&1 | tail -20`

**Step 3: Commit**

```bash
git add src/features/builder/hooks/use-model-selection.ts
git commit -m "feat: add homepage step to model selection

resolveStepModel now handles 'homepage' step, defaulting to pages config."
```

---

### Task 10: Integration Test — Manual Verification

**Step 1: Start dev server**

Run: `npm run dev`

**Step 2: Test multi-page blueprint flow**

1. Create a new conversation
2. Enter a multi-page prompt (e.g., "Build a restaurant website with home, menu, about, and contact pages")
3. Select blueprint mode
4. Approve the blueprint
5. Verify the progress UI shows:
   - "Homepage (design anchor)" with spinner → check
   - "Shared styles, header & footer" with spinner → check
   - "Shared CSS & scripts" with spinner → check
   - Individual pages (menu.html, about.html, contact.html) — NOT index.html
6. Verify the final site has consistent visual style across all pages

**Step 3: Test single-page blueprint flow**

1. Create a prompt that generates a single-page blueprint
2. Verify the flow is unchanged (no homepage step shown)

**Step 4: Verify the homepage has inline header/footer**

Check the generated `index.html` — it should have actual `<header>` and `<footer>` HTML, not `<!-- @component:header -->` placeholders.

**Step 5: Commit all remaining fixes**

```bash
git add -A
git commit -m "fix: integration fixes for homepage-anchored blueprint generation"
```
