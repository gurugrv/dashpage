# Performance Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix two performance issues: (1) replace slow sliding-window Levenshtein fuzzy matching with Myers' bit-parallel algorithm, (2) convert blocking blueprint components route to streaming SSE.

**Architecture:** Fix 1 swaps internal algorithm in `apply-edit-operations.ts` — same interface, faster engine. Fix 2 mirrors the existing `/api/blueprint/pages` SSE streaming pattern for the `/api/blueprint/components` route, with shared utilities extracted.

**Tech Stack:** `approx-string-match` (Myers' algorithm), Vercel AI SDK `streamText()`, SSE `ReadableStream`

---

## Fix 1: Fast Fuzzy Matching

### Task 1: Install `approx-string-match` and add type declaration

**Files:**
- Modify: `package.json`
- Create: `src/types/approx-string-match.d.ts`

**Step 1: Install the package**

Run: `npm install approx-string-match`

**Step 2: Create TypeScript declaration file**

Create `src/types/approx-string-match.d.ts`:

```typescript
declare module 'approx-string-match' {
  export interface Match {
    start: number;
    end: number;
    errors: number;
  }

  export default function search(
    text: string,
    pattern: string,
    maxErrors: number,
  ): Match[];
}
```

**Step 3: Verify the import resolves**

Run: `npx tsc --noEmit src/lib/parser/edit-operations/apply-edit-operations.ts 2>&1 | head -5`

(Will error since we haven't changed the file yet — just confirm the type declaration is picked up by adding a temp import check if needed.)

**Step 4: Commit**

```bash
git add package.json package-lock.json src/types/approx-string-match.d.ts
git commit -m "chore: add approx-string-match for fast fuzzy substring matching"
```

---

### Task 2: Rewrite `tryFuzzyMatch()` using Myers' algorithm

**Files:**
- Modify: `src/lib/parser/edit-operations/apply-edit-operations.ts` (lines 97-136)

**Step 1: Replace `tryFuzzyMatch` implementation**

Replace the existing `tryFuzzyMatch` function (lines 97-136) with:

```typescript
import search from 'approx-string-match';

/**
 * Tier 4/5: Fuzzy match using Myers' bit-parallel algorithm.
 * Finds approximate substring matches in O((k/w)*n) time.
 */
function tryFuzzyMatch(
  source: string,
  searchStr: string,
  threshold: number,
): { index: number; length: number; similarity: number } | null {
  const searchLen = searchStr.length;
  if (searchLen === 0 || source.length === 0) return null;

  const maxErrors = Math.max(1, Math.floor(searchLen * (1 - threshold)));
  const matches = search(source, searchStr, maxErrors);
  if (matches.length === 0) return null;

  // Pick the best match (lowest error count)
  let best = matches[0];
  for (let i = 1; i < matches.length; i++) {
    if (matches[i].errors < best.errors) {
      best = matches[i];
    }
  }

  const matchLength = best.end - best.start;
  const maxLen = Math.max(matchLength, searchLen);
  const similarity = 1 - best.errors / maxLen;

  return { index: best.start, length: matchLength, similarity };
}
```

**Step 2: Remove the `fastest-levenshtein` import if no longer used**

Check if `distance` from `fastest-levenshtein` is still used by `findBestMatchForError`. It is — so keep the import for now. We'll remove it in the next task.

**Step 3: Verify build**

Run: `npm run build 2>&1 | tail -20`

**Step 4: Commit**

```bash
git add src/lib/parser/edit-operations/apply-edit-operations.ts
git commit -m "perf: replace sliding-window Levenshtein with Myers' bit-parallel algorithm in tryFuzzyMatch"
```

---

### Task 3: Rewrite `findBestMatchForError()` using Myers' algorithm

**Files:**
- Modify: `src/lib/parser/edit-operations/apply-edit-operations.ts` (lines 138-172)

**Step 1: Replace `findBestMatchForError` implementation**

Replace lines 138-172 with:

```typescript
/**
 * Find the best approximate match for error reporting, regardless of threshold.
 * Uses a generous maxErrors (70% of search length) to find any plausible match.
 */
function findBestMatchForError(source: string, searchStr: string): BestMatch | null {
  if (!searchStr.trim() || !source) return null;

  const searchLen = searchStr.length;
  const maxErrors = Math.max(1, Math.floor(searchLen * 0.7));
  const matches = search(source, searchStr, maxErrors);
  if (matches.length === 0) return null;

  // Pick the best match (lowest error count)
  let best = matches[0];
  for (let i = 1; i < matches.length; i++) {
    if (matches[i].errors < best.errors) {
      best = matches[i];
    }
  }

  const matchLength = best.end - best.start;
  const maxLen = Math.max(matchLength, searchLen);
  const similarity = 1 - best.errors / maxLen;

  if (similarity < 0.3) return null;

  const matchText = source.slice(best.start, best.end).split('\n').slice(0, 3).join('\n');
  return {
    text: matchText.length > 150 ? matchText.slice(0, 150) + '...' : matchText,
    similarity: Math.round(similarity * 100) / 100,
    line: lineNumberAt(source, best.start),
  };
}
```

**Step 2: Remove the `fastest-levenshtein` import**

Now that neither function uses it, remove line 1:
```typescript
// DELETE: import { distance } from 'fastest-levenshtein';
```

**Step 3: Verify build**

Run: `npm run build 2>&1 | tail -20`

**Step 4: Optionally remove `fastest-levenshtein` from package.json**

Check if anything else imports it:
Run: `grep -r "fastest-levenshtein" src/`

If nothing else uses it:
Run: `npm uninstall fastest-levenshtein`

**Step 5: Commit**

```bash
git add src/lib/parser/edit-operations/apply-edit-operations.ts package.json package-lock.json
git commit -m "perf: replace findBestMatchForError with Myers' algorithm, remove fastest-levenshtein"
```

---

## Fix 2: Streaming Blueprint Components

### Task 4: Extract shared SSE utilities from pages route

**Files:**
- Create: `src/lib/blueprint/stream-utils.ts`
- Modify: `src/app/api/blueprint/pages/route.ts` (lines 15-76, 206-215)

**Step 1: Create shared utility file**

Create `src/lib/blueprint/stream-utils.ts`:

```typescript
export const TOOL_LABELS: Record<string, string> = {
  searchImages: 'Adding images',
  searchIcons: 'Adding icons',
  fetchUrl: 'Loading content',
  webSearch: 'Researching content',
  writeFiles: 'Writing page',
  editDOM: 'Fixing issues',
  editFiles: 'Fixing issues',
  readFile: 'Reading file',
};

export function summarizeToolInput(toolName: string, input: unknown): string | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const inp = input as Record<string, unknown>;
  switch (toolName) {
    case 'searchImages':
    case 'searchIcons':
    case 'webSearch':
      return typeof inp.query === 'string' ? inp.query : undefined;
    case 'fetchUrl':
      return typeof inp.url === 'string' ? inp.url : undefined;
    case 'writeFiles': {
      const files = inp.files as Record<string, unknown> | undefined;
      return files ? Object.keys(files).join(', ') : undefined;
    }
    case 'editDOM':
    case 'readFile':
    default:
      return undefined;
  }
}

export function summarizeToolOutput(toolName: string, output: unknown): string | undefined {
  if (!output || typeof output !== 'object') return undefined;
  const out = output as Record<string, unknown>;
  if (out.success === false) {
    return typeof out.error === 'string' ? out.error.slice(0, 80) : 'Failed';
  }
  switch (toolName) {
    case 'searchImages': {
      const images = out.images as unknown[] | undefined;
      return images ? `${images.length} image${images.length !== 1 ? 's' : ''} found` : undefined;
    }
    case 'searchIcons': {
      const icons = out.icons as unknown[] | undefined;
      return icons ? `${icons.length} icon${icons.length !== 1 ? 's' : ''} found` : undefined;
    }
    case 'webSearch': {
      const results = out.results as unknown[] | undefined;
      return results ? `${results.length} result${results.length !== 1 ? 's' : ''} found` : undefined;
    }
    case 'fetchUrl':
      return out.truncated ? 'Content fetched (truncated)' : 'Content fetched';
    case 'writeFiles': {
      const fileNames = out.fileNames as string[] | undefined;
      return fileNames ? `Wrote ${fileNames.join(', ')}` : 'Files written';
    }
    case 'editDOM':
      return out.success === true ? 'Edits applied' : out.success === 'partial' ? 'Partial edits applied' : undefined;
    case 'editFiles': {
      const results = out.results as Array<Record<string, unknown>> | undefined;
      if (results) {
        const ok = results.filter(r => r.success !== false).length;
        return `${ok}/${results.length} file${results.length !== 1 ? 's' : ''} edited`;
      }
      return 'Edits applied';
    }
    case 'readFile':
      return 'File read';
    default:
      return undefined;
  }
}
```

**Step 2: Update pages route to import from shared utility**

In `src/app/api/blueprint/pages/route.ts`:

- Add import: `import { TOOL_LABELS, summarizeToolInput, summarizeToolOutput } from '@/lib/blueprint/stream-utils';`
- Delete the local `summarizeToolInput` function (lines 15-34)
- Delete the local `summarizeToolOutput` function (lines 36-76)
- Delete the local `TOOL_LABELS` constant (lines 206-215)

**Step 3: Verify build**

Run: `npm run build 2>&1 | tail -20`

**Step 4: Commit**

```bash
git add src/lib/blueprint/stream-utils.ts src/app/api/blueprint/pages/route.ts
git commit -m "refactor: extract shared SSE tool utilities from pages route"
```

---

### Task 5: Convert components route to streaming SSE

**Files:**
- Modify: `src/app/api/blueprint/components/route.ts` (full rewrite of POST handler)

**Step 1: Rewrite the route**

Replace the entire file with:

```typescript
import { stepCountIs, streamText } from 'ai';
import { resolveApiKey } from '@/lib/keys/key-manager';
import { PROVIDERS } from '@/lib/providers/registry';
import { getComponentsSystemPrompt } from '@/lib/blueprint/prompts/components-system-prompt';
import { ChatRequestError } from '@/lib/chat/errors';
import { resolveMaxOutputTokens } from '@/lib/chat/constants';
import { createDebugSession } from '@/lib/chat/stream-debug';
import { prisma } from '@/lib/db/prisma';
import { createWebsiteTools } from '@/lib/chat/tools';
import { TOOL_LABELS, summarizeToolInput, summarizeToolOutput } from '@/lib/blueprint/stream-utils';
import type { Blueprint } from '@/lib/blueprint/types';

interface ComponentsRequestBody {
  blueprint: Blueprint;
  provider: string;
  model: string;
  conversationId?: string;
}

export async function POST(req: Request) {
  let body: ComponentsRequestBody;
  try {
    body = await req.json() as ComponentsRequestBody;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { blueprint, provider, model, conversationId } = body;

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

  const maxOutputTokens = resolveMaxOutputTokens(providerConfig, model);
  const systemPrompt = getComponentsSystemPrompt(blueprint);
  const modelInstance = providerConfig.createModel(apiKey, model);
  const userPrompt = `Generate the shared header and footer HTML components for the "${blueprint.siteName}" website.`;
  const abortSignal = req.signal;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      function sendEvent(data: Record<string, unknown>) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      }

      sendEvent({ type: 'component-status', status: 'generating' });

      try {
        const debugSession = createDebugSession({
          scope: 'blueprint-components',
          model,
          provider,
        });
        debugSession.logPrompt({
          systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
          maxOutputTokens,
        });

        const { tools, workingFiles } = createWebsiteTools({});

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
          } else if (part.type === 'tool-input-start') {
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
        const responseText = debugSession.getFullResponse();
        debugSession.logFullResponse(await result.finishReason);

        const resolvedHeader = workingFiles['header.html'];
        const resolvedFooter = workingFiles['footer.html'];

        if (!resolvedHeader || !resolvedFooter) {
          console.error('Model did not produce header.html and/or footer.html via writeFiles. Available files:', Object.keys(workingFiles), 'Raw response:', responseText.slice(0, 2000));
          sendEvent({
            type: 'component-status',
            status: 'error',
            error: 'Failed to generate header/footer — model did not call writeFiles',
          });
        } else {
          if (conversationId) {
            await prisma.generationState.update({
              where: { conversationId },
              data: {
                phase: 'components-complete',
                componentHtml: { headerHtml: resolvedHeader, footerHtml: resolvedFooter },
              },
            }).catch(() => {});
          }

          sendEvent({
            type: 'component-status',
            status: 'complete',
            headerHtml: resolvedHeader,
            footerHtml: resolvedFooter,
          });
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') {
          // Client disconnected — close silently
        } else {
          console.error('Components generation failed:', err);
          sendEvent({
            type: 'component-status',
            status: 'error',
            error: err instanceof Error ? err.message : 'Components generation failed',
          });
        }
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
```

**Step 2: Verify build**

Run: `npm run build 2>&1 | tail -20`

**Step 3: Commit**

```bash
git add src/app/api/blueprint/components/route.ts
git commit -m "perf: convert blueprint components route from blocking generateText to streaming SSE"
```

---

### Task 6: Update client to consume SSE stream for components

**Files:**
- Modify: `src/hooks/useBlueprintGeneration.ts` (lines 59-69 SSE types, lines 155-197 `generateComponents`)

**Step 1: Add component SSE event types**

Add a new event type after the existing `ToolActivitySSEEvent` (around line 67):

```typescript
interface ComponentStatusEvent {
  type: 'component-status';
  status: 'generating' | 'complete' | 'error';
  headerHtml?: string;
  footerHtml?: string;
  error?: string;
}

interface ComponentToolActivityEvent {
  type: 'tool-activity';
  toolCallId: string;
  toolName: string;
  status: 'running' | 'done' | 'error';
  label: string;
  detail?: string;
}

type ComponentSSEEvent = ComponentStatusEvent | ComponentToolActivityEvent;
```

**Step 2: Add state for component tool activities**

In the hook body (around line 83), add:

```typescript
const [componentToolActivities, setComponentToolActivities] = useState<PageToolActivity[]>([]);
```

And add to the `reset` callback:

```typescript
setComponentToolActivities([]);
```

**Step 3: Rewrite `generateComponents` to consume SSE**

Replace the `generateComponents` function (lines 155-197) with:

```typescript
const generateComponents = useCallback(async (activeBlueprint: Blueprint, conversationId?: string): Promise<{ headerHtml: string; footerHtml: string } | null> => {
  const stepModel = resolveStepModel('components');
  if (!stepModel) {
    setError('No provider or model selected');
    setPhase('error');
    return null;
  }

  setPhase('generating-components');
  setError(null);
  setComponentToolActivities([]);

  const controller = new AbortController();
  abortControllerRef.current = controller;

  try {
    const response = await fetch('/api/blueprint/components', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        blueprint: activeBlueprint,
        provider: stepModel.provider,
        model: stepModel.model,
        conversationId,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: 'Components generation failed' }));
      throw new Error(data.error || 'Components generation failed');
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response stream');

    const decoder = new TextDecoder();
    let buffer = '';
    let result: { headerHtml: string; footerHtml: string } | null = null;

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
          const event = JSON.parse(jsonStr) as ComponentSSEEvent;

          if (event.type === 'tool-activity') {
            setComponentToolActivities((prev) => {
              const idx = prev.findIndex((a) => a.toolCallId === event.toolCallId);
              const entry: PageToolActivity = {
                toolCallId: event.toolCallId,
                toolName: event.toolName,
                status: event.status,
                label: event.label,
                detail: event.detail,
              };
              if (idx >= 0) {
                const next = [...prev];
                next[idx] = entry;
                return next;
              }
              return [...prev, entry];
            });
          } else if (event.type === 'component-status') {
            if (event.status === 'complete' && event.headerHtml && event.footerHtml) {
              result = { headerHtml: event.headerHtml, footerHtml: event.footerHtml };
              setHeaderHtml(event.headerHtml);
              setFooterHtml(event.footerHtml);
              setComponentToolActivities([]);
            } else if (event.status === 'error') {
              throw new Error(event.error || 'Components generation failed');
            }
          }
        } catch (parseErr) {
          if (parseErr instanceof Error && parseErr.message !== 'Components generation failed' && !parseErr.message.startsWith('Failed to generate')) {
            // Skip malformed SSE JSON, but re-throw component errors
            continue;
          }
          throw parseErr;
        }
      }
    }

    return result;
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') return null;
    setError(err instanceof Error ? err.message : 'Components generation failed');
    setPhase('error');
    return null;
  }
}, [resolveStepModel]);
```

**Step 4: Expose `componentToolActivities` in the hook return**

Find the return statement of the hook and add `componentToolActivities` to it.

**Step 5: Verify build**

Run: `npm run build 2>&1 | tail -20`

**Step 6: Commit**

```bash
git add src/hooks/useBlueprintGeneration.ts
git commit -m "feat: consume SSE stream for blueprint component generation with tool activity progress"
```

---

### Task 7: Final verification

**Step 1: Full build check**

Run: `npm run build`

**Step 2: Lint check**

Run: `npm run lint`

**Step 3: Final commit if any lint fixes needed**

```bash
git add -A
git commit -m "chore: lint fixes for perf improvements"
```
