# Together.ai Image Generation — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add AI image generation via Together.ai alongside existing Pexels, with settings UI for provider/model selection, transparent routing in the `searchImages` tool, and server-side image storage.

**Architecture:** The `searchImages` tool routes to either Pexels or Together.ai based on a client-side setting. Together.ai images are generated via `POST /api/images/generate`, downloaded, and saved to `public/generated/`. The setting flows from localStorage → Builder → API route body → `createWebsiteTools()` options → tool routing.

**Tech Stack:** Together.ai REST API, Next.js API routes, Zod validation, localStorage, existing encrypted key system.

---

### Task 1: Gitignore and env setup

**Files:**
- Modify: `.gitignore`
- Modify: `.env.example`

**Step 1: Add generated images directory to .gitignore**

In `.gitignore`, add after the `# worktrees` section:

```
# AI-generated images
/public/generated/
```

**Step 2: Add Together.ai key to .env.example**

In `.env.example`, add after the `PEXELS_API_KEY` line (under `# === Image API ===`):

```env
TOGETHER_API_KEY=""          # Together.ai API key for AI image generation (https://api.together.xyz/)
```

**Step 3: Create the generated images directory**

```bash
mkdir -p public/generated
touch public/generated/.gitkeep
```

Note: `.gitkeep` ensures the directory exists in git even though contents are ignored. Add `/public/generated/*` and `!/public/generated/.gitkeep` pattern instead:

Replace the gitignore entry with:
```
# AI-generated images
/public/generated/*
!/public/generated/.gitkeep
```

**Step 4: Commit**

```bash
git add .gitignore .env.example public/generated/.gitkeep
git commit -m "chore: add together.ai env var and gitignore generated images"
```

---

### Task 2: Together.ai API client

**Files:**
- Create: `src/lib/images/together.ts`

**Step 1: Create the Together.ai image generation client**

Create `src/lib/images/together.ts`:

```typescript
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

const TOGETHER_API_URL = 'https://api.together.xyz/v1/images/generations';
const GENERATED_DIR = path.join(process.cwd(), 'public', 'generated');

export interface ImageGenPrompt {
  prompt: string;
  width?: number;
  height?: number;
}

export interface GeneratedImage {
  url: string;
  alt: string;
  width: number;
  height: number;
}

export interface ImageGenResult {
  success: true;
  images: GeneratedImage[];
}

const QUALITY_SUFFIX = ', professional photography, high resolution, sharp detail, beautiful lighting';

function enhancePrompt(prompt: string): string {
  return prompt + QUALITY_SUFFIX;
}

async function ensureDir() {
  await fs.mkdir(GENERATED_DIR, { recursive: true });
}

async function downloadAndSave(imageUrl: string): Promise<string> {
  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error(`Failed to download image: ${response.status}`);

  const buffer = Buffer.from(await response.arrayBuffer());
  const filename = `${crypto.randomUUID()}.jpg`;
  const filePath = path.join(GENERATED_DIR, filename);

  await ensureDir();
  await fs.writeFile(filePath, buffer);

  return `/generated/${filename}`;
}

export async function generateImages(
  apiKey: string,
  prompts: ImageGenPrompt[],
  model: string,
): Promise<GeneratedImage[]> {
  const results = await Promise.all(
    prompts.map(async ({ prompt, width = 1024, height = 1024 }) => {
      const response = await fetch(TOGETHER_API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          prompt: enhancePrompt(prompt),
          width,
          height,
          steps: model.includes('schnell') ? 4 : 20,
          n: 1,
          response_format: 'url',
          output_format: 'jpeg',
        }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        throw new Error(`Together.ai API error ${response.status}: ${errorBody}`);
      }

      const data = await response.json();
      const imageUrl: string = data.data?.[0]?.url;
      if (!imageUrl) throw new Error('No image URL in Together.ai response');

      const localUrl = await downloadAndSave(imageUrl);
      return { url: localUrl, alt: prompt, width, height };
    }),
  );

  return results;
}
```

