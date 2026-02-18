# Technical Architecture

## Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js (App Router, Turbopack) | 16.1 |
| Runtime | React | 19.2 |
| Language | TypeScript | 5.x |
| Styling | Tailwind CSS v4 + tw-animate-css | 4.x |
| UI Components | shadcn/ui (new-york style) + Radix UI + Base UI | - |
| Database | PostgreSQL (Docker) | 17 |
| ORM | Prisma (with `@prisma/adapter-pg` driver adapter) | 7.4 |
| AI SDK | Vercel AI SDK | 6.x |
| Validation | Zod | 4.x |
| Maps | Google Places API (`@googlemaps/js-api-loader`) | - |
| Icons | Iconify (Lucide, Heroicons, Tabler, Phosphor) | local JSON |
| HTML Parsing | Cheerio | 1.2 |
| Fuzzy Matching | approx-string-match | 2.0 |
| JSON Repair | jsonrepair | 3.x |
| ZIP Export | JSZip | 3.x |
| Markdown | react-markdown | 10.x |

Path alias: `@/*` maps to `./src/*`

---

## AI Provider Architecture

10 LLM providers supported via a unified registry pattern. Each provider exports a config object; the registry (`src/lib/providers/registry.ts`) combines them into a single `PROVIDERS` record.

| Provider | Purpose | Config |
|----------|---------|--------|
| OpenRouter | Primary LLM gateway (one key, all models) | `configs/openrouter.ts` |
| Anthropic | Direct Claude access | `configs/anthropic.ts` |
| Google | Gemini models | `configs/google.ts` |
| OpenAI | GPT models | `configs/openai.ts` |
| DeepInfra | Open-weight models | `configs/deepinfra.ts` |
| Cerebras | Fast inference | `configs/cerebras.ts` |
| MiniMax | Chinese LLM provider | `configs/minimax.ts` |
| Moonshot | Chinese LLM provider | `configs/moonshot.ts` |
| Z.ai | LLM provider | `configs/zai.ts` |
| Together | Image generation only (FLUX.1-dev) | `configs/together.ts` |

Model selection is configurable per generation step in blueprint mode (planning, components, pages, assets).

Custom fetch wrapper in `src/lib/providers/openrouter-fetch.ts` handles reasoning token control for OpenRouter.

---

## Generation Flow

### Three-Phase Architecture

```
1. DISCOVERY (optional)
   User prompt → AI analysis → business detection → targeted questions
   → Google Places address autocomplete → BusinessProfile persistence

2. CHAT MODE (single-page)
   Prompt → POST /api/chat → system prompt + tools → streamText()
   → tool calls (writeFiles/editBlock/editFiles) → SSE stream → iframe preview

3. BLUEPRINT MODE (multi-page)
   Prompt → blueprint JSON generation → user review/edit
   → shared components generation (header/footer)
   → shared assets generation (styles.css + scripts.js)
   → parallel page generation (max 3 concurrent)
   → post-processing (block validation + component extraction)
```

### Chat Mode Data Flow

```
User prompt
  → Builder.handleSubmit()
  → useChat.sendMessage()
  → POST /api/chat
  → resolveChatExecution() — resolve provider/model/key + build system prompt
  → createWebsiteTools() — unified tool set
  → streamText() with tools
  → createUIMessageStream() SSE stream
  → Post-generation: validateBlocks() + extractComponents()
  → Client useHtmlParser extraction:
     1) Tool output parts (writeFiles input, editBlock/editFiles output)
     2) Streaming code detection (live writeFiles input preview)
     3) Text-based HTML extraction (fallback)
  → ProjectFiles update → iframe preview
  → onFinish: sanitize + split (preface/summary) + persist + htmlArtifact
  → if finishReason === 'length': auto-continue (max 3 segments, server-side)
  → if interrupted/unload: POST /api/conversations/[id]/messages/partial
```

### Blueprint Mode Steps

