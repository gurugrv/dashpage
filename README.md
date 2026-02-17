# AI Builder

AI-powered website builder where users create websites by prompting. Describe what you want, and AI generates beautiful, self-contained HTML pages with Tailwind CSS - rendered live in an interactive preview.

## How It Works

```
Prompt → (Discovery) → Generate → Preview → Iterate
```

1. **Discovery** (optional) - For business sites, AI detects the intent and asks targeted questions (contact info, services, hours) with Google Places address autocomplete. Collected data is saved as a reusable business profile.

2. **Chat mode** - Single-page conversational generation. Prompt, preview in the iframe, then refine with follow-up prompts. AI uses tools (`writeFiles`, `editBlock`, `editFiles`) to produce and modify HTML.

3. **Blueprint mode** - Multi-page site planning. AI generates a structured blueprint (site map, design system, page descriptions), you review and edit it, then all pages are generated in parallel.

## Features

- **Live preview** with desktop/tablet/mobile device toggles
- **Block-based editing** - AI targets semantic sections (`data-block` attributes) for precise edits
- **Image & icon search** - Built-in Pexels photo search and SVG icon library (Lucide, Heroicons, Phosphor, Tabler)
- **Web research** - AI can search the web and fetch URLs to inform generation
- **Multi-conversation** sidebar with history persistence
- **Auto-continue** for long generations (up to 3 server-side continuation segments)
- **Streaming progress** with real-time build phase tracking
- **Download** generated sites as ZIP
- **9 AI providers** - OpenRouter, Anthropic, Google, OpenAI, DeepInfra, Cerebras, MiniMax, Moonshot, Z.ai
- **Per-step model config** for blueprint mode (different models for planning, research, components, pages)
- **Business profiles** - Persistent storage of business details for reuse across conversations

## Tech Stack

Next.js 16 (App Router) | React 19 | TypeScript | Tailwind CSS v4 | shadcn/ui | Prisma 7 | Vercel AI SDK 6 | PostgreSQL 17

## Getting Started

### Prerequisites

- Node.js 20+
- Docker (for PostgreSQL)

### Setup

```bash
# 1. Install dependencies
npm install

# 2. Start PostgreSQL
docker compose up -d

# 3. Configure environment
cp .env.example .env.local
# Edit .env.local:
#   - KEYS_ENCRYPTION_SECRET (generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
#   - At least one LLM provider key (OPENROUTER_API_KEY recommended - one key covers all models)

# 4. Run database migrations
npx prisma migrate dev

# 5. Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string (default in `.env.example`) |
| `KEYS_ENCRYPTION_SECRET` | Yes | 32-byte hex secret for encrypting DB-stored API keys |
| `OPENROUTER_API_KEY` | One LLM key required | OpenRouter - single key covers all models |
| `ANTHROPIC_API_KEY` | | Direct Anthropic access |
| `GOOGLE_GENERATIVE_AI_API_KEY` | | Google Gemini |
| `OPENAI_API_KEY` | | OpenAI direct |
| `DEEPINFAI_API_KEY` | | DeepInfra open-source models |
| `ZAI_API_KEY` | | Z.ai (Zhipu AI) GLM models |
| `PEXELS_API_KEY` | | Enables `searchImages` tool |
| `BRAVE_SEARCH_API_KEY` | | Enables `webSearch` tool (primary) |
| `TAVILY_API_KEY` | | Web search fallback |
| `GOOGLE_PLACES_API_KEY` | | Server-side Places API for address enrichment |
| `NEXT_PUBLIC_GOOGLE_PLACES_KEY` | | Client-side autocomplete widget |
| `DEBUG_AI_STREAM_OUTPUT` | | Set `true` to log AI prompts/responses to console |

API keys can also be configured per-provider through the in-app settings UI (stored encrypted in the database).

## Development

```bash
npm run dev          # Start dev server with Turbopack
npm run build        # Production build
npm run lint         # ESLint
npx prisma studio    # Database GUI
npx prisma migrate dev    # Run migrations
npx prisma generate       # Regenerate Prisma client
```

## Project Structure

```
src/
  app/                    # Next.js App Router
    api/                  # API routes (chat, blueprint, discovery, etc.)
    page.tsx              # Entry point - dynamic imports Builder
  components/             # Core UI components
    Builder.tsx           # Main orchestrator
    PreviewPanel.tsx      # iframe preview with device toggles
    PromptPanel.tsx       # Chat interface + model selector
  features/               # Feature-specific UI + hooks
    builder/              # Builder state management
    blueprint/            # Blueprint UI (card, font picker, progress)
    discovery/            # Business discovery flow UI
    settings/             # API key management
    prompt/               # Prompt panel sub-components
    preview/              # Preview panel sub-components
  hooks/                  # Shared React hooks
  lib/
    chat/tools/           # AI tool definitions (writeFiles, editBlock, etc.)
    blocks/               # Post-generation pipeline (validate, extract components)
    blueprint/            # Blueprint system (types, prompts, generation)
    discovery/            # Business discovery (analyze, evaluate, context)
    parser/               # Streaming output parsing + edit operations
    places/               # Google Places API integration
    prompts/              # System prompt composition (modular sections)
    providers/            # LLM provider configs + registry
    search/               # Web search clients (Brave, Tavily)
    stream/               # Build progress detection
  types/                  # Shared TypeScript types
prisma/
  schema.prisma           # Database schema (6 models)
```

## License

Private - all rights reserved.