**Step 2: Commit**

```bash
git add src/lib/images/together.ts
git commit -m "feat: add Together.ai image generation client"
```

---

### Task 3: Image generation API route

**Files:**
- Create: `src/app/api/images/generate/route.ts`

**Step 1: Create the API route**

Create `src/app/api/images/generate/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { generateImages } from '@/lib/images/together';
import { resolveApiKey } from '@/lib/keys/key-manager';

const requestSchema = z.object({
  prompts: z.array(
    z.object({
      prompt: z.string().min(1).max(500),
      width: z.number().int().min(256).max(1920).optional().default(1024),
      height: z.number().int().min(256).max(1920).optional().default(1024),
    }),
  ).min(1).max(12),
  model: z.string().default('black-forest-labs/FLUX.1-dev'),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = requestSchema.parse(body);

    const apiKey = await resolveApiKey('Together');
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: 'Together.ai API key not configured. Add it in Settings > API Keys.' },
        { status: 401 },
      );
    }

    const images = await generateImages(apiKey, parsed.prompts, parsed.model);

    return NextResponse.json({ success: true, images });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Invalid request', details: error.errors },
        { status: 400 },
      );
    }
    const message = error instanceof Error ? error.message : 'Image generation failed';
    console.error('[/api/images/generate]', message);
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
}
```

**Step 2: Commit**

```bash
git add src/app/api/images/generate/route.ts
git commit -m "feat: add /api/images/generate route for Together.ai"
```

---

### Task 4: Register Together.ai as a provider for API key management

**Files:**
- Modify: `src/lib/providers/registry.ts`

The key manager's `resolveApiKey('Together')` looks up `PROVIDERS['Together'].envKey`. We need a minimal provider entry. Since Together.ai is only used for images (not LLM chat), we add a lightweight entry.

**Step 1: Add Together provider to registry**

In `src/lib/providers/registry.ts`, add after the existing imports:

```typescript
import type { ProviderConfig } from '@/lib/providers/types';
```

Then add a minimal Together provider inline (no separate config file needed since it has no LLM models):

After the `zaiProvider` import, before the `PROVIDERS` export, add:

```typescript
// Together.ai — image generation only, no LLM models
const togetherProvider: ProviderConfig = {
  name: 'Together',
  envKey: 'TOGETHER_API_KEY',
  createModel: () => { throw new Error('Together.ai is image-only, no LLM models'); },
  staticModels: [],
};
```

Then add to the `PROVIDERS` record:

```typescript
Together: togetherProvider,
```

**Step 2: Verify resolveApiKey works**

`resolveApiKey('Together')` will now:
1. Check `process.env.TOGETHER_API_KEY`
2. Fall back to encrypted DB key for provider `'Together'`

**Step 3: Commit**

```bash
git add src/lib/providers/registry.ts
git commit -m "feat: register Together.ai provider for API key management"
```

---

### Task 5: useImageGenConfig hook

**Files:**
- Create: `src/hooks/useImageGenConfig.ts`

**Step 1: Create the hook**

Create `src/hooks/useImageGenConfig.ts`:

