# Blueprint Page Deduplication Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate ~87KB (24%) of duplication in multi-page blueprint sites by adding a shared assets AI generation step, improving page prompts, and adding a post-processing pipeline.

**Architecture:** New sequential step (Components → Shared Assets → Pages), updated page prompts referencing shared CSS/JS, 4-pass server-side post-processing after page generation. No test framework exists — verify via `npm run build` and manual testing.

**Tech Stack:** Next.js App Router, Vercel AI SDK 6, Cheerio (DOM parsing), TypeScript

---

### Task 1: Add `assets` to BlueprintStep type and model config

**Files:**
- Modify: `src/features/settings/use-blueprint-model-config.ts`

**Step 1: Add 'assets' to the BlueprintStep type**

In `src/features/settings/use-blueprint-model-config.ts:9`, change:
```typescript
export type BlueprintStep = 'discovery' | 'planning' | 'research' | 'components' | 'pages';
```
to:
```typescript
export type BlueprintStep = 'discovery' | 'planning' | 'research' | 'components' | 'assets' | 'pages';
```

Add `assets: null` to `DEFAULT_CONFIG` at line 24-30:
```typescript
const DEFAULT_CONFIG: BlueprintStepModels = {
  discovery: null,
  planning: null,
  research: null,
  components: null,
  assets: null,
  pages: null,
};
```

Add `assets: parsed.assets ?? null` to `loadConfig()` at line 44-50.

**Step 2: Add 'generating-assets' to BlueprintPhase**

In `src/hooks/useBlueprintGeneration.ts:8-16`, add `'generating-assets'` after `'generating-components'`:
```typescript
export type BlueprintPhase =
  | 'idle'
  | 'generating-blueprint'
  | 'awaiting-approval'
  | 'generating-components'
  | 'generating-assets'
  | 'generating-pages'
  | 'generating-site'
  | 'complete'
  | 'error';
```

**Step 3: Verify it builds**

Run: `npm run build`
Expected: Build succeeds (the new step/phase are additive, nothing references them yet).

**Step 4: Commit**

```bash
git add src/features/settings/use-blueprint-model-config.ts src/hooks/useBlueprintGeneration.ts
git commit -m "feat: add 'assets' blueprint step type and 'generating-assets' phase"
```

---

### Task 2: Create the Shared Assets system prompt

**Files:**
- Create: `src/lib/blueprint/prompts/assets-system-prompt.ts`

**Step 1: Create the prompt file**

Create `src/lib/blueprint/prompts/assets-system-prompt.ts`:

```typescript
import type { Blueprint } from '@/lib/blueprint/types';

interface ComponentHtml {
  headerHtml: string;
  footerHtml: string;
}

/**
 * System prompt for the shared assets generation step.
 * Generates styles.css (utility classes, animations, component styles)
 * and scripts.js (mobile menu, scroll reveal, interactions).
 *
 * Runs after components step so it can see the actual header/footer HTML
 * and generate matching styles and scripts.
 */
export function getAssetsSystemPrompt(
  blueprint: Blueprint,
  componentHtml?: ComponentHtml | null,
): string {
  const { designSystem, pages, contentStrategy } = blueprint;

  // Collect all interactive elements and motion intents from all pages
  const interactiveElements = new Set<string>();
  const motionIntents = new Set<string>();
  const sectionTypes = new Set<string>();

  for (const page of pages) {
    for (const section of page.sections) {
      if (section.interactiveElement && section.interactiveElement !== 'none') {
        interactiveElements.add(section.interactiveElement);
      }
      if (section.motionIntent && section.motionIntent !== 'none') {
        motionIntents.add(section.motionIntent);
      }
      if (section.sectionType && section.sectionType !== 'custom') {
        sectionTypes.add(section.sectionType);
      }
    }
  }

  const componentBlock = componentHtml
    ? `<component_html>
The shared header and footer HTML have already been generated. Analyze them to understand
what CSS classes and JS functionality they need:

HEADER:
${componentHtml.headerHtml}

FOOTER:
${componentHtml.footerHtml}
</component_html>`
    : '';

  const pagesOverview = pages
    .map(p => {
      const interactions = p.sections
        .filter(s => s.interactiveElement && s.interactiveElement !== 'none')
        .map(s => s.interactiveElement);
      const motions = p.sections
        .filter(s => s.motionIntent && s.motionIntent !== 'none')
        .map(s => s.motionIntent);
      const extras: string[] = [];
      if (interactions.length) extras.push(`interactions: ${interactions.join(', ')}`);
      if (motions.length) extras.push(`motion: ${motions.join(', ')}`);
      return `- ${p.filename}: ${p.purpose}${extras.length ? ` [${extras.join('; ')}]` : ''}`;
    })
    .join('\n');

  return `You are generating shared CSS and JavaScript assets for a multi-page website. These files will be included in every page via <link> and <script> tags. Your goal is to CENTRALIZE all common styles and scripts so individual pages are lightweight.

<design_system>
CSS Custom Properties (already defined as :root variables — include them in styles.css):
  --color-primary: ${designSystem.primaryColor};
  --color-secondary: ${designSystem.secondaryColor};
  --color-accent: ${designSystem.accentColor};
  --color-bg: ${designSystem.backgroundColor};
  --color-surface: ${designSystem.surfaceColor};
  --color-text: ${designSystem.textColor};
  --color-text-muted: ${designSystem.textMutedColor};
  --font-heading: '${designSystem.headingFont}', sans-serif;
  --font-body: '${designSystem.bodyFont}', sans-serif;
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
  --shadow-md: 0 4px 6px -1px rgba(0,0,0,0.1);
  --shadow-lg: 0 10px 15px -3px rgba(0,0,0,0.1);
  --radius: ${designSystem.borderRadius};
  --transition: all 0.2s ease-in-out;

