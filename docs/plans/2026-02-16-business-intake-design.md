# AI-Driven Business Intake System - Design

**Date**: 2026-02-16
**Status**: Approved

## Problem

Non-tech-savvy consumers use AI Builder to generate websites. Currently, the only input is a free-form text prompt. The AI guesses all business details (name, address, phone, hours, services), producing placeholder content that requires post-generation editing. This increases costs (more edit iterations = more AI calls) and frustrates users.

## Solution

An AI-driven intake system that collects real business data before site generation, combining:
1. AI-powered conversational Q&A in the chat
2. Google Places Autocomplete for address input + API enrichment
3. Persistent business profiles for reuse across conversations

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Intake timing | Pre-blueprint Q&A in chat | Conversational, low friction, AI adapts questions to context |
| API provider | Google Places Essentials | $705/100K requests, 10K free/month, reliable address/category data |
| Data split | User provides name/phone/address; Google provides verified address/lat-lng/category; AI asks for remaining gaps | Phone numbers change - user knows best. Google excels at verified location data. |
| Exit condition | AI decides (smart) | Evaluates collected info against site type needs. Max 7 questions. |
| Data persistence | BusinessProfile model in DB | Users can have multiple businesses, reuse profiles across conversations |
| Fallback (no Google key) | Plain text address input, no enrichment | System still works without Google API key |

## User Flow

```
User types initial prompt ("Create a website for my dental clinic")
  ↓
AI analyzes prompt, enters INTAKE MODE (instead of going straight to blueprint)
  ↓
AI asks in chat: "What's your business/practice name?"
  → User types: "Bright Smile Dental"
  ↓
AI asks: "What's your phone number?"
  → User types: "555-123-4567"
  ↓
AI asks: "What's your business address?"
  → Shows Google Places Autocomplete input
  → User selects from suggestions
  ↓
Backend calls Places API → gets verified address, lat/lng, category, Google Maps URI
  ↓
AI evaluates: "I have name, phone, address, category (dentist). For a dental clinic I also need..."
  ↓
AI asks targeted follow-ups (2-3 more based on site type):
  - "What services do you offer?" (for service businesses)
  - "What are your business hours?"
  - "Do you have an email or website?"
  ↓
AI decides it has enough → proceeds to blueprint generation with all collected data
```

## Data Model

### New: BusinessProfile

```prisma
model BusinessProfile {
  id             String   @id @default(cuid())
  name           String                    // Business/individual name
  phone          String?                   // Phone number
  email          String?                   // Contact email
  website        String?                   // Existing website URL
  address        String?                   // Full formatted address
  lat            Float?                    // Latitude from Places API
  lng            Float?                    // Longitude from Places API
  placeId        String?                   // Google Place ID (for cache/re-fetch)
  category       String?                   // Primary business type from Places API
  categories     Json?                     // All types array from Places API
  hours          Json?                     // Business hours (structured)
  services       Json?                     // Services/products array
  socialMedia    Json?                     // { facebook, instagram, twitter, etc. }
  additionalInfo String?                   // Free text - extra context
  googleMapsUri  String?                   // Google Maps link
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  conversations  Conversation[]
}
```

### Modified: Conversation

Add `businessProfileId` foreign key linking to BusinessProfile.

## Intake AI Call

A lightweight, dedicated AI call (not the full blueprint model) that:

1. Receives the user's initial prompt
2. Returns structured JSON:
   ```typescript
   {
     isBusinessSite: boolean,       // Does this need business data?
     detectedName: string | null,   // Business name if found in prompt
     questions: Array<{
       id: string,                  // e.g. "business_name", "phone", "address"
       question: string,            // Display text
       type: 'text' | 'phone' | 'email' | 'address_autocomplete' | 'select' | 'textarea',
       required: boolean,
       options?: string[],          // For select type
       prefilled?: string,          // If detected from prompt
     }>
   }
   ```