```typescript
'use client';

import { useCallback, useState } from 'react';

export type ImageProvider = 'pexels' | 'together';

export interface ImageGenConfig {
  provider: ImageProvider;
  model: string;
}

export const IMAGE_GEN_MODELS = [
  { id: 'black-forest-labs/FLUX.1-schnell', name: 'FLUX Schnell (Fast)', price: '~$0.003/img' },
  { id: 'black-forest-labs/FLUX.1-dev', name: 'FLUX Dev (Balanced)', price: '~$0.025/img' },
  { id: 'black-forest-labs/FLUX.1.1-pro', name: 'FLUX 1.1 Pro (Best)', price: '~$0.04/img' },
] as const;

const STORAGE_KEY = 'ai-builder:image-gen-config';

const DEFAULT_CONFIG: ImageGenConfig = {
  provider: 'pexels',
  model: 'black-forest-labs/FLUX.1-dev',
};

function loadConfig(): ImageGenConfig {
  if (typeof window === 'undefined') return DEFAULT_CONFIG;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CONFIG;
    const parsed = JSON.parse(raw);
    // Validate shape
    if (parsed.provider !== 'pexels' && parsed.provider !== 'together') return DEFAULT_CONFIG;
    if (typeof parsed.model !== 'string') return DEFAULT_CONFIG;
    return parsed;
  } catch {
    return DEFAULT_CONFIG;
  }
}

function saveConfig(config: ImageGenConfig) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function useImageGenConfig() {
  const [config, setConfigState] = useState<ImageGenConfig>(loadConfig);

  const setConfig = useCallback((update: Partial<ImageGenConfig>) => {
    setConfigState((prev) => {
      const next = { ...prev, ...update };
      saveConfig(next);
      return next;
    });
  }, []);

  return { config, setConfig };
}
```

**Step 2: Commit**

```bash
git add src/hooks/useImageGenConfig.ts
git commit -m "feat: add useImageGenConfig hook for image provider settings"
```

---

### Task 6: Image Generation settings UI

**Files:**
- Create: `src/features/settings/image-gen-settings.tsx`
- Modify: `src/components/SettingsDialog.tsx`

**Step 1: Create ImageGenSettings component**

Create `src/features/settings/image-gen-settings.tsx`:

```typescript
'use client';

import { ImageIcon } from 'lucide-react';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ImageGenConfig, ImageProvider } from '@/hooks/useImageGenConfig';
import { IMAGE_GEN_MODELS } from '@/hooks/useImageGenConfig';

interface ImageGenSettingsProps {
  config: ImageGenConfig;
  onChange: (update: Partial<ImageGenConfig>) => void;
}

export function ImageGenSettings({ config, onChange }: ImageGenSettingsProps) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Choose how images are sourced for generated websites.
      </p>

      <div className="space-y-2">
        <Label className="text-xs font-medium">Image Source</Label>
        <Select
          value={config.provider}
          onValueChange={(value: ImageProvider) => onChange({ provider: value })}
        >
          <SelectTrigger className="text-xs h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pexels" className="text-xs">
              Pexels — Stock Photos (Free)
            </SelectItem>
            <SelectItem value="together" className="text-xs">
              AI Generated — Together.ai (FLUX)
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {config.provider === 'together' && (
        <div className="space-y-2">
          <Label className="text-xs font-medium">Image Model</Label>
          <Select
            value={config.model}
            onValueChange={(model) => onChange({ model })}
          >
            <SelectTrigger className="text-xs h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {IMAGE_GEN_MODELS.map((m) => (
                <SelectItem key={m.id} value={m.id} className="text-xs">
                  {m.name} <span className="text-muted-foreground ml-1">{m.price}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Requires a Together.ai API key (set in API Keys tab).
          </p>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Add Image Generation tab to SettingsDialog**

Modify `src/components/SettingsDialog.tsx`:

Add import at top:
```typescript
import { ImageIcon } from 'lucide-react';
import { ImageGenSettings } from '@/features/settings/image-gen-settings';
import type { ImageGenConfig } from '@/hooks/useImageGenConfig';
```

Add to `SettingsDialogProps` interface:
```typescript
imageGenConfig: ImageGenConfig;
onImageGenConfigChange: (update: Partial<ImageGenConfig>) => void;
```

Change `TabsList` from `grid-cols-2` to `grid-cols-3` and add a third tab trigger:
```tsx
<TabsList className="grid w-full grid-cols-3 mb-4 shrink-0">
  <TabsTrigger value="keys" className="text-xs gap-1.5">
    <Key className="size-3.5" />
    API Keys
  </TabsTrigger>
  <TabsTrigger value="models" className="text-xs gap-1.5">
    <Cpu className="size-3.5" />
    Models
  </TabsTrigger>
  <TabsTrigger value="images" className="text-xs gap-1.5">
    <ImageIcon className="size-3.5" />
    Images
  </TabsTrigger>