| Step | Route | Purpose |
|------|-------|---------|
| 1. Generate | `POST /api/blueprint/generate` | Structured JSON: site structure, design system, pages |
| 2. Components | `POST /api/blueprint/components` | Shared header/footer HTML |
| 3. Assets | `POST /api/blueprint/assets` | Shared `styles.css` + `scripts.js` |
| 4. Pages | `POST /api/blueprint/pages` | Individual page HTML (max 3 concurrent) |

---

## Tool System

AI generates HTML via tool calls, not raw text output. One unified tool set (`createWebsiteTools()`) for all modes. Tools defined in `src/lib/chat/tools/` — each file exports a factory function, combined in `index.ts`.

### Tools

| Tool | File | Purpose |
|------|------|---------|
| `writeFiles` | `file-tools.ts` | Create/rewrite multiple HTML files at once |
| `writeFile` | `file-tools.ts` | Create/rewrite a single HTML file |
| `editBlock` | `block-tools.ts` | DOM manipulation via block ID or CSS selector (Cheerio). Operations: replace, replaceInner, setText, setAttribute, addClass, removeClass, remove, insertBefore, insertAfter |
| `editFiles` | `file-tools.ts` | Search/replace with 4-tier matching |
| `readFile` | `file-tools.ts` | Read file contents (supports startLine/endLine) |
| `deleteFile` | `file-tools.ts` | Delete a page (guards: no index.html, no referenced components) |
| `searchImages` | `image-tools.ts` | AI image generation via Together.ai FLUX.1-dev |
| `searchIcons` | `icon-tools.ts` | SVG icon search via local Iconify (Lucide, Heroicons, Tabler, Phosphor) |
| `fetchUrl` | `web-tools.ts` | Fetch/parse web content (blocks localhost/private IPs) |
| `webSearch` | `search-tools.ts` | Web research via Brave (primary) / Tavily (fallback) |

### Tool Output → Client Parsing

The client parser (`useHtmlParser`) extracts files exclusively from tool output parts. No fallback for text-only AI responses — if the AI doesn't call tools, the preview stays empty.

Input normalization (`normalizeFilesInput` in `file-tools.ts`) handles malformed AI output: array formats, nested objects, metadata key stripping, directory wrapper patterns.

### Edit Matching Tiers

`editFiles` search/replace uses progressive fallback:

1. **Exact match** — literal string comparison
2. **Whitespace-tolerant** — normalized whitespace comparison
3. **Token-based** — tokenized comparison ignoring formatting
4. **Fuzzy match** — Levenshtein distance with ≥85% threshold

If all tiers fail, `editFailed` flag signals the client to request a full HTML replacement.

---

## Block System

Every semantic HTML element gets a `data-block="unique-id"` attribute, giving the editing layer stable DOM handles regardless of AI output variation.

**Post-generation pipeline:**

1. `validateBlocks()` (`src/lib/blocks/validate-blocks.ts`) — auto-assigns missing `data-block` IDs to semantic elements (`nav`, `header`, `main`, `section`, `footer`, `aside`)

2. `extractComponents()` (`src/lib/blocks/extract-components.ts`) — for multi-page sites, detects structurally similar nav/footer across pages using Jaccard-similarity structural skeleton algorithm. Extracts duplicates to `_components/` files with `<!-- @component:X -->` placeholder injection.

**Component editing:** The `editBlock` tool redirects edits on component blocks to the corresponding `_components/` file.

---

## Interactivity Layer

All interactive patterns use Alpine.js CDN directives, eliminating inline JavaScript:

- **Plugins:** `@alpinejs/collapse`, `@alpinejs/intersect`
- **Patterns:** accordion, carousel, counter, mobile menu, scroll reveal, tabs
- **Prompt integration:** `INTERACTIVITY_SECTION` injected into both chat and blueprint system prompts (`src/lib/prompts/sections/interactivity.ts`)

`[x-cloak]` CSS rule injected into base rules to prevent flash of unstyled Alpine content.

---

## System Prompt Composition

Modular sections assembled dynamically based on generation context:

