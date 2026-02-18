# AI Builder Simple - Design

## Overview

A stripped-down fork of AI Builder at `/Volumes/Work/MAG Centre/AI Builder Simple`. Core loop: prompt -> AI generates HTML via tools -> live iframe preview. No database, no discovery, no blueprints.

## Approach

Fork & Strip: copy the full project, surgically remove complex pipelines, keep the proven chat/tool/preview core.

## Architecture

### Single Page App

Split-pane layout:
- **Left**: Chat panel (messages + prompt input + model selector) + generations gallery sidebar
- **Right**: Preview panel (iframe with device toggles + download)
- **Settings dialog**: system prompt text area (free-form, stored in localStorage)

### Single API Route

`POST /api/chat` - streaming AI with tools. Stripped of auto-continue, block post-processing, telemetry, and persistence hooks.

### API Keys

Environment variables only (`.env.local`). No UI key management. Copied from the main app.

### Provider/Model Support

All 9 providers kept: OpenRouter, Anthropic, Google, OpenAI, DeepInfra, MiniMax, Moonshot, Z.ai, Cerebras. Model selection with localStorage persistence via `use-model-selection` hook.

### AI Tools (Core 4 Only)

- `writeFiles` / `writeFile` - Create/rewrite HTML files
- `editBlock` - Block-ID/CSS selector targeting via Cheerio
- `editFiles` - Search/replace with 4-tier matching
- `readFile` - Read file contents before editing

Removed: searchImages, searchIcons, fetchUrl, webSearch.

### System Prompt

- Modular sections kept (base-rules, ui-ux-guidelines, design-quality, tool-output-format)
- User can override via settings text area (stored in localStorage)
- Reset to default button
- Discovery/blueprint references stripped from prompt builder

### Site Gallery

**Storage**: `generations/` folder in project root.

```
generations/
  2026-02-18-143052-gpt4o/
    index.html
    metadata.json
  2026-02-18-144210-claude-sonnet/
    index.html
    metadata.json
```

**metadata.json**:
```json
{
  "model": "gpt-4o",
  "provider": "openrouter",
  "prompt": "Create a landing page for...",
  "timestamp": "2026-02-18T14:30:52Z",
  "title": "Landing page for..."
}
```

**API routes**:
- `POST /api/generations` - save HTML + metadata after generation
- `GET /api/generations` - list all generations (read folders)
- `GET /api/generations/[id]` - return HTML for preview

**UI**: Sidebar/drawer with past generations. Each shows prompt snippet, model badge (provider-colored), timestamp. Click loads into preview (read-only). Current chat stays active.

## What Gets Removed

| System | Files/Dirs |
|--------|-----------|
| Database | Prisma, docker-compose, all `/api/conversations/**`, `/api/keys/**` |
| Discovery | `useDiscovery`, `src/lib/discovery/`, `src/features/discovery/`, `/api/discovery/**`, `/api/places/**` |
| Blueprint | `useBlueprintGeneration`, `src/lib/blueprint/`, `src/features/blueprint/`, `/api/blueprint/**` |
| Conversations | `useConversations`, `ConversationSidebar`, `use-conversation-actions`, `use-streaming-persistence` |
| Build progress | `useBuildProgress`, `BuildProgress.tsx`, `build-progress-detector.ts` |
| Auto-continue | Server-side continuation loop, `useAutoContinue` |
| Block post-processing | `validate-blocks.ts`, `extract-components.ts` |
| Image generation | `useImageGenConfig`, `/api/images/**` |
| Telemetry | `generation-events.ts`, `generation-registry.ts` |
| Landing page | `LandingPage.tsx` |
| Partial persistence | `resume-card.tsx`, `interrupted-banner.tsx` |

## What Gets Kept

| System | Key Files |
|--------|----------|
| Chat route | `src/app/api/chat/route.ts` (simplified) |
| Tools | `file-tools.ts`, `block-tools.ts`, `tools/index.ts` |
| Providers | `registry.ts`, all 9 configs, `types.ts` |
| System prompt | `system-prompt.ts`, all sections in `sections/` |
| HTML parser | `useHtmlParser.ts` |
| Preview | `PreviewPanel.tsx`, `combine-files.ts` |
| Model selection | `use-model-selection.ts`, `useModels.ts` |
| Edit operations | `apply-edit-operations.ts` pipeline |
| UI components | shadcn components, resizable panels |

## Target File Structure

```
src/
  app/
    page.tsx
    layout.tsx
    api/
      chat/route.ts
      models/route.ts
      generations/
        route.ts            # GET (list) + POST (save)
        [id]/route.ts       # GET (single generation HTML)
  components/
    Builder.tsx
    PreviewPanel.tsx
    PromptPanel.tsx
    SystemPromptSettings.tsx  # NEW
    GenerationGallery.tsx     # NEW
  hooks/
    useHtmlParser.ts
    useModels.ts
    useGenerations.ts         # NEW
  features/
    builder/hooks/
      use-model-selection.ts
  lib/
    chat/
      tools/index.ts
      tools/file-tools.ts
      tools/block-tools.ts
      resolve-chat-execution.ts
      constants.ts
    prompts/
      system-prompt.ts
      sections/
    providers/
      registry.ts
      configs/
      types.ts
    parser/
      edit-operations/
    preview/
      combine-files.ts
  ui/                         # shadcn components
```

## Dependencies to Remove

- `@prisma/adapter-pg`, `@prisma/client`, `pg`, `prisma`
- `@googlemaps/js-api-loader`
- `jsonrepair`
- `next-themes` (if removing dark mode toggle)
- `@iconify*` packages

## Key Behavior

- No conversation history - chat resets on refresh
- System prompt user-editable via settings (localStorage)
- No auto-continue - truncated generations require manual follow-up
- No shared component extraction - single-page focus
- Generations auto-saved to `generations/` folder with model metadata
- Gallery sidebar for browsing past generations with model badges
