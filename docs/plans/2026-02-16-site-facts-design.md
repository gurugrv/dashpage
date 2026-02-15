# Site Facts: Consistent Business Data Across Blueprint Pages

**Date:** 2026-02-16
**Status:** Approved

## Problem

When generating multi-page websites in blueprint mode, business-specific data (address, phone, hours) is inconsistent across pages. The components stage (header/footer) has no web search guidance, so it uses placeholder data. Each page searches independently and may get different results. A dental clinic website might show the real address on the contact page but "123 Main St" in the footer.

## Solution

Enrich the blueprint with a `siteFacts` field populated by a web search + AI extraction step that runs immediately after blueprint generation. Facts become part of the user-reviewable/editable blueprint, then flow to both components and pages as a single source of truth.

## Design

### 1. Blueprint Schema Change

Add optional `siteFacts` and `needsResearch` to the blueprint Zod schema:

```typescript
siteFacts?: {
  businessName?: string;
  address?: string;
  phone?: string;
  email?: string;
  hours?: string;          // e.g. "Mon-Fri 9am-5pm, Sat 10am-2pm"
  services?: string[];     // key services/offerings
  tagline?: string;        // actual business tagline if found
  socialMedia?: Record<string, string>;  // { instagram: "url", facebook: "url" }
  additionalInfo?: string; // catch-all for anything else relevant
}
needsResearch?: boolean;   // AI sets true when prompt references a real business/place/person
```

Both fields are optional. Fictional/generic sites have neither.

### 2. Research Flow (in `/api/blueprint/generate`)

After the main blueprint JSON is generated:

1. **Detection**: The AI sets `needsResearch: true` in the blueprint schema when the prompt references a real business, place, or person. No heuristic guessing.
2. **Search**: If `needsResearch` is true, call `searchBrave`/`searchTavily` directly (existing functions, not via AI tool) with the site name + description. 1-2 searches max.
3. **Extraction**: A `generateObject` call (same provider/model as the planning step, ~500 output tokens) receives search snippets + site context and returns structured `siteFacts`.
4. **Merge & Save**: `siteFacts` merged into blueprint, saved to DB. Client receives the enriched blueprint in the same response.

If search returns nothing useful or fails, `siteFacts` is omitted. Generation proceeds normally.

### 3. Downstream Consumption

**Components prompt** (`getComponentsSystemPrompt`): Add a `<site_facts>` block inside `<site_info>` when `siteFacts` exists. Footer gets real address, phone, social links.

**Pages prompt** (`getPageSystemPrompt`): Add same `<site_facts>` block. Update `<tool_workflow>` webSearch instruction: "Shared site facts are provided above. Use them for address, phone, hours, etc. Only call webSearch for page-specific details NOT covered by site facts (e.g., detailed menu items, team bios, gallery content)."

**Chat mode**: No change. Chat mode handles webSearch per-generation and doesn't have the multi-stage consistency problem.

### 4. Blueprint Card UI

New "Business Details" section in the blueprint card when `siteFacts` is present:
- Each fact as an editable field (address, phone, email, hours, services as tag chips, social links)
- Same inline-edit pattern as existing blueprint fields
- Note: "Research found these details - please verify"
- Section hidden when `siteFacts` is empty/missing
- Users can clear individual fields if search got something wrong

### 5. Cost & Performance

- **Added latency**: ~2-4 seconds on blueprint generation (1-2 web searches + 1 extraction call). Only when `needsResearch: true`. Blueprint step is followed by user review, so latency is acceptable.
- **Added cost**: One cheap `generateObject` call (~500 tokens). Searches are free (Brave) or near-free (Tavily). Offset by pages no longer searching for basic facts.
- **Model**: Uses the same provider/model the user selected for the planning step.

## Files to Modify

- `src/lib/blueprint/types.ts` — Add `siteFacts` and `needsResearch` to schema
- `src/app/api/blueprint/generate/route.ts` — Add post-generation search + extraction step
- `src/lib/blueprint/prompts/components-system-prompt.ts` — Include `siteFacts` in prompt
- `src/lib/blueprint/prompts/page-system-prompt.ts` — Include `siteFacts` + update webSearch guidance
- `src/features/blueprint/blueprint-card.tsx` — Add Business Details section
- `src/hooks/useBlueprintGeneration.ts` — Pass through `siteFacts` edits via `updateBlueprint`

## New Files

- `src/lib/blueprint/research.ts` — Search + extraction logic (searchBrave/Tavily call + generateObject for structured extraction)