3. Questions rendered as structured UI cards in the chat (not plain text messages)
4. After user answers, a second AI call evaluates completeness:
   - Either asks 1-2 more targeted questions
   - Or signals "ready" → proceeds to blueprint generation

### Exit Conditions (AI decides)

- **Minimum**: Business name + phone + address (for any business site)
- **Industry-specific**: Enough data for the site type (services for service business, menu items for restaurant, portfolio pieces for creative, etc.)
- **Hard cap**: Max 7 questions total to prevent fatigue
- **Non-business sites**: If `isBusinessSite: false` (e.g. "create a portfolio for my hobby"), skip intake entirely → go straight to blueprint

## Google Places Integration

### Frontend
- Google Places Autocomplete widget embedded in the address question card
- User types, gets suggestions, selects one
- Uses `@googlemaps/js-api-loader` or Places Autocomplete element

### Backend API Route: `POST /api/places/details`
- Receives `placeId` from autocomplete selection
- Calls Google Places API with Essentials field mask:
  - `formattedAddress`, `location`, `types`, `primaryType`, `googleMapsUri`, `displayName`
- Returns structured data to frontend
- Saves enrichment data to BusinessProfile

### API Key Configuration
- Stored as env var `GOOGLE_PLACES_API_KEY` (server-side only)
- Frontend uses a restricted browser key `NEXT_PUBLIC_GOOGLE_PLACES_KEY` (for Autocomplete widget)
- Fallback: If no key configured, address question becomes plain text input

### Cost
- Autocomplete: $2.55/1K sessions
- Place Details Essentials: $4.50/1K requests
- Total: ~$0.007 per business lookup (0.7 cents)
- First 10K lookups/month free per SKU

## Prompt Injection

Collected business data injected as a new context block into system prompts:

```
<business_context>
Business Name: Bright Smile Dental
Category: Dentist
Address: 123 Main St, Springfield, IL 62701
Phone: (555) 123-4567
Email: info@brightsmile.com
Hours: Mon-Fri 9am-5pm, Sat 9am-1pm
Services: General Dentistry, Cosmetic Dentistry, Orthodontics, Teeth Whitening
Google Maps: https://maps.google.com/?cid=...

USE THIS REAL DATA. Do not invent placeholder names, addresses, phone numbers, or services.
Replace any placeholder content with the actual business information above.
</business_context>
```

Injected into:
- Blueprint generation prompt (so blueprint uses real data)
- Page generation prompts (so each page uses real data)
- Chat edit prompts (so edits maintain real data)
- Replaces the current `needsResearch` + `researchSiteFacts()` flow for business sites

## UI Components

### IntakeQuestionCard
- Rendered in chat for each AI question
- Different input types: text, phone (with formatting), address autocomplete, multi-select (for services), textarea
- Submit button per card, or Enter to submit
- Shows prefilled values when AI detected info from prompt

### BusinessProfileSummary
- Shown after intake completes, before blueprint generation
- Displays all collected data in an editable card
- User can review, correct, add missing fields
- "Looks good, generate!" button to proceed

### BusinessProfilePicker
- If user has existing profiles, shown at start of intake
- "Use existing profile or create new?"
- Selecting existing pre-fills all data, user can still modify

## Integration with Existing Systems

### Replaces/Enhances
- Current `needsResearch` flag on blueprint → intake provides data upfront
- Current `researchSiteFacts()` web search → Google Places API for location data
- Current `webSearch` tool usage for business details → pre-collected data in prompt

### Keeps
- Existing Brave/Tavily web search tools (still useful for non-business lookups, embed codes, etc.)
- Blueprint review/edit card (still shown after intake, with richer data)
- All existing edit tools (writeFiles, editBlock, editFiles)

## Industry Research

- Durable AI: 3 questions (type, name, location) → fastest onboarding
- Hocoos: 8 questions → most detailed
- Wix AI: conversational follow-ups
- Multi-step forms convert 300% better than single-page
- Sweet spot: 3-5 core questions + 2-3 industry-specific follow-ups
- Google Places Essentials: best value for verified business data
