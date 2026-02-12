# AI Website Builder - Detailed Implementation Plan

## Context

Build a simplified AI-powered website builder where non-technical users create websites and landing pages by prompting. Inspired by bolt.diy, lovable.dev, and v0.dev but much simpler:

- **No WebContainer** - generated HTML renders directly in an iframe
- **No file system, terminal, or code editor** - just prompt + preview
- **Single HTML output** - complete pages with inline CSS/JS
- **Target audience** - people with basic computer skills
- **Single-user** - no authentication, one person's tool

The core loop: **prompt -> generate -> preview -> iterate**

---

## Decisions Log

All ambiguities resolved before implementation. These decisions are final.

| Area | Decision | Rationale |
|------|----------|-----------|
| Token limits | Auto-continue (3 retries), detect `finishReason === 'length'` via `onFinish` | Industry standard (bolt.diy, Windsurf pattern) |
| Error recovery | Retry button + rollback to last valid HTML | User never loses their work on failure |
| Stop generation | Yes, using useChat's built-in `stop()` | Essential UX for long generations |
| Chat history | Multi-conversation sidebar | Users manage multiple projects |
| Persistence | DB-primary (PostgreSQL via Prisma ORM) | No localStorage; all reads/writes through API |
| Preview mode | Fully interactive iframe | Users click buttons, fill forms, see JS animations |
| Providers | All 4: OpenRouter + Anthropic + Google + OpenAI | Maximum flexibility |
| Theme | No dark/light theme | Unnecessary complexity for POC |
| User model | Single-user, no authentication | Simplest path |
| Tailwind | v4 (research shadcn/ui workaround first, fallback to v3 if broken) | User preference for latest; pragmatic fallback |
| Output format | Structured output (AI SDK 6 `Output.object()`) with `<htmlOutput>` tag fallback | Best of both: typed JSON when supported, tag parsing as safety net |
| ORM | Prisma | Team familiarity, rapid prototyping, good for simple schemas |
| UI components | shadcn/ui | Pre-built accessible components, faster development |
| API key storage | .env.local (priority) + encrypted DB column (future admin UI) | Secure defaults now, admin UI later |
| Project root | `/Volumes/Work/MAG Centre/AI Builder/` (current directory) | No subdirectory |
| Database hosting | PostgreSQL via Docker (local dev) | Single `docker compose up -d` to start; no external service needed |
| Auto-titling | Truncate first user prompt to 50 chars | No extra LLM call; simple and free |
| Message saving | Client-side via `onFinish` callback, POST to conversations API | Tab close mid-stream = unsaved (acceptable for v1) |
| Default provider | Auto-select first provider with a configured API key | No broken defaults if user only has one key |

---

## Architecture Overview

```
Next.js 16 (App Router) + TypeScript + Tailwind CSS v4 + shadcn/ui
|
+-- Frontend (React 19)
|   +-- Two-panel layout (resizable) + conversation sidebar
|   |   +-- Sidebar: Conversation list (new/rename/delete)
|   |   +-- Left: Prompt panel (chat messages + input + model selector)
|   |   +-- Right: Preview panel (fully interactive iframe)
|   +-- useChat() hook (Vercel AI SDK 6) for streaming
|   +-- Dual output parsing: structured output -> <htmlOutput> tag fallback
|   +-- Stop button (abort in-progress stream)
|   +-- Auto-continue on token limit (up to 3 retries)
|
+-- Backend (Next.js API Routes)
|   +-- /api/chat             -> streamText() with system prompt, returns SSE
|   +-- /api/chat/continue    -> auto-continue truncated generations
|   +-- /api/models           -> lists available models per provider
|   +-- /api/conversations/*  -> CRUD for conversation persistence
|   +-- /api/keys/*           -> API key management (encrypted DB storage)
|
+-- Database (PostgreSQL + Prisma ORM)
|   +-- conversations table   -> id, title, created_at, updated_at
|   +-- messages table        -> id, conversation_id, role, content, html_artifact
|   +-- api_keys table        -> id, provider, encrypted_key, created_at
|
+-- LLM Providers (via Vercel AI SDK 6)
    +-- OpenRouter    (@ai-sdk/openai with custom baseURL)
    +-- Anthropic     (@ai-sdk/anthropic)
    +-- Google Gemini (@ai-sdk/google)
    +-- OpenAI        (@ai-sdk/openai)
```

**Data flow:**
```
User types prompt
    -> sendMessage() POST to /api/chat (fresh body with currentFiles, provider, model)
    -> API resolves key: .env.local first, then encrypted DB column
    -> Creates LLM model instance via provider registry
    -> streamText() with system prompt + messages + current HTML context
    -> Returns SSE stream via toUIMessageStreamResponse()
    -> Client receives chunks
    -> Try structured output parsing (Output.object with Zod)
    -> Fallback: HtmlExtractor scans for <htmlOutput> tags
    -> Extracts HTML progressively into ProjectFiles map
    -> Updates iframe srcdoc from files["index.html"] (debounced 300ms during stream)
    -> User sees live-updating website preview
    -> On stream end: onFinish fires with finishReason
    -> If finishReason === 'length': auto-continue (LLM regenerates full HTML, up to 3 retries)
    -> On error: show retry button, rollback preview to lastValidFiles
    -> On success: onFinish saves message + ProjectFiles artifact (JSON) to PostgreSQL via API
```

