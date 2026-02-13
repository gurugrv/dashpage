# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

AI Builder - a simplified AI-powered website builder where users create websites by prompting. Generates single self-contained HTML pages (with Tailwind CDN, inline CSS/JS) rendered in an interactive iframe. No WebContainer, no file system, no code editor. Core loop: **prompt -> generate -> preview -> iterate**.

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

### Data Flow

```
User prompt -> Builder.handleSubmit() -> useChat.sendMessage()
  -> POST /api/chat -> resolveChatExecution() (resolve provider/model/key + build system prompt)
  -> streamText() -> createUIMessageStream() SSE stream
  -> Client parse priority in useHtmlParser:
     1) <editOperations> extraction + applyEditOperations()
     2) JSON with files map
     3) <htmlOutput> fallback extraction
  -> ProjectFiles update -> iframe preview
  -> onFinish: sanitize + split (preface/summary) + persist assistant message + htmlArtifact
  -> if finishReason === 'length': auto-continue loop (max 3 segments, handled server-side in route)
  -> if interrupted/unload: POST /api/conversations/[id]/messages/partial
```

### Key Patterns

**ProjectFiles type** - `Record<string, string>` used everywhere instead of raw HTML strings. V1 always uses `{ "index.html": "..." }`. Future-proofs for multi-file projects.

**Closure safety via refs** - Builder uses refs (`currentFilesRef`, `activeConversationIdRef`, `partialSavedRef`) synced in useEffect. The `onFinish` callback reads from refs, not state, to avoid stale closures in async callbacks. This is critical - always use refs when accessing current values inside `onFinish` or similar callbacks.

**Message splitting** - Assistant responses are split into "preface" (explanation before artifact) and "summary" (after artifact) for cleaner display. Both are persisted as separate DB messages. `htmlArtifact` (JSON ProjectFiles snapshot) stored only on artifact-containing messages.

**Edit operations with fallback** - Edit operations are applied atomically. If any single operation fails (exact match then normalized match both miss), the entire apply fails and `editFailed` flag signals Builder to request a full HTML replacement instead.

**Auto-continue** - Dual-level: server-side loop in `/api/chat` route appends assistant + continue prompt and re-requests (up to 3 segments); client-side `useAutoContinue` hook enables manual continue button if needed.

**System prompt composition** - Built dynamically from modular sections: base rules, UI/UX guidelines, output format, timezone context, and conditionally: first-generation instructions OR current website context + edit mode instructions.

**iframe sandboxing** - Uses `sandbox="allow-scripts allow-forms allow-same-origin"`. The `allow-same-origin` is required for reliable external resource loading (Google Fonts, CDNs). A CSP meta tag (`connect-src https: data: blob:`) is injected into preview HTML to mitigate security impact by blocking same-origin HTTP fetch/XHR to the parent's API routes.

**Partial message persistence** - `use-streaming-persistence` auto-saves incomplete generations on stop/page unload. On resume, `isPartial: true` messages are detected and surfaced in UI.

### Source Layout

- `src/app/page.tsx` - Dynamic-imports Builder (SSR disabled)
- `src/components/Builder.tsx` - Main orchestrator: wires useChat + sidebar + panels + settings
- `src/components/PreviewPanel.tsx` - Interactive iframe with device toggles + download
- `src/components/PromptPanel.tsx` - Chat messages + input + model selector
- `src/components/ConversationSidebar.tsx` - Multi-conversation management (drawer on mobile)
- `src/lib/providers/registry.ts` - Provider registry: each config has `createModel()` factory, `staticModels`, `fetchModels()` async
- `src/lib/providers/{openrouter,anthropic,google,openai}.ts` - Individual provider configs
- `src/lib/prompts/system-prompt.ts` - Modular system prompt builder with conditional sections
- `src/lib/parser/html-extractor.ts` - Streaming `<htmlOutput>` tag parser (fallback strategy)
- `src/lib/parser/edit-operations/` - `edit-stream-extractor.ts` (XML parsing), `apply-edit-operations.ts` (search/replace with normalized fallback), `types.ts`
- `src/lib/parser/output-parser.ts` - Zod schema/types for structured output contracts
- `src/lib/keys/key-manager.ts` - AES-256-CBC encryption for DB-stored API keys
- `src/hooks/useHtmlParser.ts` - Parse priority chain: edit ops -> JSON files -> html tags. Tracks `currentFiles` (live) vs `lastValidFiles` (completed snapshot)
- `src/hooks/useAutoContinue.ts` - Client-side auto-continue tracking
- `src/hooks/useConversations.ts` - CRUD for conversation sidebar
- `src/hooks/useModels.ts` - Fetches + caches available models per provider
- `src/features/builder/hooks/use-streaming-persistence.ts` - Persist partial responses on stop/unload
- `src/features/builder/hooks/use-conversation-actions.ts` - Hydrates messages/files when switching conversations
- `src/features/builder/hooks/use-model-selection.ts` - Provider/model selection with fallback resolution
- `src/features/settings/` - API key management UI + `use-provider-keys.ts` hook
- `src/features/prompt/` - Prompt panel sub-components (message list, error/interrupted banners)
- `src/features/preview/` - Preview panel sub-components (empty state, toolbar, loading overlay)

### API Routes

- `POST /api/chat` - Streaming chat via `streamText()` + auto-continue loop (up to 3 segments)
- `POST /api/chat/continue` - Manual continue for truncated generations
- `GET /api/models` - Lists available models per configured provider
- `GET|POST /api/conversations` - List/create conversations
- `GET|PATCH|DELETE /api/conversations/[id]` - Single conversation CRUD
- `GET|POST /api/conversations/[id]/messages` - Messages for a conversation
- `POST /api/conversations/[id]/messages/partial` - Persist partial assistant output
- `GET|POST|DELETE /api/keys` - API key management (encrypted storage)

### Database

PostgreSQL via Docker (`docker-compose.yml`: postgres:17, credentials builder/builder, db ai_builder). Prisma 7 with `@prisma/adapter-pg` driver adapter. Generated client at `src/generated/prisma/` (gitignored). Schema at `prisma/schema.prisma`. Three models:
- `Conversation` - title, timestamps
- `Message` - role, content, `htmlArtifact` (JSON ProjectFiles), `isPartial` flag
- `ApiKey` - provider (unique), encryptedKey

## Environment

Copy `.env.example` to `.env.local`. Required: `DATABASE_URL`, `KEYS_ENCRYPTION_SECRET`. At least one LLM provider key (OpenRouter recommended - one key covers all models). Set `DEBUG_AI_STREAM_OUTPUT=true` to log full AI prompts/responses via `createStreamDebugLogger()`. The `.env` file is loaded by `prisma.config.ts` via `dotenv/config`.

## Detailed Plan

See `docs/plan.md` for the complete implementation plan, decisions log, component designs, and verification checklist.
