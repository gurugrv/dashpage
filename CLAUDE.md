# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

AI Builder - a simplified AI-powered website builder where users create websites by prompting. Uses AI tool calls (writeFiles, editBlock, editFiles) to generate self-contained HTML pages (Tailwind CDN, inline CSS/JS) rendered in an interactive iframe. Supports single-page chat mode and multi-page blueprint mode. Core loop: **prompt -> generate -> preview -> iterate**.

**Design philosophy:** Generated websites must be beautiful, creative, and aesthetically pleasing with a "wow" effect. Avoid generic or template-like output - every site should feel distinctive and polished with thoughtful typography, color, spacing, and visual hierarchy.

## Commands

```bash
# Development
npm run dev          # Start Next.js dev server (localhost:3000)
npm run build        # Production build
npm run lint         # ESLint (flat config, core-web-vitals + typescript)

# Database
docker compose up -d                    # Start PostgreSQL (postgres:17, port 5432)
npx prisma migrate dev                  # Run migrations
npx prisma generate                     # Regenerate Prisma client (output: src/generated/prisma/)

# UI Components
npx shadcn@latest add <component>       # Add shadcn/ui component (new-york style, RSC enabled)
```

No test framework is configured (no Jest/Vitest/Playwright).

## Architecture

**Stack:** Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS v4 + shadcn/ui + Prisma 7 + Vercel AI SDK 6

**Path alias:** `@/*` maps to `./src/*`

### Two Generation Modes

**Chat mode** (single-page) - Conversational prompt-and-iterate. AI uses tools to generate/edit one HTML file. Route: `POST /api/chat`.

**Blueprint mode** (multi-page) - Structured planning then parallel page generation. AI generates a Blueprint JSON (site structure, design system, pages), user reviews/edits it, then pages are generated in parallel. Routes: `POST /api/blueprint/{generate,components,pages}`.

### Data Flow (Chat Mode)

```
User prompt -> Builder.handleSubmit() -> useChat.sendMessage()
  -> POST /api/chat -> resolveChatExecution() (resolve provider/model/key + build system prompt)
  -> createWebsiteTools() (unified tool set for all modes)
  -> streamText() with tools -> createUIMessageStream() SSE stream
  -> Post-generation: validateBlocks() + extractComponents() on workingFiles
  -> Client useHtmlParser extraction priority:
     1) Tool output parts (writeFiles input, editBlock/editFiles output)
     2) Streaming code detection (live writeFiles input preview)
     3) Text-based HTML extraction (fallback if no tools invoked)
  -> ProjectFiles update -> iframe preview
  -> onFinish: sanitize + split (preface/summary) + persist assistant message + htmlArtifact
  -> if finishReason === 'length': auto-continue loop (max 3 segments, server-side)
  -> if interrupted/unload: POST /api/conversations/[id]/messages/partial
```

### Tool System

AI generates HTML via tool calls, not raw text output. One unified tool set (`createWebsiteTools()`) for all modes:

- `writeFiles` / `writeFile` - Create/rewrite complete HTML files
- `editBlock` - Block-ID or CSS selector targeting via Cheerio (replace, replaceInner, setText, setAttribute, addClass, removeClass, remove, insertBefore, insertAfter). Primary editing tool.
- `editFiles` - Search/replace operations with 5-tier matching (exact → whitespace-tolerant → token-based → fuzzy ≥85% → auto-correct ≥75%)
- `readFile` - Read file contents before editing
- `searchImages` - Batch photo search (Pexels)
- `searchIcons` - Batch SVG icon search
- `fetchUrl` - Fetch/parse web content (blocks localhost/private IPs)
- `webSearch` - Research via Brave (primary) / Tavily (fallback)

Tools defined in `src/lib/chat/tools/` - each file exports a factory function. Combined in `src/lib/chat/tools/index.ts`.

### Key Patterns

**Block-based editing** - AI generates `data-block` attributes on all semantic sections (nav, header, section, footer, aside, main). The `editBlock` tool targets blocks by ID (primary) or CSS selector (fallback). Post-generation pipeline (`validateBlocks`) auto-assigns missing block IDs. For multi-page sites, `extractComponents` detects duplicate nav/footer across pages and extracts to `_components/` files with placeholder injection (`<!-- @component:X -->`).

