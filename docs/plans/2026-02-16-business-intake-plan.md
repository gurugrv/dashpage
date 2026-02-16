# AI-Driven Business Intake System - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an AI-driven pre-generation intake flow that collects real business data (name, phone, address via Google Places Autocomplete) before blueprint generation, eliminating placeholder content.

**Architecture:** After a user's first prompt, an AI call analyzes it and generates targeted questions. Questions render as structured UI cards in the chat. Google Places Autocomplete provides address input with API enrichment. Collected data persists in a `BusinessProfile` DB model and injects into all generation prompts via a `<business_context>` block.

**Tech Stack:** Next.js 16, React 19, Prisma 7, Google Places API (Essentials), Vercel AI SDK 6, shadcn/ui, Tailwind CSS v4

---

## Task 1: Add BusinessProfile to Database Schema

**Files:**
- Modify: `prisma/schema.prisma:10-22` (add relation to Conversation)
- Create: New migration via `npx prisma migrate dev`

**Step 1: Add BusinessProfile model to schema**

Add after the ApiKey model (line 80) in `prisma/schema.prisma`:

```prisma
model BusinessProfile {
  id             String   @id @default(cuid())
  name           String
  phone          String?
  email          String?
  website        String?
  address        String?
  lat            Float?
  lng            Float?
  placeId        String?  @map("place_id")
  category       String?
  categories     Json?
  hours          Json?
  services       Json?
  socialMedia    Json?    @map("social_media")
  additionalInfo String?  @map("additional_info")
  googleMapsUri  String?  @map("google_maps_uri")
  createdAt      DateTime @default(now()) @map("created_at")
  updatedAt      DateTime @updatedAt @map("updated_at")
  conversations  Conversation[]

  @@map("business_profiles")
}
```

**Step 2: Add businessProfileId to Conversation model**

In the Conversation model (line 10-22), add:

```prisma
model Conversation {
  id                String            @id @default(cuid())
  title             String            @default("New Conversation")
  provider          String?           @map("provider")
  model             String?           @map("model")
  businessProfileId String?           @map("business_profile_id")
  createdAt         DateTime          @default(now()) @map("created_at")
  updatedAt         DateTime          @updatedAt @map("updated_at")
  messages          Message[]
  blueprint         Blueprint?
  generationState   GenerationState?
  businessProfile   BusinessProfile?  @relation(fields: [businessProfileId], references: [id])

  @@map("conversations")
}
```

**Step 3: Run migration**

Run: `npx prisma migrate dev --name add-business-profile`
Expected: Migration creates `business_profiles` table and adds `business_profile_id` column to `conversations`.

**Step 4: Regenerate Prisma client**

Run: `npx prisma generate`
Expected: Client regenerated at `src/generated/prisma/`

**Step 5: Verify**

Run: `docker exec aibuilder-postgres-1 psql -U builder -d ai_builder -c "\dt"`
Expected: `business_profiles` table listed.

**Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add BusinessProfile model with conversation relation"
```

---

## Task 2: Create BusinessProfile Types and API Route

**Files:**
- Create: `src/lib/intake/types.ts`
- Create: `src/app/api/business-profiles/route.ts`

**Step 1: Create intake types**

Create `src/lib/intake/types.ts`:

```typescript
import { z } from 'zod';

// What the AI returns when analyzing a prompt
export const intakeAnalysisSchema = z.object({
  isBusinessSite: z.boolean(),
  detectedName: z.string().nullable(),
  questions: z.array(z.object({
    id: z.string(),
    question: z.string(),
    type: z.enum(['text', 'phone', 'email', 'address_autocomplete', 'select', 'textarea']),
    required: z.boolean(),
    options: z.array(z.string()).optional(),
    prefilled: z.string().optional(),
  })),
});

export type IntakeAnalysis = z.infer<typeof intakeAnalysisSchema>;

export interface IntakeQuestion {
  id: string;
  question: string;
  type: 'text' | 'phone' | 'email' | 'address_autocomplete' | 'select' | 'textarea';
  required: boolean;
  options?: string[];
  prefilled?: string;
}

// What the completeness evaluator returns
export const completenessResultSchema = z.object({
  ready: z.boolean(),
  followUpQuestions: z.array(z.object({
    id: z.string(),
    question: z.string(),
    type: z.enum(['text', 'phone', 'email', 'select', 'textarea']),
    required: z.boolean(),
    options: z.array(z.string()).optional(),
  })).optional(),
});