---

## Project Structure

```
. (AI Builder/)
+-- .env.local                              # API keys + DB URL (gitignored)
+-- .env.example                            # Template for required env vars
+-- docker-compose.yml                      # PostgreSQL for local dev
+-- next.config.ts
+-- package.json
+-- tsconfig.json
+-- postcss.config.mjs
+-- prisma/
|   +-- schema.prisma                       # Database schema
|   +-- migrations/                         # Prisma migrations
+-- public/
|   +-- favicon.ico
+-- src/
    +-- app/
    |   +-- layout.tsx                      # Root layout with metadata
    |   +-- page.tsx                        # Main builder page
    |   +-- globals.css                     # Tailwind v4 imports
    |   +-- api/
    |       +-- chat/
    |       |   +-- route.ts                # POST: streaming chat endpoint
    |       |   +-- continue/
    |       |       +-- route.ts            # POST: auto-continue truncated generation
    |       +-- models/
    |       |   +-- route.ts                # GET: list available models
    |       +-- conversations/
    |       |   +-- route.ts                # GET: list, POST: create conversation
    |       |   +-- [id]/
    |       |       +-- route.ts            # GET: single, PATCH: rename, DELETE
    |       |       +-- messages/
    |       |           +-- route.ts        # GET: messages for conversation
    |       +-- keys/
    |           +-- route.ts                # GET/POST: manage encrypted API keys
    +-- components/
    |   +-- ui/                             # shadcn/ui components (auto-generated)
    |   +-- Builder.tsx                     # Main orchestrator (sidebar + two-panel)
    |   +-- ConversationSidebar.tsx         # Left sidebar: conversation list
    |   +-- PromptPanel.tsx                 # Chat messages + input + model selector
    |   +-- PreviewPanel.tsx                # Fully interactive iframe + device toolbar
    |   +-- ChatMessage.tsx                 # Individual message bubble
    |   +-- ChatInput.tsx                   # Auto-resize textarea + send/stop buttons
    |   +-- ModelSelector.tsx               # Provider dropdown + model dropdown
    |   +-- ExamplePrompts.tsx              # Starter prompt suggestion cards
    +-- lib/
    |   +-- providers/
    |   |   +-- registry.ts                # Provider configs + model factory
    |   +-- prompts/
    |   |   +-- system-prompt.ts           # System prompt for HTML generation
    |   +-- parser/
    |   |   +-- html-extractor.ts          # Streaming <htmlOutput> tag parser (fallback)
    |   |   +-- output-parser.ts           # Structured output parser (primary)
    |   +-- keys/
    |   |   +-- key-manager.ts             # Key resolution: env -> encrypted DB
    |   +-- db/
    |       +-- prisma.ts                  # Prisma client singleton
    +-- hooks/
    |   +-- useHtmlParser.ts               # React hook: structured output + tag fallback, returns ProjectFiles
    |   +-- useModels.ts                   # Fetch + cache model lists
    |   +-- useConversations.ts            # CRUD for conversation sidebar
    |   +-- useAutoContinue.ts             # Auto-continue on token limit (triggered by onFinish callback)
    +-- types/
        +-- index.ts                       # Shared TypeScript interfaces (includes ProjectFiles type)
```

---

## Key Design Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Preview rendering | iframe `srcdoc`, fully interactive | Users can click, fill forms, see hover effects + JS animations |
| Artifact data shape | `ProjectFiles` (`Record<string, string>`) stored as JSON | Future-proofs for multi-file output; v1 uses `{ "index.html": "..." }` |
| Output format (primary) | AI SDK 6 `Output.object()` with Zod schema | Typed, validated JSON output when model supports it |
| Output format (fallback) | `<htmlOutput>` tag parsing | For models that don't support structured output |
| CSS in generated HTML | Tailwind CSS via CDN | LLMs generate excellent Tailwind; CDN = no build step needed |
| API key resolution | .env.local (priority 1) -> encrypted DB column (priority 2) | Secure defaults; DB keys enable future admin UI |
| Client state | useChat() + sendMessage() + DB-primary persistence | No localStorage; body passed at request time to avoid stale closures |
| Panel layout | react-resizable-panels | Same proven library bolt.diy uses, works well |
| iframe security | `sandbox="allow-scripts allow-forms"` | NO `allow-same-origin` to prevent XSS from generated content |
| Provider integration | Vercel AI SDK 6 adapters | Official adapters, Agent abstraction, structured output |
| Token exhaustion | Auto-continue via `onFinish` callback: detect `finishReason === 'length'`, retry up to 3x with full replacement | Avoids stale closure; replacement avoids HTML fragment concatenation bugs |
| Error handling | Retry button + rollback to last valid HTML | User never loses work on LLM failure |
| Stream control | Stop button using useChat `stop()` | Essential UX for cancelling long/wrong generations |
| Conversation mgmt | Multi-conversation sidebar with DB persistence | Users manage multiple website projects |
| UI framework | shadcn/ui + Tailwind v4 | Accessible components, fast development |