**Tool-based generation** - AI must call tools (writeFiles, editBlock, editFiles) to produce HTML. No fallback for text-only responses (no tool calls = empty preview). Client parser (`useHtmlParser`) extracts files from tool output parts only. System prompt defines tool workflows in `src/lib/prompts/sections/tool-output-format.ts`.

**ProjectFiles type** - `Record<string, string>` used everywhere. V1 single-page uses `{ "index.html": "..." }`. Multi-page blueprint mode uses multiple file keys.

**Closure safety via refs** - Builder uses refs (`currentFilesRef`, `activeConversationIdRef`, `partialSavedRef`) synced in useEffect. The `onFinish` callback reads from refs, not state, to avoid stale closures. Always use refs when accessing current values inside `onFinish` or similar async callbacks.

**Message splitting** - Assistant responses split into "preface" (before artifact) and "summary" (after artifact). Both persisted as separate DB messages. `htmlArtifact` (JSON ProjectFiles snapshot) stored only on artifact-containing messages.

**Shared components** - For multi-page sites, duplicate nav/footer are extracted to `_components/` files. Preview and download inject components from placeholders. The `editBlock` tool redirects edits on component blocks to the `_components/` file.

**Edit operations with fallback** - editFiles search/replace uses 5-tier matching. If operations fail, `editFailed` flag signals Builder to request a full HTML replacement.

**Auto-continue** - Server-side loop in `/api/chat` appends assistant + continue prompt and re-requests (up to 3 segments). Client-side `useAutoContinue` hook enables manual continue button if needed. Degenerate loop detection tracks previous segment text to avoid repeats.

**System prompt composition** - Modular sections in `src/lib/prompts/sections/`: base-rules, ui-ux-guidelines, design-quality, tool-output-format, context-blocks. Assembled dynamically with conditional first-gen vs edit-mode instructions.

**iframe sandboxing** - `sandbox="allow-scripts allow-forms allow-same-origin"`. CSP meta tag (`connect-src https: data: blob:`) injected to block same-origin API requests.

**Partial message persistence** - `use-streaming-persistence` auto-saves incomplete generations on stop/page unload. `isPartial: true` messages detected on resume.

**Build progress tracking** - `BuildProgressDetector` detects HTML landmarks via regex and emits phase/percent events. `useBuildProgress` hook tracks phases (explaining → html-started → styles → content → complete) and tool activity. UI in `BuildProgress.tsx`.

### Source Layout