export type CompletenessResult = z.infer<typeof completenessResultSchema>;

// Google Places enrichment data
export interface PlacesEnrichment {
  formattedAddress: string;
  lat: number;
  lng: number;
  types: string[];
  primaryType: string;
  displayName: string;
  googleMapsUri: string;
}

// Collected business data (superset - what gets saved to DB)
export interface BusinessProfileData {
  name: string;
  phone?: string;
  email?: string;
  website?: string;
  address?: string;
  lat?: number;
  lng?: number;
  placeId?: string;
  category?: string;
  categories?: string[];
  hours?: Record<string, string>;
  services?: string[];
  socialMedia?: Record<string, string>;
  additionalInfo?: string;
  googleMapsUri?: string;
}
```

**Step 2: Create business profiles CRUD API route**

Create `src/app/api/business-profiles/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

// GET - List all business profiles
export async function GET() {
  const profiles = await prisma.businessProfile.findMany({
    orderBy: { updatedAt: 'desc' },
  });
  return NextResponse.json(profiles);
}

// POST - Create a new business profile
export async function POST(req: Request) {
  const body = await req.json();
  const { name, ...rest } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Business name is required' }, { status: 400 });
  }

  const profile = await prisma.businessProfile.create({
    data: { name: name.trim(), ...rest },
  });

  return NextResponse.json(profile);
}
```

**Step 3: Create single profile route for updates**

Create `src/app/api/business-profiles/[id]/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

// GET - Fetch single profile
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await prisma.businessProfile.findUnique({ where: { id } });
  if (!profile) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(profile);
}

// PATCH - Update profile
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const profile = await prisma.businessProfile.update({
    where: { id },
    data: body,
  });
  return NextResponse.json(profile);
}
```

**Step 4: Verify build**

Run: `npm run build 2>&1 | head -30`
Expected: No type errors.

**Step 5: Commit**

```bash
git add src/lib/intake/types.ts src/app/api/business-profiles/
git commit -m "feat: add BusinessProfile types and CRUD API routes"
```

---

## Task 3: Create Google Places API Integration

**Files:**
- Create: `src/lib/places/google-places.ts`
- Create: `src/app/api/places/details/route.ts`
- Modify: `.env.example` (add Google Places keys)

**Step 1: Create Google Places client**

Create `src/lib/places/google-places.ts`:

```typescript
const PLACES_API_BASE = 'https://places.googleapis.com/v1';

export interface PlaceDetails {
  displayName: string;
  formattedAddress: string;
  location: { latitude: number; longitude: number };
  types: string[];
  primaryType: string;
  googleMapsUri: string;
}

const ESSENTIALS_FIELD_MASK = [
  'places.displayName',
  'places.formattedAddress',
  'places.location',
  'places.types',
  'places.primaryType',
  'places.googleMapsUri',
].join(',');

const DETAILS_FIELD_MASK = [
  'displayName',
  'formattedAddress',
  'location',
  'types',
  'primaryType',
  'googleMapsUri',
].join(',');

export async function getPlaceDetails(placeId: string): Promise<PlaceDetails | null> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return null;

  const res = await fetch(
    `${PLACES_API_BASE}/places/${placeId}`,
    {
      headers: {
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': DETAILS_FIELD_MASK,
      },
    },
  );

  if (!res.ok) {
    console.error('[places] Details fetch failed:', res.status, await res.text());
    return null;
  }

  const data = await res.json();
  return {
    displayName: data.displayName?.text ?? '',
    formattedAddress: data.formattedAddress ?? '',
    location: data.location ?? { latitude: 0, longitude: 0 },
    types: data.types ?? [],
    primaryType: data.primaryType ?? '',
    googleMapsUri: data.googleMapsUri ?? '',
  };
}

export function isPlacesConfigured(): boolean {
  return !!process.env.GOOGLE_PLACES_API_KEY;
}
```

**Step 2: Create Places Details API route**

Create `src/app/api/places/details/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { getPlaceDetails, isPlacesConfigured } from '@/lib/places/google-places';