---

## Detailed Component Designs

### 1. System Prompt (`src/lib/prompts/system-prompt.ts`)

The system prompt is the most important piece - it determines output quality.

```typescript
export function getSystemPrompt(currentHtml?: string): string {
  const contextBlock = currentHtml
    ? `\n<current_website>\nThe user has an existing website. Here is the current HTML:\n\`\`\`html\n${currentHtml}\n\`\`\`\nModify THIS HTML based on the user's request. Return the complete updated version.\nDo NOT start from scratch unless explicitly asked.\n</current_website>`
    : '';

  return `You are WebBuilder, an expert web developer that creates beautiful,
modern websites and landing pages. You generate complete, self-contained HTML pages.

<rules>
1. ALWAYS wrap your HTML output in <htmlOutput> tags.
2. Generate a SINGLE, complete HTML file.
3. Use Tailwind CSS via CDN: <script src="https://cdn.tailwindcss.com"></script>
4. All custom CSS goes in <style> tags, all scripts in <script> tags.
5. Make designs responsive using Tailwind responsive prefixes (sm:, md:, lg:).
6. Use professional color schemes and modern typography.
7. For images, use https://placehold.co/WIDTHxHEIGHT or inline SVG.
8. Include Google Fonts via CDN when appropriate.
9. ALWAYS output the COMPLETE HTML document. Never use placeholders.
10. Before <htmlOutput>, briefly explain what you're building (2-3 sentences max).
</rules>

<output_format>
Brief explanation of what you're building/changing.

<htmlOutput>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Page Title</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>/* custom CSS */</style>
</head>
<body>
  <!-- content -->
  <script>/* JS if needed */</script>
</body>
</html>
</htmlOutput>
</output_format>

<design_guidelines>
- Cohesive color palette (primary, secondary, accent)
- Smooth hover transitions and subtle animations
- Consistent spacing via Tailwind utilities
- Readable text (proper contrast, line-height)
- Professional, production-ready appearance
- Appropriate sections: hero, features, CTA, footer
- Semantic HTML with proper headings hierarchy
- Mobile-first responsive design
</design_guidelines>

<anti_patterns>
AVOID generic AI aesthetics:
- Do NOT default to purple/blue gradients on white backgrounds
- Do NOT always use Inter, Roboto, or system fonts - pick context-appropriate fonts
- Do NOT use predictable cookie-cutter layouts
- Each design should feel unique and tailored to the user's request
- Interpret creatively with context-specific character
</anti_patterns>

${contextBlock}

IMPORTANT: Be concise. Focus on delivering the HTML.
CRITICAL: <htmlOutput> must contain the COMPLETE HTML document.`;
}
```

### 2. Provider Registry (`src/lib/providers/registry.ts`)

Flat registry with factory functions - much simpler than bolt.diy's class hierarchy.

```typescript
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { LanguageModelV1 } from 'ai';

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  maxOutputTokens: number;
}

export interface ProviderConfig {
  name: string;
  envKey: string;
  createModel: (apiKey: string, modelId: string) => LanguageModelV1;
  staticModels: ModelInfo[];
  fetchModels?: (apiKey: string) => Promise<ModelInfo[]>;
}