Mood: ${designSystem.mood}
Surface Treatment: ${designSystem.surfaceTreatment || 'clean'}
</design_system>

${componentBlock}

<site_overview>
Site: ${blueprint.siteName} — ${blueprint.siteDescription}
Tone: ${contentStrategy.tone}
Pages:
${pagesOverview}
${interactiveElements.size > 0 ? `\nInteractive elements needed across pages: ${[...interactiveElements].join(', ')}` : ''}
${motionIntents.size > 0 ? `\nMotion/animation intents across pages: ${[...motionIntents].join(', ')}` : ''}
</site_overview>

<output_format>
Call writeFiles with exactly two files:
- "styles.css" — the shared stylesheet
- "scripts.js" — the shared JavaScript

You MUST use the writeFiles tool. Do NOT output code as text.
</output_format>

<styles_css_requirements>
The styles.css file must contain ALL of the following:

1. **:root variables** — all CSS custom properties from the design system above
2. **Base styles** — body, heading (h1-h6), link, and button base styles using the design tokens
3. **Utility classes** — reusable classes that pages will reference instead of inline styles:
   - Text color utilities: .text-primary, .text-muted, .text-accent, etc. using var(--color-*)
   - Background utilities: .bg-primary, .bg-surface, .bg-accent, etc.
   - Font utilities: .font-heading, .font-body
   - Common patterns you see repeated (analyze the component HTML for patterns)
4. **Animation keyframes** — all @keyframes needed by the site:
   - fadeIn, fadeInUp, fadeInDown, slideUp, slideDown (standard entrance animations)
   - Any custom animations needed for the interactive elements: ${[...interactiveElements].join(', ') || 'none'}
5. **Scroll reveal classes** — .reveal (hidden state) and .reveal.active (visible state) for scroll-triggered animations with configurable delay via CSS custom properties
6. **Component styles** — styles for common UI patterns across pages:
   - Card styles (.card, .card-hover)
   - Button variants (.btn, .btn-primary, .btn-outline, .btn-accent)
   - Section spacing (.section, .section-lg)
   - Container widths
7. **Header/footer styles** — styles that the shared components need (analyze the component HTML)

Keep the CSS clean, well-organized with comments separating sections. Use the design tokens everywhere — no hardcoded colors.
Do NOT include Tailwind CDN or Google Fonts imports — those are handled separately in the <head> tags.
</styles_css_requirements>

<scripts_js_requirements>
The scripts.js file must contain ALL of the following:

1. **Mobile menu toggle** — hamburger menu open/close with:
   - Toggle button click handler (querySelector for common patterns: [data-menu-toggle], .mobile-menu-btn)
   - Aria-expanded attribute toggling
   - Body scroll lock when menu is open
   - Close on escape key
   - Close on click outside
   - Close on window resize to desktop
2. **Scroll reveal system** — IntersectionObserver-based reveal:
   - Target elements with class .reveal or [data-reveal]
   - Add .active class when element enters viewport
   - Support staggered delays via data-reveal-delay="100" attribute
   - Configurable threshold (default 0.1)
   - Only trigger once (unobserve after reveal)