| Section | File | Purpose |
|---------|------|---------|
| Base rules | `base-rules.ts` | Core HTML generation rules, Alpine.js CDN tags |
| UI/UX guidelines | `ui-ux-guidelines.ts` | Design patterns and responsive rules |
| Design quality | `design-quality.ts` | Aesthetic standards, typography, color |
| Tool output format | `tool-output-format.ts` | Tool usage instructions for the AI |
| Context blocks | `context-blocks.ts` | Dynamic context injection |
| Interactivity | `interactivity.ts` | Alpine.js pattern reference |
| Temporal context | `temporal-context.ts` | Current date/timezone for copyright years |

Builder: `src/lib/prompts/system-prompt.ts`

Conditional logic switches between first-generation and edit-mode instructions.

Blueprint-specific prompts in `src/lib/blueprint/prompts/`: `blueprint-system-prompt.ts`, `page-system-prompt.ts`, `components-system-prompt.ts`, `assets-system-prompt.ts`.

---

## Discovery System

Optional business intake flow that detects business-related prompts and collects structured data before generation.

**State machine** (`src/hooks/useDiscovery.ts`):
```
idle → picking → analyzing → asking → evaluating → confirming → complete/skipped
```

**Pipeline:**
1. `analyze-prompt.ts` — AI determines if the prompt describes a business site
2. Question cards presented to user (contact info, services, hours)
3. Google Places autocomplete for address enrichment (`src/lib/places/google-places.ts`)
4. `evaluate-completeness.ts` — AI checks if enough data was collected
5. `build-business-context.ts` — assembles collected data into prompt context
6. Persisted as `BusinessProfile` for reuse across conversations

Blueprint `siteFacts` field bridges discovery data into generation prompts.

---

## Database Schema

PostgreSQL 17 via Docker. Prisma 7 with driver adapter. Generated client at `src/generated/prisma/` (gitignored).

### Models (7)

| Model | Table | Purpose |
|-------|-------|---------|
| `Conversation` | `conversations` | Session container with provider/model/businessProfile references |
| `Message` | `messages` | Chat messages with `htmlArtifact` (JSON ProjectFiles), `isPartial` flag, `finishId` |
| `Blueprint` | `blueprints` | One-to-one with conversation. Stores blueprint JSON spec. |
| `GenerationState` | `generation_states` | Pipeline state: mode, phase, segments, component HTML, shared styles, page statuses |
| `ApiKey` | `api_keys` | Provider API keys (AES-256-CBC encrypted via `src/lib/keys/key-manager.ts`) |
| `BusinessProfile` | `business_profiles` | Business data: name, contact, address, coordinates, placeId, categories, hours, services, social media |
| `GenerationEvent` | `generation_events` | Telemetry: per-generation cost, tokens, duration, tool calls, repair/fallback flags |

### Key Relationships

- `Conversation` → many `Message`
- `Conversation` → one `Blueprint` (optional)
- `Conversation` → one `GenerationState` (optional)
- `Conversation` → one `BusinessProfile` (optional, via `businessProfileId`)
- `GenerationEvent` → references `conversationId` (no FK constraint)

---

## API Routes

### Chat
| Method | Route | Purpose |
|--------|-------|---------|
| `POST` | `/api/chat` | Streaming chat with tools + auto-continue loop (max 3 segments) |

### Blueprint
| Method | Route | Purpose |
|--------|-------|---------|
| `POST` | `/api/blueprint/generate` | Generate blueprint JSON (structured output) |
| `POST` | `/api/blueprint/components` | Generate shared header/footer |
| `POST` | `/api/blueprint/assets` | Generate shared styles.css + scripts.js |
| `POST` | `/api/blueprint/pages` | Generate pages (max 3 concurrent) |
| `GET` | `/api/blueprint/[conversationId]` | Fetch saved blueprint |

### Conversations
| Method | Route | Purpose |
|--------|-------|---------|
| `GET\|POST` | `/api/conversations` | List / create |
| `GET\|PATCH\|DELETE` | `/api/conversations/[id]` | Single CRUD |
| `GET\|POST` | `/api/conversations/[id]/messages` | Messages for conversation |
| `POST` | `/api/conversations/[id]/messages/partial` | Persist partial output |
| `POST` | `/api/conversations/[id]/messages/batch` | Atomic batch persistence |
| `GET\|DELETE` | `/api/conversations/[id]/generation-state` | Blueprint generation state |