export const PROVIDERS: Record<string, ProviderConfig> = {
  OpenRouter: {
    name: 'OpenRouter',
    envKey: 'OPENROUTER_API_KEY',
    createModel: (apiKey, modelId) => {
      const client = createOpenAI({ apiKey, baseURL: 'https://openrouter.ai/api/v1' });
      return client(modelId);
    },
    staticModels: [
      { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4', provider: 'OpenRouter', maxOutputTokens: 16384 },
      { id: 'openai/gpt-4o', name: 'GPT-4o', provider: 'OpenRouter', maxOutputTokens: 16384 },
      { id: 'google/gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: 'OpenRouter', maxOutputTokens: 8192 },
    ],
    fetchModels: async (apiKey) => {
      const res = await fetch('https://openrouter.ai/api/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const data = await res.json();
      return data.data.map((m: any) => ({
        id: m.id, name: m.name, provider: 'OpenRouter',
      }));
    },
  },
  Anthropic: {
    name: 'Anthropic',
    envKey: 'ANTHROPIC_API_KEY',
    createModel: (apiKey, modelId) => {
      const client = createAnthropic({ apiKey });
      return client(modelId);
    },
    staticModels: [
      { id: 'claude-sonnet-4-5-20250929', name: 'Claude Sonnet 4.5', provider: 'Anthropic', maxOutputTokens: 16384 },
      { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', provider: 'Anthropic', maxOutputTokens: 8192 },
    ],
  },
  Google: {
    name: 'Google',
    envKey: 'GOOGLE_GENERATIVE_AI_API_KEY',
    createModel: (apiKey, modelId) => {
      const client = createGoogleGenerativeAI({ apiKey });
      return client(modelId);
    },
    staticModels: [
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: 'Google', maxOutputTokens: 8192 },
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', provider: 'Google', maxOutputTokens: 8192 },
    ],
  },
  OpenAI: {
    name: 'OpenAI',
    envKey: 'OPENAI_API_KEY',
    createModel: (apiKey, modelId) => {
      const client = createOpenAI({ apiKey });
      return client(modelId);
    },
    staticModels: [
      { id: 'gpt-4o', name: 'GPT-4o', provider: 'OpenAI', maxOutputTokens: 16384 },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'OpenAI', maxOutputTokens: 16384 },
    ],
  },
};
```

### 3. HTML Stream Parser (`src/lib/parser/html-extractor.ts`)

Fallback parser for models that don't support structured output. Inspired by bolt.diy's `StreamingMessageParser`.

```typescript
const TAG_OPEN = '<htmlOutput>';
const TAG_CLOSE = '</htmlOutput>';

export class HtmlStreamExtractor {
  private buffer = '';
  private insideHtml = false;
  private htmlContent = '';
  private explanation = '';

  parse(chunk: string): { html: string; explanation: string; isComplete: boolean } {
    this.buffer += chunk;

    if (!this.insideHtml) {
      const idx = this.buffer.indexOf(TAG_OPEN);
      if (idx !== -1) {
        this.explanation = this.buffer.slice(0, idx).trim();
        this.insideHtml = true;
        this.buffer = this.buffer.slice(idx + TAG_OPEN.length);
      }
    }

    if (this.insideHtml) {
      const closeIdx = this.buffer.indexOf(TAG_CLOSE);
      if (closeIdx !== -1) {
        this.htmlContent = this.buffer.slice(0, closeIdx);
        return { html: this.htmlContent, explanation: this.explanation, isComplete: true };
      }
      this.htmlContent = this.buffer;
      return { html: this.htmlContent, explanation: this.explanation, isComplete: false };
    }

    return { html: '', explanation: this.buffer, isComplete: false };
  }

  reset() {
    this.buffer = '';
    this.insideHtml = false;
    this.htmlContent = '';
    this.explanation = '';
  }
}
```

### 3b. Structured Output Schema (`src/lib/parser/output-parser.ts`)

Primary parser using AI SDK 6's `Output.object()` with `streamText()`. Falls back to `HtmlStreamExtractor` (section 3) for models that don't support structured output.

```typescript
import { z } from 'zod';

export const htmlOutputSchema = z.object({
  explanation: z.string().describe('Brief explanation of what was built/changed (2-3 sentences)'),
  files: z.record(z.string(), z.string()).describe('Map of filename to file contents. Use "index.html" as the key.'),
});

export type HtmlOutput = z.infer<typeof htmlOutputSchema>;
```

**Usage with `streamText()`:**
```typescript
import { Output } from 'ai';

const result = streamText({
  model: modelInstance,
  output: Output.object({ schema: htmlOutputSchema }),
  // ... other options
});

// Access partial structured output during streaming
for await (const partial of result.partialOutputStream) {
  if (partial.files?.['index.html']) {
    updatePreview(partial.files);
  }
}
```

**Fallback strategy:** If structured output fails (model doesn't support it, malformed response), the `useHtmlParser` hook falls back to `HtmlStreamExtractor` to scan for `<htmlOutput>` tags in the raw text stream. Both paths produce the same `ProjectFiles` output.

### 4. Chat API Route (`src/app/api/chat/route.ts`)

Updated for AI SDK 6 with structured output + tag fallback.

```typescript
import { streamText, convertToModelMessages, Output } from 'ai';
import { z } from 'zod';
import { getSystemPrompt } from '@/lib/prompts/system-prompt';
import { PROVIDERS } from '@/lib/providers/registry';
import { resolveApiKey } from '@/lib/keys/key-manager';

export async function POST(req: Request) {
  const { messages, currentFiles, provider, model } = await req.json();

  const apiKey = await resolveApiKey(provider);
  if (!apiKey) {
    return Response.json({ error: `No API key for ${provider}` }, { status: 400 });
  }

  const providerConfig = PROVIDERS[provider];
  if (!providerConfig) {
    return Response.json({ error: `Unknown provider: ${provider}` }, { status: 400 });
  }

  const modelInstance = providerConfig.createModel(apiKey, model);
  const modelConfig = providerConfig.staticModels.find(m => m.id === model);
  const currentHtml = currentFiles?.['index.html'];
  const systemPrompt = getSystemPrompt(currentHtml || undefined);

  const result = streamText({
    model: modelInstance,
    system: systemPrompt,
    messages: convertToModelMessages(messages),
    maxOutputTokens: modelConfig?.maxOutputTokens ?? 16384,
  });

  return result.toUIMessageStreamResponse();
}
```

### 5. Auto-Continue Route (`src/app/api/chat/continue/route.ts`)

Handles continuation when token limit is hit.

```typescript
import { streamText, convertToModelMessages } from 'ai';
import { PROVIDERS } from '@/lib/providers/registry';
import { resolveApiKey } from '@/lib/keys/key-manager';

export async function POST(req: Request) {
  const { messages, provider, model, attempt } = await req.json();

  if (attempt > 3) {
    return Response.json({ error: 'Max continuation attempts reached' }, { status: 400 });
  }

  const apiKey = await resolveApiKey(provider);
  const providerConfig = PROVIDERS[provider];
  const modelInstance = providerConfig!.createModel(apiKey!, model);

  // Append continuation instruction to messages
  const continuationMessages = [
    ...messages,
    { role: 'user' as const, content: 'Continue from where you left off. Complete the remaining HTML.' },
  ];

  const result = streamText({
    model: modelInstance,
    messages: convertToModelMessages(continuationMessages),
    maxOutputTokens: modelConfig.maxOutputTokens ?? 16384,
  });

  return result.toUIMessageStreamResponse();
}
```

### 6. Builder Component (`src/components/Builder.tsx`)

Main orchestrator wiring sidebar + useChat + parser + panels + stop + auto-continue.

```typescript
// Conceptual structure
function Builder() {
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null); // Auto-selected on mount
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const { currentFiles, lastValidFiles, isGenerating, processMessages } = useHtmlParser();
  const { conversations, create, rename, remove } = useConversations();

  const { messages, input, setInput, sendMessage, isLoading, stop, error, reload } = useChat({
    transport: new DefaultChatTransport({ api: '/api/chat' }),
    onFinish: ({ message, finishReason }) => {
      // Save message + artifact to DB
      if (activeConversationId) {
        saveMessageToDb(activeConversationId, message, currentFiles);
      }
      // Auto-continue on token limit (up to 3 retries)
      if (finishReason === 'length') {
        triggerAutoContinue();
      }
    },
  });

  // Auto-select first available provider on mount (via /api/models)
  const { availableProviders } = useModels();
  useEffect(() => {
    if (!selectedProvider && availableProviders.length > 0) {
      setSelectedProvider(availableProviders[0].name);
      setSelectedModel(availableProviders[0].staticModels[0].id);
    }
  }, [availableProviders]);

  useEffect(() => {
    processMessages(messages, isLoading);
  }, [messages, isLoading]);

  // Submit with fresh body values (avoids stale closure issue)
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(
      { text: input },
      { body: { currentFiles, provider: selectedProvider, model: selectedModel } },
    );
    setInput('');
  };

  return (
    <div className="flex h-screen">
      <ConversationSidebar
        conversations={conversations}
        activeId={activeConversationId}
        onSelect={setActiveConversationId}
        onCreate={create}
        onRename={rename}
        onDelete={remove}
      />
      <PanelGroup direction="horizontal" className="flex-1">
        <Panel defaultSize={35} minSize={25}>
          <PromptPanel
            messages={messages}
            input={input}
            setInput={setInput}
            onSubmit={handleSubmit}
            isLoading={isLoading}
            onStop={stop}
            error={error}
            onRetry={reload}
            provider={selectedProvider}
            model={selectedModel}
            onProviderChange={setSelectedProvider}
            onModelChange={setSelectedModel}
          />
        </Panel>
        <PanelResizeHandle />
        <Panel defaultSize={65} minSize={35}>
          <PreviewPanel
            files={currentFiles}
            lastValidFiles={lastValidFiles}
            isGenerating={isGenerating}
          />
        </Panel>
      </PanelGroup>
    </div>
  );
}
```

**Key patterns:**
- **No stale closures**: `sendMessage()` receives fresh `body` at call time, not hook init time
- **`onFinish` callback**: Handles both DB persistence and auto-continue detection via `finishReason`
- **Auto-select provider**: Defaults to first provider with a configured API key, not hardcoded

### 7. Preview Panel (`src/components/PreviewPanel.tsx`)

Fully interactive iframe with debounced srcdoc updates.

Key behaviors:
- **Fully interactive**: Users can click buttons, fill forms, see hover effects and JS animations
- **During streaming**: Update srcdoc every 300ms (debounced) to avoid flicker
- **On completion**: Immediate final update
- **On error**: Rollback to `lastValidFiles` so user never sees broken state
- **Empty state**: Show "Enter a prompt to generate your website" placeholder
- **Device toolbar**: Mobile (375px) / Tablet (768px) / Desktop (100%) width toggles
- **Download button**: Export current HTML as .html file
- **Refresh button**: Re-render current HTML

### 8. API Key Management (`src/lib/keys/key-manager.ts`)

Two-tier key resolution with encrypted DB storage for future admin UI.

```typescript
import { prisma } from '@/lib/db/prisma';
import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.KEYS_ENCRYPTION_SECRET!;

