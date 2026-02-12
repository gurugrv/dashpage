# AGENTS.md

This file provides guidance to coding agents working in this repository.

## Project Intent

AI Builder is a prompt-to-website app. Users describe what they want, the app generates a complete single-page HTML artifact, then users iterate through chat while seeing a live preview.

Primary loop: `prompt -> generate -> preview -> iterate`.

## Stack

- Next.js 16 (App Router)
- React 19 + TypeScript
- Tailwind CSS v4 + shadcn/ui
- Prisma 7 + PostgreSQL
- Vercel AI SDK 6

## Current Runtime Flow (Important)

- UI sends chat requests with provider/model/current files to `POST /api/chat`.
- Server resolves provider config and system prompt in `src/lib/chat/resolve-chat-execution.ts`.
- Streaming response is returned through `createProgressStreamResponse`.
- Client parses assistant output in this order:
1. `<editOperations>` mode (targeted patching of prior HTML)
2. JSON object with `files`
3. `<htmlOutput>` fallback extraction
- Preview uses `ProjectFiles` and renders `index.html`.
- On truncated generation, auto-continue calls `POST /api/chat/continue` (max 3 attempts).
- Partial assistant output can be persisted while streaming via `POST /api/conversations/[id]/messages/partial`.

## Non-Negotiable Product Behaviors

- Generated output should be represented as `ProjectFiles` (`Record<string, string>`), not ad-hoc raw HTML strings.
- V1 artifact is expected to use `index.html` as the main file key.
- Preview iframe must stay sandboxed (`allow-scripts allow-forms`; do not add `allow-same-origin` unless explicitly requested).
- Streaming parser behavior must stay compatible with current triage order: edit operations -> JSON files -> `<htmlOutput>`.
- Auto-continue behavior for truncated generations should preserve full-document replacement semantics.
- Assistant message persistence must preserve sanitization (`sanitizeAssistantMessage`) before DB writes.
- Conversation resume behavior should continue to support partial assistant messages (`isPartial`).

## Working Rules For Agents

- Make minimal, targeted edits that preserve existing architecture.
- Prefer fixing root causes over introducing compatibility hacks.
- Do not silently change API contracts, DB schema, or message formats.
- If a schema or contract change is required, update all affected layers in the same change.
- Preserve TypeScript strictness; avoid `any` unless strongly justified.
- Reuse existing utilities/hooks before creating new abstractions.
- Keep UI behavior responsive on both desktop and mobile.

## API Surface (Current)

- `POST /api/chat`
- `POST /api/chat/continue`
- `GET|POST /api/conversations`
- `GET|PATCH|DELETE /api/conversations/[id]`
- `GET|POST /api/conversations/[id]/messages`
- `POST /api/conversations/[id]/messages/partial`
- `GET /api/models`
- `GET|POST|DELETE /api/keys`

## Source Map

- `src/components/Builder.tsx`: main orchestration
- `src/components/PromptPanel.tsx`: chat panel
- `src/components/PreviewPanel.tsx`: live iframe preview
- `src/components/ConversationSidebar.tsx`: conversation management
- `src/hooks/useHtmlParser.ts`: edit ops + JSON + tag-based parsing path
- `src/hooks/useAutoContinue.ts`: continuation for truncated model outputs
- `src/hooks/useConversations.ts`: conversation CRUD state
- `src/features/builder/hooks/use-streaming-persistence.ts`: partial save on stop/unload
- `src/features/builder/hooks/use-conversation-actions.ts`: message load/hydration
- `src/lib/prompts/system-prompt.ts`: output/style behavior constraints
- `src/lib/chat/*`: chat streaming helpers and execution flow
- `src/lib/parser/edit-operations/*`: localized HTML edit extraction + apply logic
- `prisma/schema.prisma`: data model (`Conversation`, `Message`, `ApiKey`)

## Commands

```bash
# App
npm run dev
npm run build
npm run lint

# Local DB
docker compose up -d
npx prisma migrate dev
npx prisma generate
```

## Environment

Expected local setup:

- `.env.local` with `DATABASE_URL` and `KEYS_ENCRYPTION_SECRET`
- At least one provider API key configured (OpenRouter commonly used)
- Prisma client is generated to `src/generated/prisma/`

## Data Model Notes

- `Message.htmlArtifact` stores generated files snapshot (JSON).
- `Message.isPartial` marks interrupted/in-progress assistant output persisted via partial endpoint.

## Change Checklist (Before Hand-off)

1. Run `npm run lint`.
2. If behavior changed, run `npm run build`.
3. If Prisma schema changed, run `npx prisma generate` and required migration flow.
4. Verify core UX path still works: send prompt, stream response, preview updates, conversation persists.
5. Verify interruption path if touched: stop/refresh during streaming persists partial and reload restores state.
6. Note any skipped verification explicitly.

## PR/Review Expectations

When proposing changes, include:

- What changed (files and behavior)
- Why this approach was chosen
- Risks/regressions to watch
- Exact verification performed

Keep explanations concise and concrete.