### Infrastructure
| Method | Route | Purpose |
|--------|-------|---------|
| `GET` | `/api/models` | Available models per provider |
| `GET\|POST\|DELETE` | `/api/keys` | API key management (encrypted) |
| `POST\|GET` | `/api/business-profiles` | Business profile create/list |
| `GET\|PATCH\|DELETE` | `/api/business-profiles/[id]` | Business profile CRUD |
| `POST` | `/api/discovery/analyze` | AI prompt analysis for business detection |
| `POST` | `/api/discovery/evaluate` | Completeness evaluation |
| `POST` | `/api/places/details` | Google Places enrichment |
| `GET` | `/api/places/config` | Google Places config check |
| `GET` | `/api/images/proxy` | Image proxy |
| `POST` | `/api/images/generate` | Together.ai FLUX.1-dev image generation |

---

## Telemetry

`GenerationEvent` model tracks every AI generation call. Recorded from all API routes via `src/lib/telemetry/generation-events.ts`.

**Fields tracked:**
- `scope` — chat, blueprint-generate, blueprint-components, blueprint-pages, blueprint-assets
- `provider`, `model` — which AI was used
- `inputTokens`, `outputTokens` — token consumption
- `durationMs` — wall-clock generation time
- `costUsd` — computed from LiteLLM pricing data (`src/lib/chat/model-pricing.ts`)
- `toolCallCount` — number of tool invocations
- `hasFileOutput` — whether the generation produced files
- `repairTriggered` — whether JSON/HTML repair was needed
- `textFallback` — whether the AI failed to use tools
- `finishReason` — stop, length, aborted, superseded

**Indexes:** `conversationId`, `provider + model`, `createdAt`

---

## Streaming & Progress

**SSE streaming:** `createUIMessageStream()` streams tool activity and code deltas to the client in real time.

**Build progress detection** (`src/lib/stream/build-progress-detector.ts`):
- Regex-based HTML landmark detection
- Character-count-based percentage calculation
- Emits phase transitions: head → styles → body-started → navigation → footer → scripts → html-complete → fileArtifact-complete

**Client hooks:**
- `useBuildProgress` — tracks phases + tool activity
- `useAutoContinue` — client-side continue button for truncated generations
- `use-streaming-persistence` — auto-saves incomplete generations on stop/page unload

**Auto-continue:** Server-side loop in `/api/chat` detects `finishReason === 'length'`, appends continue prompt, re-requests (max 3 segments). Degenerate loop detection compares previous segment text.

---

## Security

- **API key encryption:** AES-256-CBC via `src/lib/keys/key-manager.ts`, requires `KEYS_ENCRYPTION_SECRET` env var
- **iframe sandboxing:** `sandbox="allow-scripts allow-forms allow-same-origin"` with CSP meta tag (`connect-src https: data: blob:`) to block same-origin API requests
- **URL fetching:** `fetchUrl` tool blocks localhost and private IP ranges
- **Input validation:** Zod schemas on all API routes

---

## Key Architectural Patterns

**ProjectFiles type** — `Record<string, string>` used everywhere. Single-page: `{ "index.html": "..." }`. Multi-page: multiple file keys including `_components/` for shared elements.

**Closure safety via refs** — Builder uses refs (`currentFilesRef`, `activeConversationIdRef`, `partialSavedRef`) synced in useEffect. The `onFinish` callback reads from refs to avoid stale closures.

**Message splitting** — Assistant responses split into "preface" (before artifact) and "summary" (after artifact). Both persisted as separate DB messages. `htmlArtifact` (JSON ProjectFiles snapshot) stored only on artifact-containing messages.

---

## Source Layout