- `src/app/page.tsx` - Dynamic-imports Builder (SSR disabled)
- `src/components/Builder.tsx` - Main orchestrator: wires useChat + sidebar + panels + settings
- `src/components/PreviewPanel.tsx` - Interactive iframe with device toggles + download
- `src/components/PromptPanel.tsx` - Chat messages + input + model selector
- `src/components/BuildProgress.tsx` - Streaming build progress with tool activity log
- `src/components/ConversationSidebar.tsx` - Multi-conversation management (drawer on mobile)
- `src/lib/chat/tools/` - Tool factories: `file-tools.ts`, `block-tools.ts`, `image-tools.ts`, `icon-tools.ts`, `web-tools.ts`, `search-tools.ts`, `index.ts`
- `src/lib/blocks/` - Post-generation pipeline: `validate-blocks.ts` (auto-assign data-block attrs), `extract-components.ts` (shared nav/footer extraction)
- `src/lib/providers/registry.ts` - Imports all provider configs, exports `PROVIDERS` record
- `src/lib/providers/configs/` - Individual provider configs (openrouter, anthropic, google, openai, deepinfra, minimax, moonshot, zai)
- `src/lib/prompts/system-prompt.ts` - Modular system prompt builder
- `src/lib/prompts/sections/` - Prompt sections: base-rules, ui-ux-guidelines, design-quality, tool-output-format, context-blocks
- `src/lib/parser/html-extractor.ts` - Streaming `<htmlOutput>` tag parser (legacy fallback)
- `src/lib/parser/edit-operations/` - `apply-edit-operations.ts` (5-tier search/replace), `edit-stream-extractor.ts`, `types.ts`
- `src/lib/parser/validate-artifact.ts` - Validates persistable HTML artifacts
- `src/lib/stream/build-progress-detector.ts` - HTML landmark detection + percent calculation
- `src/lib/blueprint/` - Blueprint system: `types.ts`, `detect-multi-page.ts`, `repair-json.ts`, `generate-shared-styles.ts`, `stream-utils.ts`
- `src/lib/blueprint/prompts/` - Blueprint-specific prompts: `blueprint-system-prompt.ts`, `page-system-prompt.ts`, `components-system-prompt.ts`
- `src/lib/search/` - Web search clients: `brave.ts` (primary), `tavily.ts` (fallback)
- `src/lib/keys/key-manager.ts` - AES-256-CBC encryption for DB-stored API keys
- `src/hooks/useHtmlParser.ts` - Parse priority: tool parts → streaming code → text HTML. Tracks `currentFiles` (live) vs `lastValidFiles` (completed)
- `src/hooks/useBuildProgress.ts` - Build progress + tool activity tracking
- `src/hooks/useAutoContinue.ts` - Client-side auto-continue tracking
- `src/hooks/useConversations.ts` - CRUD for conversation sidebar
- `src/hooks/useModels.ts` - Fetches + caches available models per provider
- `src/features/builder/hooks/` - `use-streaming-persistence.ts`, `use-conversation-actions.ts`, `use-model-selection.ts`
- `src/features/blueprint/` - Blueprint UI: `blueprint-card.tsx`, `font-picker.tsx`, `page-progress.tsx`
- `src/features/settings/` - API key management UI + `use-provider-keys.ts`
- `src/features/prompt/` - Prompt panel sub-components
- `src/features/preview/` - Preview panel sub-components

### API Routes

- `POST /api/chat` - Streaming chat with tools + auto-continue loop (up to 3 segments)
- `POST /api/chat/continue` - Manual continue for truncated generations
- `POST /api/blueprint/generate` - Generate blueprint JSON from prompt (structured output)
- `POST /api/blueprint/components` - Generate shared components (header/footer) from blueprint
- `POST /api/blueprint/pages` - Generate individual pages from blueprint (max 3 concurrent)
- `GET /api/blueprint/[conversationId]` - Fetch saved blueprint
- `GET /api/models` - Lists available models per configured provider
- `GET|POST /api/conversations` - List/create conversations
- `GET|PATCH|DELETE /api/conversations/[id]` - Single conversation CRUD
- `GET|POST /api/conversations/[id]/messages` - Messages for a conversation
- `POST /api/conversations/[id]/messages/partial` - Persist partial assistant output
- `GET|DELETE /api/conversations/[id]/generation-state` - Blueprint generation state
- `GET|POST|DELETE /api/keys` - API key management (encrypted storage)

### Database

PostgreSQL via Docker (`docker-compose.yml`: postgres:17, credentials builder/builder, db ai_builder). Prisma 7 with `@prisma/adapter-pg` driver adapter. Generated client at `src/generated/prisma/` (gitignored). Schema at `prisma/schema.prisma`. Five models:
- `Conversation` - title, provider, model, timestamps
- `Message` - role, content, `htmlArtifact` (JSON ProjectFiles), `isPartial` flag
- `Blueprint` - conversationId (unique), data (JSON blueprint spec)
- `GenerationState` - conversationId (unique), mode (chat/blueprint), phase, autoSegment, blueprintId, componentHtml, sharedStyles, completedPages, pageStatuses
- `ApiKey` - provider (unique), encryptedKey

## Environment

Copy `.env.example` to `.env.local`. Required: `DATABASE_URL`, `KEYS_ENCRYPTION_SECRET`. At least one LLM provider key (OpenRouter recommended - one key covers all models). Set `DEBUG_AI_STREAM_OUTPUT=true` to log full AI prompts/responses via `createStreamDebugLogger()`. The `.env` file is loaded by `prisma.config.ts` via `dotenv/config`.

## Detailed Plan

See `docs/plan.md` for the complete implementation plan, decisions log, component designs, and verification checklist.