export async function POST(req: Request) {
  if (!isPlacesConfigured()) {
    return NextResponse.json({ error: 'Google Places not configured' }, { status: 501 });
  }

  const { placeId } = await req.json();
  if (!placeId) {
    return NextResponse.json({ error: 'placeId is required' }, { status: 400 });
  }

  const details = await getPlaceDetails(placeId);
  if (!details) {
    return NextResponse.json({ error: 'Failed to fetch place details' }, { status: 502 });
  }

  return NextResponse.json(details);
}
```

**Step 3: Create Places config check route**

Create `src/app/api/places/config/route.ts`:

```typescript
import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    configured: !!process.env.GOOGLE_PLACES_API_KEY,
    hasAutocompleteKey: !!process.env.NEXT_PUBLIC_GOOGLE_PLACES_KEY,
  });
}
```

**Step 4: Add env vars to .env.example**

Add to `.env.example` after the Search API section:

```
# === Google Places API (optional - enables address autocomplete & enrichment) ===
GOOGLE_PLACES_API_KEY=""             # Server-side: Place Details API
NEXT_PUBLIC_GOOGLE_PLACES_KEY=""     # Client-side: Autocomplete widget (restricted browser key)
```

**Step 5: Commit**

```bash
git add src/lib/places/ src/app/api/places/ .env.example
git commit -m "feat: add Google Places API integration for address enrichment"
```

---

## Task 4: Create Intake AI Analysis Engine

**Files:**
- Create: `src/lib/intake/analyze-prompt.ts`
- Create: `src/lib/intake/evaluate-completeness.ts`
- Create: `src/app/api/intake/analyze/route.ts`
- Create: `src/app/api/intake/evaluate/route.ts`

**Step 1: Create prompt analyzer**

Create `src/lib/intake/analyze-prompt.ts`:

```typescript
import { generateText, Output } from 'ai';
import type { LanguageModelV1 } from 'ai';
import { intakeAnalysisSchema, type IntakeAnalysis } from './types';

const ANALYSIS_SYSTEM_PROMPT = `You are a smart intake assistant for a website builder. Analyze the user's prompt and determine:

1. Is this a business/organization website (vs personal hobby, creative project, etc.)?
2. Extract any business name mentioned in the prompt.
3. Generate targeted questions to collect essential business data.

RULES:
- Always ask for business name if not detected in prompt (prefill if detected).
- Always ask for phone number — it's critical for business sites.
- Always ask for address using address_autocomplete type — needed for location and map embedding.
- After those 3 core questions, ask 2-4 industry-specific questions based on the business type:
  - Restaurant/cafe: menu highlights, cuisine type, reservation info
  - Medical/dental: services offered, insurance accepted, team members
  - Retail/shop: product categories, brands carried, online ordering
  - Service business: services list, service area, certifications
  - Professional services: specializations, team, case studies
  - Generic: business hours, email, key services
- Use "select" type when there are clear predefined options (e.g., cuisine type).
- Use "textarea" for open-ended info (e.g., "describe your services").
- Total questions: 3-7 depending on business complexity.
- For non-business sites (portfolio, hobby, personal blog), set isBusinessSite=false and return empty questions array.

QUESTION ID CONVENTIONS:
- business_name, phone, address, email, website, hours, services, description, team, social_media
- Use descriptive IDs for industry-specific: cuisine_type, menu_highlights, insurance, specializations`;

export async function analyzePromptForIntake(
  model: LanguageModelV1,
  userPrompt: string,
): Promise<IntakeAnalysis> {
  const result = await generateText({
    model,
    system: ANALYSIS_SYSTEM_PROMPT,
    output: Output.object({ schema: intakeAnalysisSchema }),
    prompt: userPrompt,
    maxOutputTokens: 2048,
  });

  // Fallback if structured output fails
  if (!result.output) {
    return { isBusinessSite: true, detectedName: null, questions: [] };
  }

  return result.output;
}
```

**Step 2: Create completeness evaluator**

Create `src/lib/intake/evaluate-completeness.ts`:

```typescript
import { generateText, Output } from 'ai';
import type { LanguageModelV1 } from 'ai';
import { completenessResultSchema, type CompletenessResult, type BusinessProfileData } from './types';

const MAX_TOTAL_QUESTIONS = 7;

const EVAL_SYSTEM_PROMPT = `You evaluate whether enough business data has been collected to generate a high-quality website without placeholder content.

Given the original prompt, business type, and collected data, decide:
1. Is there enough data to generate a great site? (ready=true)
2. If not, what 1-2 MORE follow-up questions would fill the most impactful gaps?

READY CRITERIA:
- Business name is present
- Phone OR email is present
- Address is present
- At least some industry-specific content (services, menu items, etc.)

FOLLOW-UP RULES:
- Maximum 2 follow-up questions per evaluation
- Don't re-ask for data already collected
- Focus on content that would otherwise be placeholder (testimonials, specific services, team names)
- If the user provided a rich initial prompt, fewer questions needed
- Never ask for data that's nice-to-have but not visible on the site`;