```
src/
├── app/
│   ├── page.tsx                          # Dynamic-imports Builder (SSR disabled)
│   └── api/
│       ├── chat/route.ts                 # Streaming chat + auto-continue
│       ├── blueprint/                    # generate, components, assets, pages, [conversationId]
│       ├── conversations/                # CRUD + messages + generation-state
│       ├── keys/                         # API key management
│       ├── models/                       # Available models
│       ├── business-profiles/            # Business profile CRUD
│       ├── discovery/                    # analyze, evaluate
│       ├── places/                       # Google Places details + config
│       └── images/                       # proxy, generate
├── components/
│   ├── Builder.tsx                       # Main orchestrator
│   ├── PreviewPanel.tsx                  # iframe + device toggles + download
│   ├── PromptPanel.tsx                   # Chat messages + input + model selector
│   ├── BuildProgress.tsx                 # Streaming progress UI
│   └── ConversationSidebar.tsx           # Multi-conversation drawer
├── hooks/
│   ├── useHtmlParser.ts                  # Tool output → ProjectFiles extraction
│   ├── useBuildProgress.ts               # Progress + tool activity tracking
│   ├── useAutoContinue.ts                # Client-side continue
│   ├── useConversations.ts               # Conversation CRUD
│   ├── useModels.ts                      # Model fetching + caching
│   ├── useDiscovery.ts                   # Discovery state machine
│   ├── useBusinessProfiles.ts            # Business profile CRUD
│   └── useBlueprintGeneration.ts         # Blueprint with page status tracking
├── features/
│   ├── builder/hooks/                    # streaming-persistence, conversation-actions, model-selection
│   ├── blueprint/                        # Blueprint UI components
│   ├── discovery/                        # Discovery UI: questions, autocomplete, profiles, summary
│   ├── settings/                         # API key management UI
│   ├── prompt/                           # Prompt panel sub-components
│   └── preview/                          # Preview panel sub-components
└── lib/
    ├── chat/
    │   ├── tools/                        # file-tools, block-tools, image-tools, icon-tools, web-tools, search-tools
    │   └── model-pricing.ts              # LiteLLM pricing data
    ├── blocks/                           # validate-blocks, extract-components
    ├── providers/
    │   ├── registry.ts                   # Provider registry
    │   ├── configs/                      # 10 provider configs
    │   └── openrouter-fetch.ts           # Custom fetch with reasoning control
    ├── prompts/
    │   ├── system-prompt.ts              # Modular prompt builder
    │   ├── sections/                     # base-rules, ui-ux, design, tools, context, interactivity
    │   ├── temporal-context.ts           # Date/timezone injection
    │   └── manifest/                     # Prompt manifest generation
    ├── blueprint/
    │   ├── types.ts, detect-multi-page.ts, repair-json.ts, generate-shared-styles.ts, stream-utils.ts
    │   └── prompts/                      # blueprint, page, components, assets system prompts
    ├── parser/
    │   ├── html-extractor.ts             # Legacy <htmlOutput> parser
    │   ├── validate-artifact.ts          # Artifact validation
    │   └── edit-operations/              # apply-edit-operations, edit-stream-extractor
    ├── stream/
    │   └── build-progress-detector.ts    # HTML landmark detection
    ├── discovery/                        # analyze-prompt, evaluate-completeness, build-business-context
    ├── places/google-places.ts           # Google Places API
    ├── search/                           # brave.ts (primary), tavily.ts (fallback)
    ├── images/                           # together.ts (FLUX.1-dev)
    ├── icons/iconify.ts                  # Local Iconify database
    ├── keys/key-manager.ts              # AES-256-CBC encryption
    └── telemetry/generation-events.ts    # GenerationEvent recording
```

---

## Environment

Copy `.env.example` to `.env.local`.

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `KEYS_ENCRYPTION_SECRET` | Yes | AES-256-CBC key for API key storage |
| LLM provider key(s) | Yes (at least one) | OpenRouter recommended (one key, all models) |
| `GOOGLE_PLACES_API_KEY` | No | Server-side Places API |
| `NEXT_PUBLIC_GOOGLE_PLACES_KEY` | No | Client-side Places autocomplete |
| `TOGETHER_AI_API_KEY` | No | AI image generation |
| `DEBUG_AI_STREAM_OUTPUT` | No | Log full AI prompts/responses |

---

*Last updated: February 18, 2026*