export async function resolveApiKey(provider: string): Promise<string | null> {
  // Priority 1: Environment variable
  const providerConfig = PROVIDERS[provider];
  const envKey = process.env[providerConfig.envKey];
  if (envKey) return envKey;

  // Priority 2: Encrypted DB column
  const dbKey = await prisma.apiKey.findUnique({ where: { provider } });
  if (dbKey) return decrypt(dbKey.encryptedKey);

  return null;
}

function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(text: string): string {
  const [ivHex, encryptedHex] = text.split(':');
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'hex'), Buffer.from(ivHex, 'hex'));
  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
```

### 9. Database Schema (`prisma/schema.prisma`)

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Conversation {
  id        String    @id @default(cuid())
  title     String    @default("New Conversation")
  createdAt DateTime  @default(now()) @map("created_at")
  updatedAt DateTime  @updatedAt @map("updated_at")
  messages  Message[]

  @@map("conversations")
}

model Message {
  id             String       @id @default(cuid())
  conversationId String       @map("conversation_id")
  role           String       // 'user', 'assistant', 'system'
  content        String       // Text content (explanation)
  htmlArtifact   Json?        @map("html_artifact") // ProjectFiles JSON: { "index.html": "..." }
  createdAt      DateTime     @default(now()) @map("created_at")
  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)

  @@index([conversationId])
  @@map("messages")
}

model ApiKey {
  id           String   @id @default(cuid())
  provider     String   @unique // 'OpenRouter', 'Anthropic', 'Google', 'OpenAI'
  encryptedKey String   @map("encrypted_key")
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")

  @@map("api_keys")
}
```