</TabsList>
```

Add the new `TabsContent` after the models tab content (inside the `<>...</>` fragment, before the closing `</>`):
```tsx
<TabsContent value="images" className="mt-0 flex-1 min-h-0 overflow-auto -mx-6 px-6">
  <ImageGenSettings
    config={imageGenConfig}
    onChange={onImageGenConfigChange}
  />
</TabsContent>
```

**Step 3: Commit**

```bash
git add src/features/settings/image-gen-settings.tsx src/components/SettingsDialog.tsx
git commit -m "feat: add Image Generation tab to settings dialog"
```

---

### Task 7: Wire settings through Builder to API calls

**Files:**
- Modify: `src/components/Builder.tsx`

**Step 1: Add the hook and pass config to SettingsDialog**

In `src/components/Builder.tsx`:

Add import:
```typescript
import { useImageGenConfig } from '@/hooks/useImageGenConfig';
```

Add hook call near other hooks (near `useBlueprintModelConfig`):
```typescript
const { config: imageGenConfig, setConfig: setImageGenConfig } = useImageGenConfig();
```

Find the `<SettingsDialog` JSX and add the new props:
```tsx
<SettingsDialog
  // ...existing props
  imageGenConfig={imageGenConfig}
  onImageGenConfigChange={setImageGenConfig}
