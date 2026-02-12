# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

AI Builder - a simplified AI-powered website builder where users create websites by prompting. Generates single self-contained HTML pages (with Tailwind CDN, inline CSS/JS) rendered in an interactive iframe. Inspired by bolt.diy/lovable.dev but much simpler: no WebContainer, no file system, no code editor. Core loop: **prompt -> generate -> preview -> iterate**.

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

## Architecture

**Stack:** Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS v4 + shadcn/ui + Prisma 7 + Vercel AI SDK 6

**Data flow:**
```
User prompt -> sendMessage() -> POST /api/chat -> resolveChatExecution()
-> streamText() + system prompt -> createProgressStreamResponse() SSE stream
-> Client parse order in useHtmlParser:
   1) <editOperations> extraction + applyEditOperations()
   2) JSON with files map
   3) <htmlOutput> fallback extraction
-> ProjectFiles update -> iframe preview
-> onFinish: save assistant message + htmlArtifact
-> if finishReason === 'length': POST /api/chat/continue (max 3 attempts)
-> if interrupted/unload: POST /api/conversations/[id]/messages/partial
```

**Key patterns:**
- `ProjectFiles` type (`Record<string, string>`) used everywhere instead of raw HTML strings. V1 always uses `{ "index.html": "..." }` key.
- API key resolution supports env + encrypted DB via `key-manager.ts`.
- `sendMessage()` receives fresh `body` at call time (currentFiles, provider, model) to avoid stale closures
- `onFinish` callback handles both DB persistence and auto-continue detection
- Builder component uses refs (`currentFilesRef`, `activeConversationIdRef`) to avoid stale closure issues in async callbacks
- iframe uses `sandbox="allow-scripts allow-forms"` (NO `allow-same-origin` to prevent XSS)
- Auto-continue on token limit: requests full HTML replacement (not fragment concatenation), up to 3 retries
- Assistant content is sanitized before persistence via `sanitizeAssistantMessage()`
- Partial assistant messages are persisted with `isPartial = true` and surfaced in UI on resume

### Source Layout

- `src/app/page.tsx` - Dynamic-imports Builder (SSR disabled)
- `src/components/Builder.tsx` - Main orchestrator: wires useChat + sidebar + panels + settings
- `src/components/PreviewPanel.tsx` - Interactive iframe with device toggles + download
- `src/components/PromptPanel.tsx` - Chat messages + input + model selector
- `src/components/ConversationSidebar.tsx` - Multi-conversation management (drawer on mobile)
- `src/lib/providers/registry.ts` - 4 LLM providers (OpenRouter, Anthropic, Google, OpenAI) with factory functions + dynamic model fetching
- `src/lib/prompts/system-prompt.ts` - System prompt with `<current_website>` context injection and anti-generic-aesthetic rules
- `src/lib/parser/html-extractor.ts` - Streaming `<htmlOutput>` tag parser (fallback)
- `src/lib/parser/edit-operations/*` - `<editOperations>` extraction + safe apply logic
- `src/lib/parser/output-parser.ts` - Zod schema/types for structured output contracts
- `src/lib/keys/key-manager.ts` - AES-256-CBC encryption for DB-stored API keys
- `src/hooks/useHtmlParser.ts` - Parse priority: edit operations -> JSON files -> html tags
- `src/hooks/useAutoContinue.ts` - Auto-continue on `finishReason === 'length'`
- `src/hooks/useConversations.ts` - CRUD for conversation sidebar
- `src/hooks/useModels.ts` - Fetches + caches available models per provider
- `src/features/builder/hooks/use-streaming-persistence.ts` - Persist partial responses on stop/unload
- `src/features/builder/hooks/use-conversation-actions.ts` - Hydrates messages/files when switching conversations

### API Routes

- `POST /api/chat` - Streaming chat via `streamText()` + `createProgressStreamResponse()`
- `POST /api/chat/continue` - Auto-continue truncated generations
- `GET /api/models` - Lists available models per configured provider
- `GET|POST /api/conversations` - List/create conversations
- `GET|PATCH|DELETE /api/conversations/[id]` - Single conversation CRUD
- `GET|POST /api/conversations/[id]/messages` - Messages for a conversation
- `POST /api/conversations/[id]/messages/partial` - Persist partial assistant output
- `GET|POST|DELETE /api/keys` - API key management (encrypted storage)

### Database

PostgreSQL via Docker. Prisma 7 with `@prisma/adapter-pg` (driver adapter pattern). Generated client at `src/generated/prisma/` (gitignored). Three models:
- `Conversation`
- `Message` (`htmlArtifact` JSON snapshot + `isPartial` flag)
- `ApiKey` (encrypted)

## Environment

Copy `.env.example` to `.env.local`. Required: `DATABASE_URL`, `KEYS_ENCRYPTION_SECRET`. At least one LLM provider key (OpenRouter recommended - one key covers all models). The `.env` file is loaded by `prisma.config.ts` via `dotenv/config`.

## Detailed Plan

See `docs/plan.md` for the complete implementation plan, decisions log, component designs, and verification checklist.