export async function evaluateCompleteness(
  model: LanguageModelV1,
  originalPrompt: string,
  collectedData: BusinessProfileData,
  questionsAskedSoFar: number,
): Promise<CompletenessResult> {
  // Hard cap: if we've asked enough questions, stop
  if (questionsAskedSoFar >= MAX_TOTAL_QUESTIONS) {
    return { ready: true };
  }

  // Minimum check: if we have name + (phone or email) + address, likely good enough
  const hasMinimum = collectedData.name && (collectedData.phone || collectedData.email) && collectedData.address;
  if (hasMinimum && questionsAskedSoFar >= 5) {
    return { ready: true };
  }

  const result = await generateText({
    model,
    system: EVAL_SYSTEM_PROMPT,
    output: Output.object({ schema: completenessResultSchema }),
    prompt: `Original prompt: "${originalPrompt}"

Collected data so far:
${JSON.stringify(collectedData, null, 2)}

Questions asked so far: ${questionsAskedSoFar}
Remaining question budget: ${MAX_TOTAL_QUESTIONS - questionsAskedSoFar}`,
    maxOutputTokens: 1024,
  });

  if (!result.output) {
    return { ready: true }; // Fail-open: proceed with what we have
  }

  return result.output;
}
```

**Step 3: Create analyze API route**

Create `src/app/api/intake/analyze/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { analyzePromptForIntake } from '@/lib/intake/analyze-prompt';
import { resolveApiKey } from '@/lib/keys/key-manager';
import { PROVIDERS } from '@/lib/providers/registry';
import { isPlacesConfigured } from '@/lib/places/google-places';

export async function POST(req: Request) {
  const { prompt, provider, model } = await req.json();

  if (!prompt?.trim()) {
    return NextResponse.json({ error: 'prompt is required' }, { status: 400 });
  }

  const providerConfig = PROVIDERS[provider as keyof typeof PROVIDERS];
  if (!providerConfig) {
    return NextResponse.json({ error: 'Invalid provider' }, { status: 400 });
  }

  const apiKey = await resolveApiKey(provider);
  if (!apiKey) {
    return NextResponse.json({ error: 'No API key for provider' }, { status: 400 });
  }

  const modelInstance = providerConfig.createModel(apiKey, model);
  const analysis = await analyzePromptForIntake(modelInstance, prompt);

  // If Google Places not configured, downgrade address_autocomplete to text
  if (!isPlacesConfigured()) {
    for (const q of analysis.questions) {
      if (q.type === 'address_autocomplete') {
        q.type = 'text';
      }
    }
  }

  return NextResponse.json({
    ...analysis,
    placesConfigured: isPlacesConfigured(),
  });
}
```

**Step 4: Create evaluate API route**

Create `src/app/api/intake/evaluate/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { evaluateCompleteness } from '@/lib/intake/evaluate-completeness';
import { resolveApiKey } from '@/lib/keys/key-manager';
import { PROVIDERS } from '@/lib/providers/registry';
import type { BusinessProfileData } from '@/lib/intake/types';

