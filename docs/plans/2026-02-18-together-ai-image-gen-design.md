# Together.ai Image Generation Integration Design

## Overview

Replace/augment existing Pexels stock photo search with AI-generated images via Together.ai API. Users choose between stock photos (Pexels) and AI-generated images (Together.ai FLUX models) in settings. The `searchImages` tool routes transparently based on the user's choice — the AI doesn't need to know which backend is active.

## Decisions

- **Single tool with smart routing** — `searchImages` handles both Pexels and Together.ai based on settings. No separate `generateImages` tool.
- **Server-side storage** — Generated images saved to `public/generated/{uuid}.jpg` for persistence. Users download sites with real images.
- **API route boundary** — `POST /api/images/generate` handles Together.ai calls + file saving. Clean separation from tool logic.
- **localStorage for config** — Image gen provider/model stored client-side like blueprint model config. API key stored encrypted in DB via existing system.

## Settings & Configuration

### New localStorage config

Key: `ai-builder:image-gen-config`

```typescript
type ImageGenConfig = {
  provider: 'pexels' | 'together';  // default: 'pexels'
  model: string;                     // default: 'black-forest-labs/FLUX.1-dev'
}
```

### Together.ai API key

- Added to existing provider key system in `src/lib/providers/configs/`
- Env var: `TOGETHER_API_KEY`
- Encrypted DB storage via existing `/api/keys` endpoints
- Status displayed in Settings > API Keys tab

### Settings UI

New "Image Generation" tab in SettingsDialog:
- Radio/toggle: Pexels (stock photos) vs AI Generation (Together.ai)
- When AI selected: model dropdown with available FLUX models
- Hardcoded model list (no /api/models fetch needed — image models are fixed)

Together.ai API key row added to existing API Keys tab.

## Available Models (hardcoded)

| Model ID | Label | Price/img | Quality | Speed |
|----------|-------|-----------|---------|-------|
| `black-forest-labs/FLUX.1-schnell` | FLUX Schnell (Fast) | ~$0.003 | Good | ~1-2s |
| `black-forest-labs/FLUX.1-dev` | FLUX Dev (Balanced) | ~$0.025 | Great | ~3-5s |
| `black-forest-labs/FLUX.1.1-pro` | FLUX 1.1 Pro (Best) | ~$0.04 | Excellent | ~5-8s |

Default: FLUX Dev — best quality/cost balance for beautiful websites.

## API Route

### `POST /api/images/generate`

Request:
```json
{
  "prompts": [
    { "prompt": "modern office with floor-to-ceiling windows, natural light", "width": 1024, "height": 768 },
    { "prompt": "team meeting around a wooden table", "width": 1024, "height": 1024 }
  ],
  "model": "black-forest-labs/FLUX.1-dev"
}
```

Response:
```json
{
  "success": true,
  "images": [
    { "url": "/generated/a1b2c3d4.jpg", "width": 1024, "height": 768, "alt": "modern office with floor-to-ceiling windows" },
    { "url": "/generated/e5f6g7h8.jpg", "width": 1024, "height": 1024, "alt": "team meeting around a wooden table" }
  ]
}
```

Flow:
1. Validate request body (Zod)
2. Resolve Together.ai API key (env → DB decrypt)
3. Generate images in parallel (`Promise.all`) — call Together.ai for each prompt
4. Download each image URL from Together.ai response
5. Save to `public/generated/{uuid}.jpg`
6. Return local paths

Error handling:
- Missing API key → 401 with message
- Together.ai API error → 502 with details
- Individual prompt failures → partial success (return successful images + errors)

## Tool Integration

### Updated `createImageTools(options)`

New options:
```typescript
interface ImageToolOptions {
  imageProvider: 'pexels' | 'together';
  imageModel?: string; // Together.ai model ID
  // ...existing usedQueries, usedPhotoIds
}
```

Routing logic in `searchImages.execute`:
- `imageProvider === 'pexels'` → existing Pexels flow (unchanged)
- `imageProvider === 'together'` → transform queries into image gen prompts, call `/api/images/generate` internally, return same format

Output format is identical regardless of provider:
```typescript
{ url: string; alt: string; width: number; height: number; photographer?: string }
```

`photographer` field omitted for AI-generated images.

### Prompt Enhancement

The AI's search queries (e.g., "modern office") are short. For better AI generation, the tool enhances them:
- Append quality keywords: "professional photography, high resolution, detailed"
- Map orientation to width/height: landscape → 1024x768, portrait → 768x1024, square → 1024x1024

## Multi-Page Efficiency

- Batch queries in single tool call (existing array input, 1-5 per call)
- Parallel generation via `Promise.all` (existing pattern)
- For blueprint mode: images generated during page generation, not as a separate step
- Deduplication: same Jaccard similarity check prevents regenerating similar images across pages
- Shared component images (nav/footer) generated once, reused across pages

## File Storage

- Directory: `public/generated/`
- Naming: `{uuid}.jpg` (crypto.randomUUID)
- Format: JPEG (Together.ai `output_format: "jpeg"`)
- Gitignored: add `public/generated/` to `.gitignore`
- No automatic cleanup — manual deletion or future feature
- Auto-create directory on first write (`mkdir -p` equivalent)

## Data Flow

```
Settings UI
  → user picks "AI Generation" + FLUX Dev model
  → localStorage: ai-builder:image-gen-config = { provider: 'together', model: 'FLUX.1-dev' }

Builder.tsx
  → reads imageGenConfig from hook
  → passes imageProvider + imageModel to /api/chat (or /api/blueprint/*)

API route (/api/chat)
  → passes imageProvider + imageModel to createWebsiteTools()

createImageTools({ imageProvider: 'together', imageModel: '...' })
  → searchImages tool created with together routing

AI calls searchImages({ queries: [...] })
  → tool calls POST /api/images/generate
  → Together.ai API → download → save to /public/generated/
  → returns { url: '/generated/abc.jpg', alt, width, height }

AI uses in HTML: <img src="/generated/abc.jpg" alt="...">
  → PreviewPanel renders iframe with image
  → Download includes image file
```

## Files to Create/Modify

### New Files
- `src/lib/images/together.ts` — Together.ai API client
- `src/app/api/images/generate/route.ts` — Image generation API route
- `src/hooks/useImageGenConfig.ts` — Settings hook (localStorage)
- `src/features/settings/image-gen-settings.tsx` — Settings UI component

### Modified Files
- `src/lib/chat/tools/image-tools.ts` — Add provider routing
- `src/lib/chat/tools/index.ts` — Pass imageProvider option through
- `src/components/Builder.tsx` — Read imageGenConfig, pass to API calls
- `src/features/settings/settings-dialog.tsx` — Add Image Generation tab
- `src/lib/providers/configs/` — Add together provider for API key management
- `src/app/api/chat/route.ts` — Accept + forward imageProvider/imageModel
- `src/app/api/blueprint/*/route.ts` — Accept + forward imageProvider/imageModel
- `.gitignore` — Add `public/generated/`
- `.env.example` — Add `TOGETHER_API_KEY`