### 10. Shared Types (`src/types/index.ts`)

```typescript
/** Map of filename -> file contents. V1 uses single "index.html" key.
 *  Future-proofs for multi-file projects (multi-page sites, CSS/JS separation, full-stack). */
export type ProjectFiles = Record<string, string>;
```

All components and hooks use `ProjectFiles` instead of raw HTML strings. In v1, the map always has one key (`"index.html"`), but the shape is ready for multi-file output without any refactoring.

### 11. Model Selector (`src/components/ModelSelector.tsx`)

Two-dropdown pattern:
1. **Provider dropdown**: Shows only providers with configured API keys
2. **Model dropdown**: Shows models for selected provider (static + dynamic)

`useModels` hook fetches from `/api/models` on mount, caches result, re-fetches when provider changes.

### 12. Conversation Sidebar (`src/components/ConversationSidebar.tsx`)

Left sidebar for managing multiple conversations:
- **New conversation button** at top
- **Conversation list** sorted by `updatedAt` descending
- **Active conversation** highlighted
- **Rename** (inline edit on double-click)
- **Delete** with confirmation
- **Auto-title**: After first LLM response, truncate first user prompt to 50 chars (no LLM call)
- All CRUD operations go directly to PostgreSQL via API routes

---

## Iterative Editing Flow

This is the key UX differentiator - users refine websites through conversation:

1. User: "Create a landing page for a coffee shop"
   - No `currentFiles` -> system prompt has no `<current_website>` block
   - LLM generates fresh HTML from scratch

2. User: "Make the hero section larger and change colors to warm brown tones"
   - `currentFiles["index.html"]` contains the previous HTML
   - System prompt includes `<current_website>` with the full HTML
   - LLM modifies the existing page, returns complete updated HTML

3. User: "Add a menu section with coffee drinks and prices"
   - Same pattern - receives current HTML, adds new section

The conversation history (all messages) is also sent, giving the LLM full context of what was discussed/changed.

---

## Auto-Continue Flow

When a model hits the token limit mid-generation:

```
1. Stream completes -> onFinish callback fires with finishReason === 'length'
2. triggerAutoContinue() increments attempt counter (max 3)
3. Shows "Continuing generation..." indicator in chat
4. Sends POST to /api/chat/continue with:
   - All messages so far (including partial assistant response)
   - Continuation prompt: "Continue from where you left off. Output the COMPLETE HTML document."
   - attempt counter (1, 2, or 3)
5. Continuation response generates FULL HTML (not a fragment)
   - Parser replaces currentFiles entirely (no concatenation of partials)
   - This avoids duplicate <html>/<head> tag issues
6. If finishReason === 'length' again: repeat (up to 3 total)
7. If still incomplete after 3 attempts: show error + best HTML generated so far
```

**Why full replacement, not concatenation:** Asking the LLM to continue mid-HTML produces fragments with duplicate structural tags. Asking for the complete document with a higher token budget is simpler and more reliable.

---

## Error Recovery Flow

```
1. LLM call fails (network error, API error, rate limit)
2. Preview panel rolls back to lastValidFiles (user never sees broken state)
3. Error toast appears with message
4. Retry button appears in chat (uses useChat reload())
5. User clicks Retry -> same prompt re-sent to LLM
6. Or user types a new prompt to try differently
```

---

## Dependencies

```json
{
  "dependencies": {
    "next": "^16.1.0",
    "react": "^19.2.0",
    "react-dom": "^19.2.0",
    "ai": "^6.0.0",
    "@ai-sdk/react": "^3.0.0",
    "@ai-sdk/openai": "^3.0.0",
    "@ai-sdk/anthropic": "^3.0.0",
    "@ai-sdk/google": "^3.0.0",
    "@prisma/client": "^6.0.0",
    "react-resizable-panels": "^4.6.0",
    "react-markdown": "^9.0.0",
    "lucide-react": "^0.460.0",
    "clsx": "^2.1.0",
    "tailwind-merge": "^2.6.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@types/node": "^22.0.0",
    "@tailwindcss/postcss": "^4.0.0",
    "tailwindcss": "^4.0.0",
    "postcss": "^8.4.0",
    "prisma": "^6.0.0",
    "eslint": "^9.0.0",
    "eslint-config-next": "^16.0.0"
  }
}
```