export async function POST(req: Request) {
  const { prompt, provider, model, collectedData, questionsAskedSoFar } = await req.json() as {
    prompt: string;
    provider: string;
    model: string;
    collectedData: BusinessProfileData;
    questionsAskedSoFar: number;
  };

  const providerConfig = PROVIDERS[provider as keyof typeof PROVIDERS];
  if (!providerConfig) {
    return NextResponse.json({ error: 'Invalid provider' }, { status: 400 });
  }

  const apiKey = await resolveApiKey(provider);
  if (!apiKey) {
    return NextResponse.json({ error: 'No API key' }, { status: 400 });
  }

  const modelInstance = providerConfig.createModel(apiKey, model);
  const result = await evaluateCompleteness(modelInstance, prompt, collectedData, questionsAskedSoFar);

  return NextResponse.json(result);
}
```

**Step 5: Commit**

```bash
git add src/lib/intake/ src/app/api/intake/
git commit -m "feat: add AI intake analysis and completeness evaluation engine"
```

---

## Task 5: Create Intake UI Components

**Files:**
- Create: `src/features/intake/intake-question-card.tsx`
- Create: `src/features/intake/address-autocomplete.tsx`
- Create: `src/features/intake/business-profile-summary.tsx`
- Create: `src/features/intake/intake-loading.tsx`

**Step 1: Create IntakeQuestionCard component**

Create `src/features/intake/intake-question-card.tsx`. This is the main UI card rendered in the chat for each AI question. It renders different input types (text, phone, email, address autocomplete, select, textarea) and calls back with the answer.

Key behaviors:
- Renders inside the message list, styled as an assistant message card
- Each question type gets appropriate input element
- Submit button or Enter to submit
- Shows prefilled value when AI detected info from prompt
- `address_autocomplete` type delegates to AddressAutocomplete component
- Disabled state after submission (shows answered value)

**Step 2: Create AddressAutocomplete component**

Create `src/features/intake/address-autocomplete.tsx`. Uses Google Places Autocomplete via `@googlemaps/js-api-loader` library.

Key behaviors:
- Loads Google Maps JS API with Places library using `NEXT_PUBLIC_GOOGLE_PLACES_KEY`
- Text input with autocomplete dropdown
- On selection: extracts placeId, calls `POST /api/places/details` for enrichment
- Returns both the selected address string and PlacesEnrichment data
- Fallback: if no Google key configured, renders plain text input

Install dependency: `npm install @googlemaps/js-api-loader`

**Step 3: Create BusinessProfileSummary component**

Create `src/features/intake/business-profile-summary.tsx`. Shown after all questions answered, before blueprint generation.

Key behaviors:
- Displays all collected data in a compact, editable card (like BlueprintCard style)
- Fields: name, phone, email, website, address, hours, services
- Each field is inline-editable (click to edit)
- "Looks good, generate!" primary button
- "Add more details" secondary button (shows additional optional fields)

**Step 4: Create IntakeLoading indicator**

Create `src/features/intake/intake-loading.tsx`. Shown while AI analyzes prompt or evaluates completeness.

```typescript
// Rotating phase messages similar to BlueprintLoadingIndicator
const INTAKE_PHASES = [
  'Understanding your business...',
  'Preparing questions...',
  'Almost ready...',
];
```

**Step 5: Commit**

```bash
git add src/features/intake/
git commit -m "feat: add intake UI components (question cards, address autocomplete, profile summary)"
```

---

## Task 6: Create useIntake Hook (Core State Machine)

**Files:**
- Create: `src/hooks/useIntake.ts`

**Step 1: Create the intake state machine hook**

Create `src/hooks/useIntake.ts`. This is the core orchestrator that manages the intake flow state.

```typescript
export type IntakePhase =
  | 'idle'           // Not started
  | 'analyzing'      // AI analyzing prompt
  | 'asking'         // Showing questions to user
  | 'evaluating'     // AI checking if enough data
  | 'confirming'     // Showing BusinessProfileSummary
  | 'complete'       // Done, ready for blueprint generation
  | 'skipped';       // Non-business site, skip intake

export interface UseIntakeOptions {
  provider: string;
  model: string;
}