3. **Smooth scroll** — for anchor links (#section-id)
   - Account for fixed header height
4. **Active nav highlighting** — mark current page in navigation
   - Compare current filename to nav link hrefs
   - Add .active class to matching link
${interactiveElements.has('accordion') ? `5. **Accordion** — toggle FAQ/accordion items:
   - Click handler for [data-accordion-trigger]
   - Toggle [data-accordion-content] visibility with slide animation
   - Toggle aria-expanded
   - Optional: close others when one opens (data-accordion-group)` : ''}
${interactiveElements.has('tabs') ? `${interactiveElements.has('accordion') ? '6' : '5'}. **Tabs** — tab switching:
   - Click handler for [data-tab-trigger]
   - Show/hide [data-tab-content] panels
   - Update aria-selected
   - Keyboard arrow key navigation` : ''}
${interactiveElements.has('counter-animation') ? `${interactiveElements.has('accordion') && interactiveElements.has('tabs') ? '7' : interactiveElements.has('accordion') || interactiveElements.has('tabs') ? '6' : '5'}. **Counter animation** — animate numbers:
   - Target elements with [data-count-to] attribute
   - Animate from 0 to target value on scroll into view
   - Format with locale-appropriate separators
   - Duration ~2s with easeOutExpo curve` : ''}

Wrap everything in a DOMContentLoaded listener. Use event delegation where possible.
All selectors should use data-* attributes for JS hooks (not classes) to separate styling from behavior.
The code must be defensive — check for element existence before adding listeners.
</scripts_js_requirements>

<rules>
1. You MUST call writeFiles to deliver output — do NOT output code as text.
2. The styles.css MUST start with the :root variables block.
3. Do NOT include any HTML, <!DOCTYPE>, or <script> tags inside the CSS file.
4. Do NOT include any <style> tags inside the JavaScript file.
5. The JavaScript must work standalone — no external dependencies.
6. Use semantic class names (not .s1, .s2 — use .reveal, .card, .btn-primary, etc.).
7. Keep the files focused — only include what the site actually needs based on the page specs and component HTML.
</rules>`;
}
```

**Step 2: Verify it builds**

Run: `npm run build`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add src/lib/blueprint/prompts/assets-system-prompt.ts
git commit -m "feat: add shared assets system prompt for styles.css and scripts.js generation"
```

---

### Task 3: Create the Shared Assets API route

**Files:**
- Create: `src/app/api/blueprint/assets/route.ts`

**Step 1: Create the route**

Model this after `src/app/api/blueprint/components/route.ts`. The route:
- Accepts `{ blueprint, provider, model, maxOutputTokens, conversationId, componentHtml? }`
- Calls `getAssetsSystemPrompt(blueprint, componentHtml)`
- Uses `createWebsiteTools({})` (same as components)
- Streams tool activity SSE events
- On completion, extracts `styles.css` and `scripts.js` from `workingFiles`
- Sends `{ type: 'assets-status', status: 'complete', stylesCss, scriptsJs }` or error
- Persists to `generationState.sharedStyles` (expand JSON to include `stylesCss` and `scriptsJs`)

Create `src/app/api/blueprint/assets/route.ts`:

```typescript
import { stepCountIs, streamText } from 'ai';
import { resolveApiKey } from '@/lib/keys/key-manager';
import { PROVIDERS } from '@/lib/providers/registry';
import { getAssetsSystemPrompt } from '@/lib/blueprint/prompts/assets-system-prompt';
import { ChatRequestError } from '@/lib/chat/errors';
import { resolveMaxOutputTokens } from '@/lib/chat/constants';
import { createDebugSession } from '@/lib/chat/stream-debug';
import { prisma } from '@/lib/db/prisma';
import { createWebsiteTools } from '@/lib/chat/tools';
import { TOOL_LABELS, summarizeToolInput, summarizeToolOutput } from '@/lib/blueprint/stream-utils';
import type { Blueprint } from '@/lib/blueprint/types';
import { createOpenRouterModel } from '@/lib/providers/configs/openrouter';

interface AssetsRequestBody {
  blueprint: Blueprint;
  provider: string;
  model: string;
  maxOutputTokens?: number;
  conversationId?: string;
  componentHtml?: { headerHtml: string; footerHtml: string } | null;
}

export async function POST(req: Request) {
  let body: AssetsRequestBody;
  try {
    body = await req.json() as AssetsRequestBody;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { blueprint, provider, model, maxOutputTokens: clientMaxTokens, conversationId, componentHtml } = body;

  if (!blueprint || !provider || !model) {
    return new Response(JSON.stringify({ error: 'blueprint, provider, and model are required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
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
  const systemPrompt = getAssetsSystemPrompt(blueprint, componentHtml);
  const modelInstance = provider === 'OpenRouter'
    ? createOpenRouterModel(apiKey, model, 'none')
    : providerConfig.createModel(apiKey, model);
  const userPrompt = `Generate the shared styles.css and scripts.js for the "${blueprint.siteName}" website.`;
  const abortSignal = req.signal;

  const { readable, writable } = new TransformStream();
  const encoder = new TextEncoder();
  const writer = writable.getWriter();

  function sendEvent(data: Record<string, unknown>) {
    writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`)).catch(() => {});
  }

  (async () => {
    sendEvent({ type: 'assets-status', status: 'generating' });

    try {
      const debugSession = createDebugSession({
        scope: 'blueprint-assets',
        model,
        provider,
        conversationId,
      });
      debugSession.logPrompt({
        systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        maxOutputTokens,
      });

      const { tools, workingFiles } = createWebsiteTools({});
      const toolCallNames = new Map<string, string>();
      let hasFileOutput = false;
      const FILE_PRODUCING_TOOLS = new Set(['writeFile', 'writeFiles']);

      const result = streamText({
        model: modelInstance,
        system: systemPrompt,
        prompt: userPrompt,
        maxOutputTokens,
        tools,
        stopWhen: stepCountIs(8),
        abortSignal,
      });

      for await (const part of result.fullStream) {
        if (part.type === 'text-delta') {
          debugSession.logDelta(part.text);
        } else if (part.type === 'tool-input-delta') {
          debugSession.logToolInputDelta({ toolCallId: part.id, delta: part.delta });
        } else if (part.type === 'tool-input-start') {
          toolCallNames.set(part.id, part.toolName);
          debugSession.logToolStarting({ toolName: part.toolName, toolCallId: part.id });
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
          if (FILE_PRODUCING_TOOLS.has(part.toolName)) {
            const out = part.output as Record<string, unknown> | undefined;
            if (out && out.success !== false) hasFileOutput = true;
          }
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
      const finishReason = await result.finishReason;
      const usage = await result.usage;
      debugSession.logFullResponse(finishReason);
      debugSession.logGenerationSummary?.({
        finishReason,
        hasFileOutput,
        toolCallCount: toolCallNames.size,
        usage,
      });

      // Normalize filenames
      const normalizedFiles: Record<string, string> = {};
      for (const [key, value] of Object.entries(workingFiles)) {
        normalizedFiles[key.toLowerCase()] = value;
      }

      const stylesCss = normalizedFiles['styles.css'];
      const scriptsJs = normalizedFiles['scripts.js'];

      if (!stylesCss || !scriptsJs) {
        console.error('Assets generation did not produce styles.css and/or scripts.js. Available files:', Object.keys(workingFiles));
        sendEvent({
          type: 'assets-status',
          status: 'error',
          error: 'Failed to generate shared assets — model did not produce both files',
        });
      } else {
        // Persist shared assets to generation state
        if (conversationId) {
          await prisma.generationState.update({
            where: { conversationId },
            data: {
              phase: 'assets-complete',
              sharedStyles: {
                headTags: '', // Will be populated by caller with full headTags
                stylesCss,
                scriptsJs,
              },
            },
          }).catch(() => {});
        }

        sendEvent({
          type: 'assets-status',
          status: 'complete',
          stylesCss,
          scriptsJs,
        });
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        // Client disconnected
      } else {
        console.error('Assets generation failed:', err);
        sendEvent({
          type: 'assets-status',
          status: 'error',
          error: err instanceof Error ? err.message : 'Assets generation failed',
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

**Step 2: Verify it builds**

Run: `npm run build`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add src/app/api/blueprint/assets/route.ts
git commit -m "feat: add shared assets API route for styles.css and scripts.js generation"
```

---

### Task 4: Wire Shared Assets step into useBlueprintGeneration

**Files:**
- Modify: `src/hooks/useBlueprintGeneration.ts`

**Step 1: Add generateAssets callback**

After the `generateComponents` callback (~line 291-400), add a new `generateAssets` callback. Pattern it after `generateComponents`:

```typescript
const generateAssets = useCallback(async (
  activeBlueprint: Blueprint,
  componentHtml?: { headerHtml: string; footerHtml: string } | null,
  conversationId?: string,
): Promise<{ stylesCss: string; scriptsJs: string } | null> => {
  const stepModel = resolveStepModel('assets') ?? resolveStepModel('components');
  if (!stepModel) {
    setError('No provider or model selected for assets step');
    setPhase('error');
    return null;
  }

  if (!parallelModeRef.current) {
    setPhase('generating-assets');
  }
  setError(null);

  const controller = parallelModeRef.current
    ? abortControllerRef.current ?? new AbortController()
    : new AbortController();
  if (!parallelModeRef.current) {
    abortControllerRef.current = controller;
  }

  try {
    const response = await fetch('/api/blueprint/assets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        blueprint: activeBlueprint,
        provider: stepModel.provider,
        model: stepModel.model,
        maxOutputTokens: stepModel.maxOutputTokens,
        conversationId,
        componentHtml,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: 'Assets generation failed' }));
      throw new Error(data.error || 'Assets generation failed');
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response stream');

    const decoder = new TextDecoder();
    let buffer = '';
    let result: { stylesCss: string; scriptsJs: string } | null = null;

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
          if (event.type === 'assets-status') {
            if (event.status === 'complete' && event.stylesCss && event.scriptsJs) {
              result = { stylesCss: event.stylesCss, scriptsJs: event.scriptsJs };
            } else if (event.status === 'error') {
              throw new Error(event.error || 'Assets generation failed');
            }
          }
          // tool-activity events can be ignored or logged
        } catch (parseErr) {
          if (parseErr instanceof SyntaxError) continue;
          throw parseErr;
        }
      }
    }

    return result;
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') return null;
    console.warn('Assets generation failed, continuing with deterministic styles:', err);
    return null; // Non-fatal — fall back to deterministic styles
  }
}, [resolveStepModel]);
```

Note: The `resolveStepModel` call uses `'assets'` step. Since `resolveStepModel` in `useBlueprintGeneration` takes `'planning' | 'research' | 'components' | 'pages'`, update its type signature in the `UseBlueprintGenerationOptions` interface (line 34) to include `'assets'`:

```typescript
resolveStepModel: (step: 'planning' | 'research' | 'components' | 'assets' | 'pages') => {
```

**Step 2: Modify approveAndGenerate to run assets step**

In `approveAndGenerate` (line 666), change the multi-page flow from:
```typescript
const [components] = await Promise.all([
  generateComponentsWithRetry(activeBlueprint, conversationId),
  generatePages(conversationId, activeBlueprint, undefined, sharedStyles.headTags),
]);
```

To sequential: Components → Assets → Pages:
```typescript
// Step 1: Generate components (header/footer)
const components = await generateComponentsWithRetry(activeBlueprint, conversationId);

// Step 2: Generate shared assets (styles.css + scripts.js) — sees component HTML
const assets = await generateAssets(activeBlueprint, components, conversationId);

// Step 3: Update headTags to include scripts.js
let headTags = sharedStyles.headTags;
if (assets) {
  // Replace deterministic styles with AI-generated ones
  sharedStyles.stylesCss = assets.stylesCss;
  sharedStylesRef.current = { ...sharedStyles, stylesCss: assets.stylesCss };
  // Add scripts.js to head tags
  headTags += '\n<script src="scripts.js" defer></script>';
}

// Step 4: Generate pages (parallel, with shared context)
await generatePages(conversationId, activeBlueprint, components ? components : undefined, headTags);
```

Update the merge/delivery section to include `scripts.js`:
```typescript
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
}
```

Also update the "components failed but pages succeeded" path similarly.

**Step 3: Also update Builder.tsx if needed**

Check `src/components/Builder.tsx` where `resolveStepModel` is passed — it needs to handle the `'assets'` step. The existing pattern uses the blueprint model config's `resolveStepModel`. Since we added `'assets'` to `BlueprintStep`, the config hook already handles it. Just verify the binding in Builder.tsx passes through correctly.

**Step 4: Verify it builds**

Run: `npm run build`
Expected: Build succeeds.

**Step 5: Commit**

```bash
git add src/hooks/useBlueprintGeneration.ts src/components/Builder.tsx
git commit -m "feat: wire shared assets generation step into blueprint pipeline"
```

---

### Task 5: Update page system prompt to reference shared assets

**Files:**
- Modify: `src/lib/blueprint/prompts/page-system-prompt.ts`
- Modify: `src/app/api/blueprint/pages/route.ts`

**Step 1: Add sharedAssets parameter to getPageSystemPrompt**

Add `stylesCss` and `scriptsJs` optional parameters to `getPageSystemPrompt`:

```typescript
export function getPageSystemPrompt(
  blueprint: Blueprint,
  page: BlueprintPage,
  sharedHtml?: SharedHtml,
  headTags?: string,
  sharedAssets?: { stylesCss?: string; scriptsJs?: string },
): string {
```

**Step 2: Add shared assets reference blocks in the prompt**

After the `designSystemSection` block (around line 165), add:

```typescript
const sharedAssetsSection = sharedAssets?.stylesCss
  ? `<shared_styles_reference>
The shared styles.css contains these classes and utilities — USE THEM instead of inline styles or duplicate <style> blocks:

${sharedAssets.stylesCss}

RULES:
- Use these CSS classes on elements instead of inline style="" attributes
- Do NOT duplicate any CSS that already exists in styles.css (no duplicate :root, keyframes, or class definitions)
- Only add a <style> block for CSS that is UNIQUE to this specific page and not covered by styles.css
- Prefer Tailwind utilities + styles.css classes. Inline style="" should be a last resort.
</shared_styles_reference>`
  : '';

const sharedScriptsSection = sharedAssets?.scriptsJs
  ? `<shared_scripts_reference>
The shared scripts.js contains these JavaScript utilities — USE THEM instead of writing duplicate code:

${sharedAssets.scriptsJs}

RULES:
- Use data-reveal attribute for scroll animations (handled by scripts.js IntersectionObserver)
- Use data-reveal-delay="N" for staggered delays
- Use data-accordion-trigger / data-accordion-content for accordions
- Use data-tab-trigger / data-tab-content for tabs
- Use data-count-to="N" for counter animations
- Use data-menu-toggle for mobile menu triggers
- Do NOT write your own IntersectionObserver, hamburger menu JS, or scroll animation JS
- Only add a <script> block for JavaScript that is UNIQUE to this specific page
</shared_scripts_reference>`
  : '';
```

Insert these sections into the returned prompt string after `${designSystemSection}`.

**Step 3: Update requirement rules**

Change requirement2 (when headTags is present) to also mention scripts.js:
```typescript
const requirement2 = headTags
  ? '2. In <head>: charset, viewport, <title>, meta description, then the shared_head tags VERBATIM. Do NOT generate your own CSS custom properties, Tailwind CDN script, Google Fonts links, Tailwind config, or shared scripts — they are all provided in the shared head.'
  : `2. In <head>: charset, viewport, <title>, meta description, Tailwind CDN, Google Fonts for ${designSystem.headingFont} and ${designSystem.bodyFont}, <style> with ALL CSS custom properties, Tailwind config extending theme with tokens.`;
```

**Step 4: Pass sharedAssets through the pages route**

In `src/app/api/blueprint/pages/route.ts`, add `stylesCss` and `scriptsJs` to the request body interface:

```typescript
interface PagesRequestBody {
  conversationId: string;
  provider: string;
  model: string;
  maxOutputTokens?: number;
  blueprint?: Blueprint;
  headerHtml?: string;
  footerHtml?: string;
  headTags?: string;
  stylesCss?: string;
  scriptsJs?: string;
  skipPages?: string[];
}
```

Destructure them and pass to `getPageSystemPrompt`:
```typescript
const { ..., stylesCss, scriptsJs } = body;
// ...
const sharedAssets = stylesCss || scriptsJs ? { stylesCss, scriptsJs } : undefined;
const systemPrompt = getPageSystemPrompt(blueprint!, page, sharedHtml, headTags, sharedAssets);
```

Also update the `generatePages` call in `useBlueprintGeneration.ts` to pass `stylesCss` and `scriptsJs` in the fetch body.

**Step 5: Verify it builds**

Run: `npm run build`
Expected: Build succeeds.

**Step 6: Commit**

```bash
git add src/lib/blueprint/prompts/page-system-prompt.ts src/app/api/blueprint/pages/route.ts src/hooks/useBlueprintGeneration.ts
git commit -m "feat: update page prompts to reference shared styles.css and scripts.js"
```

---

### Task 6: Create post-processing pipeline (Passes 1-2: CSS dedup)

**Files:**
- Create: `src/lib/blueprint/post-process-pages.ts`

**Step 1: Create the post-processing module**

Create `src/lib/blueprint/post-process-pages.ts` with Passes 1-2:

```typescript
import * as cheerio from 'cheerio';
import type { ProjectFiles } from '@/types';

/**
 * Post-process generated pages to remove duplication.
 * Runs server-side after all pages complete.
 * Mutates `files` in place.
 */
export function postProcessPages(files: ProjectFiles): void {
  const htmlFiles = Object.keys(files).filter(
    f => f.endsWith('.html') && !f.startsWith('_components/'),
  );
  if (htmlFiles.length === 0) return;

  stripDuplicateHeadResources(files, htmlFiles);
  extractSharedStyles(files, htmlFiles);
}

/**
 * Pass 1: Strip duplicated head resources.
 * Removes duplicate Tailwind CDN scripts, Google Fonts links,
 * and <style> blocks containing :root variable redefinitions
 * (these are already in styles.css).
 */
function stripDuplicateHeadResources(files: ProjectFiles, htmlFiles: string[]): void {
  for (const filename of htmlFiles) {
    const $ = cheerio.load(files[filename]);

    // Remove duplicate Tailwind CDN scripts (keep the first one from headTags)
    const tailwindScripts = $('script[src*="tailwindcss"]');
    if (tailwindScripts.length > 1) {
      tailwindScripts.slice(1).remove();
    }

    // Remove duplicate Google Fonts links (keep the first one)
    const fontLinks = $('link[href*="fonts.googleapis.com"]');
    if (fontLinks.length > 1) {
      fontLinks.slice(1).remove();
    }

    // Remove duplicate preconnect links
    const preconnects = $('link[rel="preconnect"][href*="fonts"]');
    if (preconnects.length > 1) {
      // Keep first pair, remove rest
      const seen = new Set<string>();
      preconnects.each((_, el) => {
        const href = $(el).attr('href') ?? '';
        if (seen.has(href)) {
          $(el).remove();
        } else {
          seen.add(href);
        }
      });
    }

    // Remove <style> blocks that only contain :root variable redefinitions
    $('style').each((_, el) => {
      const css = $(el).text().trim();
      // If the style block is primarily :root { ... } with our variables, remove it
      const stripped = css
        .replace(/\/\*[\s\S]*?\*\//g, '') // remove comments
        .replace(/:root\s*\{[^}]*\}/g, '') // remove :root blocks
        .replace(/body\s*\{[^}]*font-family[^}]*\}/g, '') // remove body font reset
        .replace(/h[1-6]\s*(?:,\s*h[1-6])*\s*\{[^}]*font-family[^}]*\}/g, '') // remove heading font reset
        .trim();
      if (!stripped) {
        $(el).remove();
      }
    });

    // Remove duplicate tailwind.config scripts (keep the first one)
    const configScripts: cheerio.Cheerio<cheerio.Element>[] = [];
    $('script:not([src])').each((_, el) => {
      const text = $(el).text();
      if (text.includes('tailwind.config')) {
        configScripts.push($(el));
      }
    });
    if (configScripts.length > 1) {
      for (let i = 1; i < configScripts.length; i++) {
        configScripts[i].remove();
      }
    }

    // @ts-expect-error -- decodeEntities is a dom-serializer option
    files[filename] = $.html({ decodeEntities: false });
  }
}

/**
 * Pass 2: Extract duplicate <style> rules across pages.
 * CSS rules appearing in 2+ pages are moved to styles.css.
 */
function extractSharedStyles(files: ProjectFiles, htmlFiles: string[]): void {
  if (!files['styles.css']) return;

  // Collect all CSS rules from <style> blocks across pages
  const rulesByPage = new Map<string, Map<string, string>>(); // filename -> (normalized rule -> original rule)
  const ruleOccurrences = new Map<string, number>(); // normalized rule -> count of pages

  for (const filename of htmlFiles) {
    const $ = cheerio.load(files[filename]);
    const pageRules = new Map<string, string>();

    $('style').each((_, el) => {
      const css = $(el).text();
      // Simple CSS rule extraction — split on closing brace
      const rules = extractCssRules(css);
      for (const rule of rules) {
        const normalized = normalizeCssRule(rule);
        if (!normalized) continue;
        pageRules.set(normalized, rule);
      }
    });

    rulesByPage.set(filename, pageRules);

    for (const normalized of pageRules.keys()) {
      ruleOccurrences.set(normalized, (ruleOccurrences.get(normalized) ?? 0) + 1);
    }
  }

  // Find rules that appear in 2+ pages
  const sharedRules: string[] = [];
  const sharedNormalized = new Set<string>();

  for (const [normalized, count] of ruleOccurrences) {
    if (count >= 2) {
      sharedNormalized.add(normalized);
      // Use the original rule from the first page that has it
      for (const [, pageRules] of rulesByPage) {
        if (pageRules.has(normalized)) {
          sharedRules.push(pageRules.get(normalized)!);
          break;
        }
      }
    }
  }

  if (sharedRules.length === 0) return;

  // Append shared rules to styles.css
  files['styles.css'] += '\n\n/* Shared page styles (extracted from duplicate <style> blocks) */\n' + sharedRules.join('\n\n');

  // Remove shared rules from individual page <style> blocks
  for (const filename of htmlFiles) {
    const $ = cheerio.load(files[filename]);

    $('style').each((_, el) => {
      const css = $(el).text();
      const rules = extractCssRules(css);
      const remaining = rules.filter(rule => {
        const normalized = normalizeCssRule(rule);
        return normalized && !sharedNormalized.has(normalized);
      });

      if (remaining.length === 0) {
        $(el).remove();
      } else {
        $(el).text(remaining.join('\n\n'));
      }
    });

    // @ts-expect-error -- decodeEntities
    files[filename] = $.html({ decodeEntities: false });
  }
}

/** Extract individual CSS rules from a stylesheet string */
function extractCssRules(css: string): string[] {
  const rules: string[] = [];
  let depth = 0;
  let current = '';

  for (const char of css) {
    current += char;
    if (char === '{') depth++;
    if (char === '}') {
      depth--;
      if (depth === 0) {
        const rule = current.trim();
        if (rule) rules.push(rule);
        current = '';
      }
    }
  }

  return rules;
}

/** Normalize a CSS rule for comparison (collapse whitespace, lowercase) */
function normalizeCssRule(rule: string): string {
  return rule
    .replace(/\/\*[\s\S]*?\*\//g, '') // strip comments
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
```

**Step 2: Verify it builds**

Run: `npm run build`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add src/lib/blueprint/post-process-pages.ts
git commit -m "feat: add post-processing pipeline passes 1-2 (head resource dedup, shared style extraction)"
```

---

### Task 7: Add post-processing Passes 3-4 (inline styles + JS dedup)

**Files:**
- Modify: `src/lib/blueprint/post-process-pages.ts`

**Step 1: Add Pass 3 — inline style consolidation**

Add to `postProcessPages`:
```typescript
export function postProcessPages(files: ProjectFiles): void {
  // ... existing passes ...
  consolidateInlineStyles(files, htmlFiles);
  deduplicateScripts(files, htmlFiles);
}
```

Implement `consolidateInlineStyles`:

```typescript
/**
 * Pass 3: Convert repeated inline style="" patterns to CSS classes.
 * Detects patterns appearing 3+ times across all pages,
 * generates CSS classes, adds them to styles.css, and replaces inline styles.
 */
function consolidateInlineStyles(files: ProjectFiles, htmlFiles: string[]): void {
  if (!files['styles.css']) return;

  // Count inline style occurrences across all pages
  const styleOccurrences = new Map<string, number>();

  for (const filename of htmlFiles) {
    const $ = cheerio.load(files[filename]);
    $('[style]').each((_, el) => {
      const style = $(el).attr('style')?.trim();
      if (!style) return;
      const normalized = normalizeInlineStyle(style);
      styleOccurrences.set(normalized, (styleOccurrences.get(normalized) ?? 0) + 1);
    });
  }

  // Generate classes for patterns appearing 3+ times
  const styleToClass = new Map<string, string>();
  const generatedClasses: string[] = [];
  let classIndex = 0;

  for (const [normalized, count] of styleOccurrences) {
    if (count < 3) continue;

    const className = generateClassName(normalized, classIndex++);
    styleToClass.set(normalized, className);
    generatedClasses.push(`.${className} { ${denormalize(normalized)} }`);
  }

  if (generatedClasses.length === 0) return;

  // Add generated classes to styles.css
  files['styles.css'] += '\n\n/* Utility classes (extracted from repeated inline styles) */\n' + generatedClasses.join('\n');

  // Replace inline styles with class references
  for (const filename of htmlFiles) {
    const $ = cheerio.load(files[filename]);

    $('[style]').each((_, el) => {
      const style = $(el).attr('style')?.trim();
      if (!style) return;
      const normalized = normalizeInlineStyle(style);
      const className = styleToClass.get(normalized);
      if (!className) return;

      // Add class and remove inline style
      const existing = $(el).attr('class') ?? '';
      $(el).attr('class', (existing + ' ' + className).trim());
      $(el).removeAttr('style');
    });

    // @ts-expect-error -- decodeEntities
    files[filename] = $.html({ decodeEntities: false });
  }
}

function normalizeInlineStyle(style: string): string {
  return style
    .split(';')
    .map(s => s.trim())
    .filter(Boolean)
    .sort()
    .join('; ')
    .toLowerCase();
}

function denormalize(normalized: string): string {
  return normalized.split('; ').map(s => s.trim()).filter(Boolean).join('; ') + ';';
}

/** Generate a semantic class name from CSS properties */
function generateClassName(normalizedStyle: string, index: number): string {
  const props = normalizedStyle.split(';').map(s => s.trim()).filter(Boolean);
  const parts: string[] = [];

  for (const prop of props) {
    const [key, value] = prop.split(':').map(s => s.trim());
    if (key === 'color' && value?.includes('--color-text-muted')) parts.push('text-muted');
    else if (key === 'color' && value?.includes('--color-accent')) parts.push('text-accent');
    else if (key === 'color' && value?.includes('--color-primary')) parts.push('text-primary');
    else if (key === 'color' && value?.includes('--color-text')) parts.push('text-main');
    else if (key === 'color' && value?.includes('rgba')) parts.push('text-light');
    else if (key === 'background-color' && value?.includes('--color-primary')) parts.push('bg-primary');
    else if (key === 'background-color' && value?.includes('--color-surface')) parts.push('bg-surface');
    else if (key === 'font-family' && value?.includes('--font-heading')) parts.push('font-heading');
    else if (key === 'font-family' && value?.includes('--font-body')) parts.push('font-body');
  }

  if (parts.length > 0) {
    const name = 'u-' + parts.join('-');
    // Avoid collisions by appending index if name already used
    return index > 0 && parts.length < props.length ? `${name}-${index}` : name;
  }

  return `u-style-${index}`;
}
```

**Step 2: Add Pass 4 — JS deduplication**

Implement `deduplicateScripts`:

```typescript
/**
 * Pass 4: Extract duplicate JavaScript across pages into scripts.js.
 * Uses text-based similarity on normalized function bodies.
 */
function deduplicateScripts(files: ProjectFiles, htmlFiles: string[]): void {
  if (!files['scripts.js']) return;

  // Collect <script> blocks (non-src, non-tailwind-config) from each page
  const scriptsByPage = new Map<string, string[]>();

  for (const filename of htmlFiles) {
    const $ = cheerio.load(files[filename]);
    const scripts: string[] = [];

    $('script:not([src])').each((_, el) => {
      const text = $(el).text().trim();
      if (!text) return;
      if (text.includes('tailwind.config')) return; // Skip Tailwind config
      scripts.push(text);
    });

    scriptsByPage.set(filename, scripts);
  }

  // Find script blocks that appear in 2+ pages (normalized comparison)
  const scriptOccurrences = new Map<string, { count: number; original: string }>();

  for (const [, scripts] of scriptsByPage) {
    for (const script of scripts) {
      const normalized = normalizeScript(script);
      const existing = scriptOccurrences.get(normalized);
      if (existing) {
        existing.count++;
      } else {
        scriptOccurrences.set(normalized, { count: 1, original: script });
      }
    }
  }

  // Extract scripts appearing in 2+ pages
  const sharedScripts: string[] = [];
  const sharedNormalized = new Set<string>();

  for (const [normalized, { count, original }] of scriptOccurrences) {
    if (count >= 2) {
      sharedScripts.push(original);
      sharedNormalized.add(normalized);
    }
  }

  if (sharedScripts.length === 0) return;

  // Append to scripts.js
  files['scripts.js'] += '\n\n/* Shared page scripts (extracted from duplicate <script> blocks) */\n' + sharedScripts.join('\n\n');

  // Remove shared scripts from individual pages
  for (const filename of htmlFiles) {
    const $ = cheerio.load(files[filename]);

    $('script:not([src])').each((_, el) => {
      const text = $(el).text().trim();
      if (!text || text.includes('tailwind.config')) return;
      const normalized = normalizeScript(text);
      if (sharedNormalized.has(normalized)) {
        $(el).remove();
      }
    });

    // @ts-expect-error -- decodeEntities
    files[filename] = $.html({ decodeEntities: false });
  }
}

function normalizeScript(script: string): string {
  return script
    .replace(/\/\*[\s\S]*?\*\//g, '') // strip block comments
    .replace(/\/\/.*$/gm, '') // strip line comments
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
```

**Step 2: Verify it builds**

Run: `npm run build`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add src/lib/blueprint/post-process-pages.ts
git commit -m "feat: add post-processing passes 3-4 (inline style consolidation, JS deduplication)"
```

---

### Task 8: Integrate post-processing into the pages route

**Files:**
- Modify: `src/app/api/blueprint/pages/route.ts`

**Step 1: Import and call postProcessPages**

At the top of the file, add:
```typescript
import { postProcessPages } from '@/lib/blueprint/post-process-pages';
```

In the section after `extractComponents` runs (around line 655-669), add:

```typescript
// Extract shared components (nav/footer) across all completed pages
if (Object.keys(completedPagesMap).length >= 2) {
  try {
    extractComponents(completedPagesMap);
    // ... existing code ...
  } catch (err) {
    console.warn('[blueprint-pages] extractComponents error:', err);
  }
}

// Post-process: deduplicate CSS, JS, and inline styles
try {
  postProcessPages(completedPagesMap);
  // Send updated files if post-processing made changes
  if (Object.keys(completedPagesMap).some(f => f === 'styles.css' || f === 'scripts.js')) {
    sendEvent({
      type: 'post-processed',
      files: completedPagesMap,
    });
  }
} catch (err) {
  console.warn('[blueprint-pages] postProcessPages error:', err);
}
```

Note: `postProcessPages` may create/update `styles.css` and `scripts.js` entries in the files map if there are shared styles/scripts to extract. We need to pass the existing `styles.css` and `scripts.js` into `completedPagesMap` before calling it. Add before the post-processing call:

```typescript
// Include shared assets in the map so post-processing can append to them
if (body.stylesCss) {
  completedPagesMap['styles.css'] = body.stylesCss;
}
if (body.scriptsJs) {
  completedPagesMap['scripts.js'] = body.scriptsJs;
}
```

**Step 2: Handle the new 'post-processed' event on the client**

In `useBlueprintGeneration.ts`, inside the SSE event loop, add handling for the `post-processed` event (alongside `components-extracted`):

```typescript
} else if (event.type === 'post-processed' && event.files) {
  // Server post-processed the pages (CSS/JS dedup)
  filesAccumulatorRef.current = { ...filesAccumulatorRef.current, ...event.files };
}
```

**Step 3: Verify it builds**

Run: `npm run build`
Expected: Build succeeds.

**Step 4: Commit**

```bash
git add src/app/api/blueprint/pages/route.ts src/hooks/useBlueprintGeneration.ts
git commit -m "feat: integrate post-processing pipeline into blueprint pages route"
```

---

### Task 9: Fix component extraction to include 'header' tag

**Files:**
- Modify: `src/lib/blocks/extract-components.ts:80`

**Step 1: Add 'header' to componentTags**

Change line 80 from:
```typescript
const componentTags = ['nav', 'footer'];
```
to:
```typescript
const componentTags = ['nav', 'header', 'footer'];
```

**Step 2: Verify it builds**

Run: `npm run build`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add src/lib/blocks/extract-components.ts
git commit -m "fix: include header tag in component extraction candidates"
```

---

### Task 10: Update generateSharedStyles to include scripts.js in headTags

**Files:**
- Modify: `src/lib/blueprint/generate-shared-styles.ts`

**Step 1: Add scripts.js link to headTags**

In `generate-shared-styles.ts`, add `<script src="scripts.js" defer></script>` to the `headTags` string (line 64-88), after the Tailwind config closing `</script>`:

```typescript
const headTags = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?${fontsParam}&display=swap" rel="stylesheet">
<link rel="stylesheet" href="styles.css">
<script src="https://cdn.tailwindcss.com"></script>
<script>
tailwind.config = {
  theme: {
    extend: {
      colors: {
        primary: 'var(--color-primary)',
        secondary: 'var(--color-secondary)',
        accent: 'var(--color-accent)',
      },
      fontFamily: {
        heading: 'var(--font-heading)',
        body: 'var(--font-body)',
      },
      borderRadius: {
        DEFAULT: 'var(--radius)',
      },
    },
  },
};
</script>
<script src="scripts.js" defer></script>`;
```

**Step 2: Verify it builds**

Run: `npm run build`

**Step 3: Commit**

```bash
git add src/lib/blueprint/generate-shared-styles.ts
git commit -m "feat: include scripts.js in shared head tags"
```

---

### Task 11: Update components prompt to reference shared assets approach

**Files:**
- Modify: `src/lib/blueprint/prompts/components-system-prompt.ts`

**Step 1: Update rule 3 about inline scripts**

The components prompt currently instructs the AI to include inline `<script>` for hamburger toggle (line 75, rule 3 at line 119). Update to reference shared scripts.js pattern:

Change rule 3 from:
```
3. The header MUST include inline <script> for mobile hamburger toggle functionality.
```
to:
```
3. The header MUST use data-* attributes for JavaScript hooks (data-menu-toggle on hamburger button, data-mobile-menu on the menu container). A shared scripts.js file handles all interactivity — do NOT include inline <script> blocks.
```

Also update the header_requirements section to remove "Include an inline <script>" instruction and replace with data-attribute instructions.

**Step 2: Verify it builds**

Run: `npm run build`

**Step 3: Commit**

```bash
git add src/lib/blueprint/prompts/components-system-prompt.ts
git commit -m "feat: update components prompt to use data-attributes for shared scripts.js"
```

---

### Task 12: End-to-end manual test and iteration

**Step 1: Start the dev server**

Run: `npm run dev`

**Step 2: Test the full blueprint flow**

1. Create a new multi-page site (e.g., "Build a website for a yoga studio with Home, About, Classes, and Contact pages")
2. Verify in the console logs:
   - Components step completes → assets step starts → assets step produces styles.css and scripts.js → pages start generating
   - Page prompts include the shared assets reference blocks
   - Post-processing runs after pages complete

**Step 3: Compare output**

Download the generated site and compare:
- `styles.css` should be substantially larger than 658 bytes (should contain utility classes, animations, component styles)
- `scripts.js` should contain mobile menu, scroll reveal, and other shared JS
- Individual page `<style>` blocks should be minimal (only page-specific CSS)
- Individual page `<script>` blocks should be minimal (only page-specific JS)
- Inline `style=""` attributes should be significantly reduced

**Step 4: Fix any issues found during testing**

Iterate on prompt wording, post-processing logic, and asset generation quality based on real output.

**Step 5: Final commit**

```bash
git add -A
git commit -m "feat: complete blueprint page deduplication pipeline"
```