/>
```

**Step 2: Pass imageProvider and imageModel in the chat body**

Find the `sendMessage` call with `body: {` (around line 486-498). Add two fields to the body object:

```typescript
body: {
  currentFiles: currentFilesRef.current,
  provider: effectiveSelectedProvider,
  model: effectiveSelectedModel,
  maxOutputTokens: resolveMaxOutputTokens(),
  savedTimeZone: getSavedTimeZone(),
  browserTimeZone: getBrowserTimeZone(),
  conversationId,
  imageProvider: imageGenConfig.provider,
  imageModel: imageGenConfig.model,
},
```

**Step 3: Pass imageProvider and imageModel to blueprint generation**

The blueprint hooks receive `resolveStepModel` callback. For image config, the simplest approach is to pass it to `useBlueprintGeneration`.

Find where `useBlueprintGeneration` is called and add imageGenConfig to its options. Then in the blueprint generation fetch calls (`/api/blueprint/components`, `/api/blueprint/pages`), add `imageProvider` and `imageModel` to the request body.

In the `useBlueprintGeneration` hook usage, the config needs to be forwarded. Since this hook is called in Builder.tsx, add the image config as a ref (to avoid stale closure):

```typescript
const imageGenConfigRef = useRef(imageGenConfig);
useEffect(() => { imageGenConfigRef.current = imageGenConfig; }, [imageGenConfig]);
```

Then pass it into the blueprint generation hook or directly add it to the fetch bodies. The cleanest approach is to modify `useBlueprintGeneration` to accept `imageGenConfig`.

**Step 4: Commit**

```bash
git add src/components/Builder.tsx
git commit -m "feat: wire image gen config from settings to API calls"
```

---

### Task 8: Update useBlueprintGeneration to forward image config

**Files:**
- Modify: `src/hooks/useBlueprintGeneration.ts`

**Step 1: Add imageProvider/imageModel to the hook options**

Add to `UseBlueprintGenerationOptions` interface:
```typescript
imageProvider?: 'pexels' | 'together';
imageModel?: string;
```

**Step 2: Forward to fetch calls**

In each `fetch` call body (`/api/blueprint/generate`, `/api/blueprint/components`, `/api/blueprint/pages`), spread the image config:

```typescript
body: JSON.stringify({
  // ...existing fields
  imageProvider,
  imageModel,
}),
```

Extract from options at the top of each function that uses it:
```typescript
const { imageProvider, imageModel } = optionsRef.current;
```

Where `optionsRef` is a ref to the latest options (use the same ref pattern as existing code in the hook).

**Step 3: Commit**

```bash
git add src/hooks/useBlueprintGeneration.ts
git commit -m "feat: forward image gen config through blueprint generation"
```

---

### Task 9: Accept imageProvider/imageModel in API routes and pass to tools

**Files:**
- Modify: `src/app/api/chat/route.ts`
- Modify: `src/app/api/blueprint/pages/route.ts`
- Modify: `src/app/api/blueprint/components/route.ts`
- Modify: `src/app/api/blueprint/assets/route.ts`
- Modify: `src/lib/chat/tools/index.ts`

**Step 1: Update createWebsiteTools to accept image options**

In `src/lib/chat/tools/index.ts`, update the interface and pass through:

```typescript
interface WebsiteToolsOptions {
  toolSubset?: Set<string>;
  imageProvider?: 'pexels' | 'together';
  imageModel?: string;
}

export function createWebsiteTools(currentFiles: ProjectFiles, options?: WebsiteToolsOptions): { tools: ToolSet; workingFiles: ProjectFiles } {
  const workingFiles: ProjectFiles = { ...currentFiles };
  const fileSnapshots: ProjectFiles = { ...currentFiles };

  const allTools: ToolSet = {
    ...createFileTools(workingFiles, fileSnapshots),
    ...createBlockTools(workingFiles, fileSnapshots),
    ...createImageTools({
      imageProvider: options?.imageProvider,
      imageModel: options?.imageModel,
    }),
    ...createIconTools(),
    ...createWebTools(),
    ...createSearchTools(),
  };

  // ... rest unchanged
}
```

**Step 2: Update /api/chat/route.ts**

Add to `ChatRequestBody` interface:
```typescript
imageProvider?: 'pexels' | 'together';
imageModel?: string;
```

Extract from body:
```typescript
const { ..., imageProvider, imageModel } = body;
```

Pass to `createWebsiteTools`:
```typescript
const { tools, workingFiles } = createWebsiteTools(currentFiles ?? {}, { imageProvider, imageModel });
```

**Step 3: Update /api/blueprint/pages/route.ts**

Add to `PagesRequestBody`:
```typescript
imageProvider?: 'pexels' | 'together';
imageModel?: string;
```

Extract from body. Pass to the `createWebsiteTools` call (around line 280):
```typescript
const { tools: pageTools, workingFiles } = createWebsiteTools({}, {
  toolSubset: PAGE_GEN_TOOLS,
  imageProvider,
  imageModel,
});
```

**Step 4: Update /api/blueprint/components/route.ts**

Same pattern — add to interface, extract from body, pass to `createWebsiteTools({})` call (around line 99):
```typescript
const { tools, workingFiles } = createWebsiteTools({}, { imageProvider, imageModel });
```

**Step 5: Update /api/blueprint/assets/route.ts**

Same pattern — add to interface, extract from body, pass to `createWebsiteTools({})` call (around line 97):
```typescript
const { tools, workingFiles } = createWebsiteTools({}, { imageProvider, imageModel });
```

**Step 6: Commit**

```bash
git add src/lib/chat/tools/index.ts src/app/api/chat/route.ts src/app/api/blueprint/pages/route.ts src/app/api/blueprint/components/route.ts src/app/api/blueprint/assets/route.ts
git commit -m "feat: pass image gen config through API routes to tool system"
```

---

### Task 10: Add provider routing to searchImages tool

**Files:**
- Modify: `src/lib/chat/tools/image-tools.ts`

This is the core change. The tool needs to route to either Pexels or Together.ai based on the provider option.

**Step 1: Update createImageTools to accept options and add Together.ai routing**

Replace the entire `src/lib/chat/tools/image-tools.ts` with:

```typescript
import { tool } from 'ai';
import { z } from 'zod';
import { searchPhotos } from '@/lib/images/pexels';
import { generateImages } from '@/lib/images/together';
import { resolveApiKey } from '@/lib/keys/key-manager';

function wordSet(query: string): Set<string> {
  return new Set(query.toLowerCase().trim().split(/\s+/).filter(Boolean));
}

function jaccardSimilarity(a: string, b: string): number {
  const setA = wordSet(a);
  const setB = wordSet(b);
  let intersection = 0;
  for (const word of setA) {
    if (setB.has(word)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 1 : intersection / union;
}

const SIMILARITY_THRESHOLD = 0.6;

const imageQuerySchema = z.object({
  query: z
    .string()
    .describe('Descriptive search query, 2-5 words (e.g. "modern office workspace", "fresh pasta dish")'),
  count: z.coerce
    .number()
    .int()
    .min(1)
    .max(5)
    .catch(2)
    .describe('Number of results for this query (1-5). Default 2.'),
  orientation: z
    .enum(['landscape', 'portrait', 'square'])
    .optional()
    .describe('landscape for heroes/banners, portrait for people/cards, square for avatars/thumbnails.'),
});

interface ImageToolOptions {
  imageProvider?: 'pexels' | 'together';
  imageModel?: string;
}

function orientationToDimensions(orientation?: 'landscape' | 'portrait' | 'square'): { width: number; height: number } {
  switch (orientation) {
    case 'landscape': return { width: 1024, height: 768 };
    case 'portrait': return { width: 768, height: 1024 };
    case 'square':
    default: return { width: 1024, height: 1024 };
  }
}

export function createImageTools(options?: ImageToolOptions) {
  const provider = options?.imageProvider ?? 'pexels';
  const model = options?.imageModel ?? 'black-forest-labs/FLUX.1-dev';

  const usedQueries: string[] = [];
  const usedPhotoIds = new Set<number>();

  function isTooSimilar(query: string): string | null {
    const normalized = query.toLowerCase().trim();
    for (const prev of usedQueries) {
      if (jaccardSimilarity(normalized, prev) >= SIMILARITY_THRESHOLD) return prev;
    }
    return null;
  }

  // ── Pexels fetch (existing) ──────────────────────────────────────────
  async function fetchFromPexels(
    query: string,
    count: number,
    orientation?: 'landscape' | 'portrait' | 'square',
  ) {
    const similar = isTooSimilar(query);
    if (similar) {
      return {
        query,
        success: false as const,
        error: `Too similar to previous search "${similar}". Use a different subject.`,
      };
    }

    try {
      const requestCount = Math.min(count + usedPhotoIds.size, 15);
      const photos = await searchPhotos(query, { orientation, perPage: requestCount });
      const fresh = photos.filter((p) => !usedPhotoIds.has(p.id));
      const selected = fresh.slice(0, count);

      const normalized = query.toLowerCase().trim();
      usedQueries.push(normalized);
      for (const photo of selected) usedPhotoIds.add(photo.id);

      return {
        query,
        success: true as const,
        images: selected.map((photo) => ({
          url: photo.src.large2x,
          alt: photo.alt || query,
          photographer: photo.photographer,
          width: photo.width,
          height: photo.height,
        })),
      };
    } catch (error) {
      return {
        query,
        success: false as const,
        error: `Search failed: ${error instanceof Error ? error.message : 'Unknown error'}. Use placeholder.`,
      };
    }
  }

  // ── Together.ai generation ──────────────────────────────────────────
  async function fetchFromTogether(
    query: string,
    count: number,
    orientation?: 'landscape' | 'portrait' | 'square',
  ) {
    const similar = isTooSimilar(query);
    if (similar) {
      return {
        query,
        success: false as const,
        error: `Too similar to previous search "${similar}". Use a different subject.`,
      };
    }

    try {
      const apiKey = await resolveApiKey('Together');
      if (!apiKey) {
        return {
          query,
          success: false as const,
          error: 'Together.ai API key not configured. Use placeholder images.',
        };
      }

      const { width, height } = orientationToDimensions(orientation);

      // Generate `count` images with slightly varied prompts for variety
      const prompts = Array.from({ length: count }, (_, i) => ({
        prompt: count > 1 ? `${query}, variation ${i + 1}` : query,
        width,
        height,
      }));

      const images = await generateImages(apiKey, prompts, model);

      const normalized = query.toLowerCase().trim();
      usedQueries.push(normalized);

      return {
        query,
        success: true as const,
        images: images.map((img) => ({
          url: img.url,
          alt: img.alt,
          width: img.width,
          height: img.height,
        })),
      };
    } catch (error) {
      return {
        query,
        success: false as const,
        error: `Image generation failed: ${error instanceof Error ? error.message : 'Unknown error'}. Use placeholder.`,
      };
    }
  }

  const fetchForQuery = provider === 'together' ? fetchFromTogether : fetchFromPexels;
  const description = provider === 'together'
    ? 'Generate AI images for the website. Pass ALL image needs in one call. Returns { results: [{ query, success, images }] } — one entry per query. Use DIFFERENT queries per image for variety. Call ONCE with all queries before writing HTML.'
    : 'Batch-search stock photos from Pexels. Pass ALL image needs in one call. Returns { results: [{ query, success, images }] } — one entry per query. Use DIFFERENT queries per image for variety. Call ONCE with all queries before writing HTML.';

  return {
    searchImages: tool({
      description,
      inputSchema: z.object({
        queries: z
          .array(imageQuerySchema)
          .min(1)
          .max(12)
          .describe('Array of image searches to run in parallel. Each has query, count, and optional orientation.'),
      }),
      execute: async ({ queries }) => {
        const results = await Promise.all(
          queries.map((q) => fetchForQuery(q.query, q.count, q.orientation)),
        );

        const totalImages = results.reduce(
          (sum, r) => sum + (r.success && r.images ? r.images.length : 0),
          0,
        );

        return {
          success: true as const,
          totalImages,
          results,
        };
      },
    }),
  };
}
```

**Step 2: Commit**

```bash
git add src/lib/chat/tools/image-tools.ts
git commit -m "feat: add Together.ai routing to searchImages tool"
```

---

### Task 11: Build verification

**Step 1: Run the build**

```bash
npm run build
```

Expected: Clean build with no TypeScript errors.

**Step 2: Fix any type errors**

Common issues to watch for:
- `ImageIcon` may conflict — Lucide exports it as `ImageIcon` (not `Image`)
- `resolveApiKey` import needs to work in server-side tool context
- The `together.ts` client uses Node.js `fs` and `crypto` — fine since it only runs server-side

**Step 3: Run lint**

```bash
npm run lint
```

**Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve build/lint issues in image gen integration"
```

---

### Task 12: Manual smoke test

**Step 1: Start dev server**

```bash
npm run dev
```

**Step 2: Test Pexels mode (default)**

1. Open http://localhost:3000
2. Open Settings — verify "Images" tab appears with Pexels selected
3. Generate a website — confirm images still come from Pexels URLs
4. Download the site — verify images are included

**Step 3: Test Together.ai mode**

1. Add `TOGETHER_API_KEY` to `.env.local`
2. Open Settings > API Keys — verify Together.ai row appears, add key if not using env
3. Switch to Settings > Images > AI Generated, select FLUX Dev
4. Generate a new website
5. Verify images appear in preview (from `/generated/` paths)
6. Check `public/generated/` folder has .jpg files
7. Download the site — verify generated images are included

**Step 4: Test blueprint mode**

1. Enter a multi-page prompt (e.g., "Build a restaurant website with home, menu, about, contact pages")
2. Verify images generate during page generation without errors
3. Check that different pages get different images (deduplication works)

**Step 5: Commit any final fixes**

```bash
git add -A
git commit -m "fix: address issues found during manual testing"
```