export function useIntake({ provider, model }: UseIntakeOptions) {
  // State
  const [phase, setPhase] = useState<IntakePhase>('idle');
  const [questions, setQuestions] = useState<IntakeQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [businessProfile, setBusinessProfile] = useState<BusinessProfileData | null>(null);
  const [placesEnrichment, setPlacesEnrichment] = useState<PlacesEnrichment | null>(null);
  const [questionsAskedCount, setQuestionsAskedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Start intake: POST /api/intake/analyze
  const startIntake = async (prompt: string) => { ... };

  // Handle answer submission for a question
  const submitAnswer = async (questionId: string, value: string) => { ... };

  // Handle address selection with Places enrichment
  const submitAddressAnswer = async (questionId: string, address: string, enrichment: PlacesEnrichment) => { ... };

  // After all current questions answered, evaluate completeness
  const evaluateAndContinue = async (originalPrompt: string) => { ... };

  // Confirm profile and proceed
  const confirmProfile = async (conversationId: string, editedProfile?: BusinessProfileData) => { ... };

  // Build BusinessProfileData from answers + enrichment
  const buildProfileFromAnswers = (): BusinessProfileData => { ... };

  // Reset
  const reset = () => { ... };

  return { phase, questions, answers, businessProfile, error,
           startIntake, submitAnswer, submitAddressAnswer,
           evaluateAndContinue, confirmProfile, reset };
}
```

Key flow:
1. `startIntake(prompt)` → POST /api/intake/analyze → sets questions, phase='asking'
2. User answers each question → `submitAnswer(id, value)` → updates answers map
3. When all current questions answered → `evaluateAndContinue(prompt)` → POST /api/intake/evaluate
4. If ready=true → builds profile, phase='confirming' → shows BusinessProfileSummary
5. If ready=false → appends follow-up questions, phase='asking' again
6. `confirmProfile(conversationId)` → POST /api/business-profiles → saves to DB → links to conversation → phase='complete'

**Step 2: Commit**

```bash
git add src/hooks/useIntake.ts
git commit -m "feat: add useIntake hook - core intake state machine"
```

---

## Task 7: Integrate Intake into Builder Flow

**Files:**
- Modify: `src/components/Builder.tsx:394-413` (intercept first message for intake)
- Modify: `src/features/prompt/message-list.tsx` (render intake cards)
- Modify: `src/components/PromptPanel.tsx` (pass intake props)

**Step 1: Add intake hook to Builder**

In `Builder.tsx`, add the `useIntake` hook alongside existing hooks. Modify the first-message path in `handleSubmit` (lines 394-413):

```typescript
// Current: goes straight to generateBlueprint
// New: starts intake flow first, generateBlueprint called after intake completes

if (useBlueprint) {
  // Start intake analysis instead of immediate blueprint
  await intake.startIntake(promptText);
  // Store prompt for later blueprint generation
  pendingBlueprintPromptRef.current = promptText;
  return;
}
```

Add an effect that watches `intake.phase === 'complete'` and triggers `generateBlueprint`:

```typescript
useEffect(() => {
  if (intake.phase === 'complete' && pendingBlueprintPromptRef.current) {
    const prompt = pendingBlueprintPromptRef.current;
    pendingBlueprintPromptRef.current = null;
    generateBlueprint(prompt, activeConversationId!);
  }
}, [intake.phase]);
```

When `intake.phase === 'skipped'` (non-business site), go straight to `generateBlueprint`.

**Step 2: Render intake UI in MessageList**

In `message-list.tsx`, add intake rendering between the messages and the loading indicators:

```typescript
// After messages.map(), before blueprintLoading check:
{intakePhase === 'analyzing' && <IntakeLoadingIndicator />}
{intakePhase === 'asking' && intakeQuestions.map(q => (
  <IntakeQuestionCard
    key={q.id}
    question={q}
    answered={intakeAnswers[q.id]}
    onSubmit={(value) => onIntakeAnswer(q.id, value)}
    onAddressSelect={(addr, enrichment) => onIntakeAddressAnswer(q.id, addr, enrichment)}
    disabled={!!intakeAnswers[q.id]}
  />
))}
{intakePhase === 'evaluating' && <IntakeLoadingIndicator />}
{intakePhase === 'confirming' && (
  <BusinessProfileSummary
    profile={intakeProfile!}
    onConfirm={onIntakeConfirm}
    onEdit={onIntakeEditProfile}
  />
)}
```

**Step 3: Pass intake props through PromptPanel**

Add intake-related props to PromptPanel's interface and pass them down to MessageList:
- `intakePhase`, `intakeQuestions`, `intakeAnswers`, `intakeProfile`
- `onIntakeAnswer`, `onIntakeAddressAnswer`, `onIntakeConfirm`, `onIntakeEditProfile`

**Step 4: Disable ChatInput during intake**

While intake is active (phase not 'idle', 'complete', or 'skipped'), disable the main ChatInput or repurpose it for answering the current question.

**Step 5: Verify the flow manually**

Run: `npm run dev`
Test: Type "Create a website for my dental clinic" → should see intake questions instead of immediate blueprint generation.

**Step 6: Commit**

```bash
git add src/components/Builder.tsx src/features/prompt/message-list.tsx src/components/PromptPanel.tsx
git commit -m "feat: integrate intake flow into Builder - intercept first message for Q&A"
```

---

## Task 8: Inject Business Context into System Prompts

**Files:**
- Create: `src/lib/intake/build-business-context.ts`
- Modify: `src/lib/prompts/sections/context-blocks.ts` (add business context builder)
- Modify: `src/lib/prompts/system-prompt.ts:41-64` (inject business context)
- Modify: `src/app/api/chat/route.ts:232-254` (pass business profile to prompt builder)
- Modify: `src/app/api/blueprint/generate/route.ts:43-48` (pass business profile to prompt builder)

**Step 1: Create business context block builder**

Create `src/lib/intake/build-business-context.ts`:

```typescript
import type { BusinessProfileData } from './types';

export function buildBusinessContextBlock(profile: BusinessProfileData | null): string {
  if (!profile) return '';

  const lines: string[] = [];

  if (profile.name) lines.push(`Business Name: ${profile.name}`);
  if (profile.category) lines.push(`Category: ${profile.category}`);
  if (profile.address) lines.push(`Address: ${profile.address}`);
  if (profile.phone) lines.push(`Phone: ${profile.phone}`);
  if (profile.email) lines.push(`Email: ${profile.email}`);
  if (profile.website) lines.push(`Website: ${profile.website}`);
  if (profile.hours && Object.keys(profile.hours).length > 0) {
    lines.push(`Hours: ${Object.entries(profile.hours).map(([day, time]) => `${day}: ${time}`).join(', ')}`);
  }
  if (profile.services && profile.services.length > 0) {
    lines.push(`Services: ${profile.services.join(', ')}`);
  }
  if (profile.socialMedia && Object.keys(profile.socialMedia).length > 0) {
    lines.push(`Social Media: ${Object.entries(profile.socialMedia).map(([k, v]) => `${k}: ${v}`).join(', ')}`);
  }
  if (profile.googleMapsUri) lines.push(`Google Maps: ${profile.googleMapsUri}`);
  if (profile.additionalInfo) lines.push(`Additional Info: ${profile.additionalInfo}`);

  if (lines.length === 0) return '';

  return `\n<business_context>
${lines.join('\n')}

USE THIS REAL DATA. Do not invent placeholder names, addresses, phone numbers, or services.
Replace any placeholder content with the actual business information above.
When generating contact sections, forms, or maps, use the real address and phone number provided.
</business_context>`;
}
```

**Step 2: Add business context to system prompt assembly**

Modify `src/lib/prompts/system-prompt.ts` — update `getSystemPromptParts` to accept an optional `businessProfile` parameter and inject the business context block into the dynamic section.

Update the function signature:

```typescript
export function getSystemPromptParts(
  currentFiles?: ProjectFiles,
  temporalContext?: TemporalContext,
  userPrompt?: string,
  provider?: string,
  modelId?: string,
  businessProfile?: BusinessProfileData | null,
): SystemPromptParts
```

In the dynamic part assembly (line 59), add:

```typescript
const dynamic = `${buildTemporalBlock(temporalContext)}${buildBusinessContextBlock(businessProfile ?? null)}${buildFirstGenerationBlock(isFirstGeneration, userPrompt)}${buildCurrentWebsiteBlock(currentFiles)}${buildEditModeBlock(currentFiles)}

${CLOSING_LINE}`;
```

**Step 3: Pass business profile through chat resolution**

In `src/app/api/chat/route.ts`, fetch the business profile from the conversation's linked BusinessProfile and pass it to the system prompt builder.

Add after resolving execution context (around line 232):

```typescript
// Fetch linked business profile if exists
let businessProfile: BusinessProfileData | null = null;
if (conversationId) {
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { businessProfile: true },
  });
  if (conv?.businessProfile) {
    businessProfile = conv.businessProfile as unknown as BusinessProfileData;
  }
}
```

Pass `businessProfile` to `resolveChatExecution` or directly to `getSystemPromptParts`.

**Step 4: Pass business profile through blueprint generation**

Similarly in `src/app/api/blueprint/generate/route.ts`, fetch the business profile and include it in the blueprint system prompt. Also inject it into `siteFacts` so the blueprint schema has the data.

When `businessProfile` exists, skip the `needsResearch` web search (data already collected from user):

```typescript
// Skip web research if we have user-provided business data
if (blueprint.needsResearch && businessProfile) {
  blueprint.siteFacts = {
    businessName: businessProfile.name,
    address: businessProfile.address ?? '',
    phone: businessProfile.phone ?? '',
    email: businessProfile.email ?? '',
    hours: businessProfile.hours ? JSON.stringify(businessProfile.hours) : '',
    services: businessProfile.services ?? [],
    tagline: '',
    socialMedia: businessProfile.socialMedia ? JSON.stringify(businessProfile.socialMedia) : '',
    additionalInfo: businessProfile.additionalInfo ?? '',
  };
  blueprint.needsResearch = false; // Data came from user, no web search needed
}
```

**Step 5: Pass business profile to page generation prompts**

In blueprint page generation (`src/app/api/blueprint/pages/route.ts` and `src/lib/blueprint/prompts/page-system-prompt.ts`), ensure the business context is included so individual page generators use real data.

**Step 6: Verify build**

Run: `npm run build 2>&1 | head -30`
Expected: No type errors.

**Step 7: Commit**

```bash
git add src/lib/intake/build-business-context.ts src/lib/prompts/ src/app/api/chat/route.ts src/app/api/blueprint/
git commit -m "feat: inject business context into all generation prompts"
```

---

## Task 9: Add Business Profile Picker for Returning Users

**Files:**
- Create: `src/features/intake/business-profile-picker.tsx`
- Create: `src/hooks/useBusinessProfiles.ts`
- Modify: `src/hooks/useIntake.ts` (add profile selection logic)

**Step 1: Create useBusinessProfiles hook**

Create `src/hooks/useBusinessProfiles.ts`:

```typescript
// Fetches existing business profiles from GET /api/business-profiles
// Returns { profiles, isLoading, refetch }
// Used by BusinessProfilePicker to show existing profiles
```

**Step 2: Create BusinessProfilePicker component**

Create `src/features/intake/business-profile-picker.tsx`:

Shows a compact card with existing business profiles when the user has previously created profiles:
- Lists profiles as selectable cards (name, address, category)
- "Use this profile" button on each
- "Create new" button at bottom
- Only shown when `profiles.length > 0` and intake starts

**Step 3: Integrate picker into intake flow**

In `useIntake.ts`, when `startIntake` is called:
1. First check if any business profiles exist
2. If yes, set phase to 'picking' (new phase) and show picker
3. If user selects existing profile, pre-fill all answers, skip to 'confirming'
4. If user clicks "Create new", proceed to 'analyzing' as normal

**Step 4: Commit**

```bash
git add src/features/intake/business-profile-picker.tsx src/hooks/useBusinessProfiles.ts src/hooks/useIntake.ts
git commit -m "feat: add business profile picker for returning users"
```

---

## Task 10: End-to-End Testing and Polish

**Files:**
- Modify: Various files for bug fixes and polish

**Step 1: Test complete happy path**

1. Start fresh conversation
2. Type "Create a website for my dental clinic called Bright Smile Dental"
3. Verify: AI intake questions appear (business name prefilled, phone, address autocomplete)
4. Answer all questions
5. Verify: BusinessProfileSummary card appears with all data
6. Click "Generate"
7. Verify: Blueprint uses real data (no "123 Main St" placeholders)
8. Verify: Generated HTML contains real phone number, address, services

**Step 2: Test non-business site path**

1. Type "Create a portfolio showcasing my photography hobby"
2. Verify: Intake is skipped, goes straight to blueprint generation

**Step 3: Test without Google Places key**

1. Remove GOOGLE_PLACES_API_KEY from env
2. Type business prompt
3. Verify: Address question renders as plain text input (no autocomplete)
4. Verify: Everything still works, just without enrichment

**Step 4: Test returning user profile reuse**

1. Complete a business site generation
2. Start new conversation
3. Verify: BusinessProfilePicker shows the previous profile
4. Select it
5. Verify: Goes to confirmation with all data pre-filled

**Step 5: Test edge cases**

- Very short prompts: "make a website" → should still ask business questions
- Prompts with lots of info: "Create a website for Joe's Pizza at 123 Oak St, open Mon-Sat 11am-10pm, serving NY-style pizza and calzones, call us at 555-0100" → should prefill most fields, ask fewer questions
- Cancel during intake → should cleanly reset
- Network error during AI analysis → should show error, allow retry

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: complete AI-driven business intake system with e2e polish"
```

---

## Summary

| Task | Description | Key Files |
|------|-------------|-----------|
| 1 | DB schema: BusinessProfile model | `prisma/schema.prisma` |
| 2 | Types + CRUD API routes | `src/lib/intake/types.ts`, `src/app/api/business-profiles/` |
| 3 | Google Places API integration | `src/lib/places/`, `src/app/api/places/` |
| 4 | AI intake analysis + completeness engine | `src/lib/intake/analyze-prompt.ts`, `src/app/api/intake/` |
| 5 | UI components (question cards, autocomplete, summary) | `src/features/intake/` |
| 6 | useIntake hook (state machine) | `src/hooks/useIntake.ts` |
| 7 | Builder integration (intercept first message) | `src/components/Builder.tsx`, message-list, PromptPanel |
| 8 | System prompt injection | `src/lib/intake/build-business-context.ts`, system-prompt.ts, API routes |
| 9 | Returning user profile picker | `src/features/intake/business-profile-picker.tsx` |
| 10 | E2E testing and polish | Various |