---

## Environment Setup

### `docker-compose.yml`

```yaml
services:
  postgres:
    image: postgres:17
    restart: unless-stopped
    ports:
      - '5432:5432'
    environment:
      POSTGRES_USER: builder
      POSTGRES_PASSWORD: builder
      POSTGRES_DB: ai_builder
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

### `.env.example`

```bash
# === Database (required) ===
DATABASE_URL="postgresql://builder:builder@localhost:5432/ai_builder"

# === Encryption secret for DB-stored API keys (required) ===
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
KEYS_ENCRYPTION_SECRET=""

# === LLM Provider Keys (at least one required) ===
OPENROUTER_API_KEY=""     # Recommended: one key covers all models
ANTHROPIC_API_KEY=""      # Direct Anthropic access
GOOGLE_GENERATIVE_AI_API_KEY=""  # Google Gemini
OPENAI_API_KEY=""         # OpenAI direct
```

### `react-markdown` Usage

Used in `ChatMessage.tsx` to render the assistant's explanation text (the text before `<htmlOutput>`) as formatted markdown. Handles bold, links, code blocks, etc.

---

## Implementation Phases

### Phase 0: Tailwind v4 + shadcn/ui Compatibility Research
**Goal:** Confirm Tailwind v4 + shadcn/ui works together before writing any code

- Research exact workaround for shadcn/ui with Tailwind v4
- Create minimal test project: Next.js 16 + Tailwind v4 + shadcn/ui Button
- If broken: fall back to Tailwind v3.4 (no debate, pragmatic decision)
- Document which shadcn/ui init command + config changes are needed
- **Gate:** Must pass before Phase 1 begins

### Phase 1: Scaffold + Static Layout + Database
**Goal:** Resizable two-panel UI renders, PostgreSQL connected, shadcn/ui working

- Create `docker-compose.yml`, run `docker compose up -d` to start PostgreSQL
- Create `.env.local` from `.env.example` template
- Initialize Next.js 16 in current directory with TypeScript + Tailwind + App Router + src dir
- Install all dependencies including Prisma + shadcn/ui
- Set up Prisma schema, run initial migration
- Create Prisma client singleton (`src/lib/db/prisma.ts`)
- Create two-panel layout in `page.tsx` with `react-resizable-panels`
- Build static PromptPanel (message area + textarea placeholder) using shadcn/ui
- Build static PreviewPanel (empty state with placeholder text)
- Build ConversationSidebar (static, no data yet)
- **Test:** Layout renders, panels resize, DB connects, shadcn/ui components render

### Phase 2: Chat API + Single Provider + Persistence
**Goal:** Send prompt, see streaming LLM response, messages saved to DB

- Create `registry.ts` with OpenRouter provider (best default: one key covers all models)
- Write `system-prompt.ts` with anti-generic-aesthetic rules
- Create `/api/chat/route.ts` with `streamText()` using AI SDK 6 (`toUIMessageStreamResponse()`)
- Create `/api/conversations/*` CRUD routes
- Wire `useChat()` in Builder
- Save messages to PostgreSQL on completion
- Display streaming text in PromptPanel
- **Test:** Type prompt -> streaming response -> message persisted in DB

### Phase 3: HTML Parsing + Live Preview
**Goal:** Generated HTML appears as live interactive website in right panel

- Build `HtmlStreamExtractor` class (fallback parser)
- Build `useHtmlParser` hook with dual parsing: structured output primary, tag fallback
- Wire parser to PreviewPanel iframe srcdoc (fully interactive, no pointer-events restriction)
- Add debounce (300ms during stream, immediate on complete)
- Track `lastValidFiles` for error rollback
- **Test:** "Create a landing page" -> website renders live in preview, buttons clickable

### Phase 4: Iterative Editing + Stop + Auto-Continue
**Goal:** Follow-up prompts modify existing page, stop button works, auto-continue on truncation

- Send `currentFiles` in chat request body
- Extract `currentFiles["index.html"]` and inject into system prompt as `<current_website>` block
- Add stop button wired to useChat `stop()`
- Build auto-continue logic in `onFinish` callback (detect `finishReason === 'length'`, retry up to 3x)
- Continuation asks LLM for COMPLETE HTML (replacement, not concatenation)
- Create `/api/chat/continue/route.ts`
- Add error recovery: retry button + rollback to `lastValidFiles`
- **Test:** "Create a landing page" -> "Make header blue" -> "Add testimonials" -> each modifies correctly
- **Test:** Stop button halts mid-stream
- **Test:** Force token limit -> auto-continue fires

### Phase 5: Multi-Provider + Model Selection
**Goal:** Switch between all 4 providers, select models

- Add Anthropic, Google, OpenAI providers to registry
- Create `/api/models/route.ts`
- Build ModelSelector component (shadcn/ui Select components)
- Build `useModels` hook
- **Test:** Switch providers/models, all generate working HTML

### Phase 6: Conversation Management
**Goal:** Full multi-conversation sidebar with DB persistence

- Wire ConversationSidebar to `/api/conversations/*` routes
- Implement new/rename/delete conversations
- Auto-title conversations after first response
- Load messages from DB when switching conversations
- Restore `currentFiles` from latest assistant message's `htmlArtifact` JSON
- **Test:** Create multiple conversations, switch between them, delete one, data persists across reload

### Phase 7: API Key Management
**Goal:** Manage API keys via settings UI, stored encrypted in DB

- Build `key-manager.ts` (env priority + encrypted DB fallback)
- Create `/api/keys/*` routes
- Build settings dialog (shadcn/ui Dialog + Form) for API key CRUD
- **Test:** Enter keys via UI, chat works with DB-stored keys

### Phase 8: Polish
**Goal:** Production-ready POC UX

- ExamplePrompts component (starter templates grid)
- Device size toggles (mobile/tablet/desktop preview)
- "Download HTML" export button
- Loading states, error toasts (shadcn/ui Toast), empty states
- **Test:** Full end-to-end walkthrough

---

## Verification Plan

| Test | How |
|------|-----|
| Tailwind v4 + shadcn/ui | Phase 0 gate: minimal test project renders shadcn Button |
| Parser correctness | Feed partial chunks through HtmlExtractor, verify progressive HTML extraction |
| Structured output | Verify Output.object() returns typed `{ explanation, files }` matching `htmlOutputSchema` |
| Streaming API | Verify `/api/chat` returns valid SSE via `toUIMessageStreamResponse()` |
| Live preview | "Create a SaaS landing page" -> rendered page visible + interactive in iframe |
| Iterative edit | "Add pricing section" -> existing page updated (not regenerated) |
| Auto-continue | Force 8k token limit -> verify onFinish detects `finishReason === 'length'` -> continuation fires, replaces with complete HTML |
| Stop button | Click stop mid-stream -> generation halts, partial HTML preserved |
| Error recovery | Simulate API error -> retry button works, preview shows last valid files |
| Multi-provider | Switch OpenRouter -> Anthropic -> Google -> OpenAI, all produce valid HTML |
| Security | Verify iframe sandbox blocks access to parent window |
| Conversation CRUD | Create, rename, delete, switch conversations -> all persist in DB |
| Key management | Enter keys via settings -> verify chat works with DB-stored keys |
| Export | Download button produces valid standalone .html file |
| Responsive | Toggle device sizes in toolbar, verify iframe width changes |

---

## Critical Files (Implementation Order)

1. **`prisma/schema.prisma`** - Database schema (foundation for everything)
2. **`src/lib/db/prisma.ts`** - Prisma client singleton
3. **`src/app/page.tsx`** - Main layout with PanelGroup + sidebar
4. **`src/components/Builder.tsx`** - Orchestrator: useChat + parser + panels + sidebar
5. **`src/lib/prompts/system-prompt.ts`** - System prompt (output quality depends on this)
6. **`src/lib/providers/registry.ts`** - Provider configs + model factory
7. **`src/app/api/chat/route.ts`** - Streaming endpoint (most critical backend)
8. **`src/lib/parser/html-extractor.ts`** - Streaming HTML tag parser (fallback)
9. **`src/hooks/useHtmlParser.ts`** - React hook: dual parsing strategy, returns `ProjectFiles`
10. **`src/hooks/useAutoContinue.ts`** - Auto-continue on token exhaustion
11. **`src/components/PreviewPanel.tsx`** - Fully interactive iframe + debounce
12. **`src/components/PromptPanel.tsx`** - Chat messages + input + stop button
13. **`src/components/ConversationSidebar.tsx`** - Multi-conversation management
14. **`src/lib/keys/key-manager.ts`** - Key resolution: env -> encrypted DB
15. **`src/app/api/conversations/route.ts`** - Conversation CRUD

---

## Reference: bolt.diy Patterns Reused

| Bolt.diy Pattern | Our Adaptation |
|-----------------|----------------|
| `StreamingMessageParser` scanning `<boltArtifact>` | `HtmlStreamExtractor` scanning `<htmlOutput>` (fallback) + structured output (primary) |
| `useChat()` from `@ai-sdk/react` | Same - AI SDK 6 version with `toUIMessageStreamResponse()` |
| `streamText()` from `ai` | Same - AI SDK 6 with `convertToModelMessages()` |
| Provider registry with `getModelInstance()` | Flat registry with `createModel()` factory |
| `react-resizable-panels` for split layout | Same library v4, same pattern |
| System prompt with design guidelines | Enhanced with anti-generic-aesthetic rules + Tailwind CDN |
| Model/provider extracted from user message | Sent as separate body fields (cleaner) |
| Auto-continue on token limit (3 retries) | Same pattern, dedicated `/api/chat/continue` route |
| N/A (localStorage only) | PostgreSQL via Prisma for conversation persistence |
