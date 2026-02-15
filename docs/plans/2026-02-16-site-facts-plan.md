# Site Facts Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a `siteFacts` field to the blueprint that gets populated via web search + AI extraction after blueprint generation, ensuring consistent business data across header/footer and all pages.

**Architecture:** After the AI generates a blueprint JSON with `needsResearch: true`, the server runs 1-2 web searches and a cheap `generateObject` call to extract structured business facts. These facts are merged into the blueprint, shown to the user for review/editing, and passed to both component and page system prompts.

**Tech Stack:** Zod schemas, Vercel AI SDK `generateObject`, existing Brave/Tavily search clients, React inline editing in blueprint card.

**Design doc:** `docs/plans/2026-02-16-site-facts-design.md`

---

### Task 1: Add `siteFacts` and `needsResearch` to Blueprint Schema

**Files:**
- Modify: `src/lib/blueprint/types.ts`

**Step 1: Add the schema definitions**

Add these schemas before `blueprintSchema` in `types.ts`:

```typescript
export const siteFactsSchema = z.object({
  businessName: z.string().optional().describe('Official business name'),
  address: z.string().optional().describe('Physical address'),
  phone: z.string().optional().describe('Phone number'),
  email: z.string().optional().describe('Email address'),
  hours: z.string().optional().describe('Business hours (e.g. "Mon-Fri 9am-5pm, Sat 10am-2pm")'),
  services: z.array(z.string()).optional().describe('Key services or offerings'),
  tagline: z.string().optional().describe('Business tagline or slogan'),
  socialMedia: z.record(z.string()).optional().describe('Social media URLs keyed by platform name'),
  additionalInfo: z.string().optional().describe('Any other relevant business details'),
});

export type SiteFacts = z.infer<typeof siteFactsSchema>;
```

Then add two optional fields to `blueprintSchema`:

```typescript
export const blueprintSchema = z.object({
  // ... existing fields unchanged ...
  needsResearch: z.boolean().optional().describe('Set to true when the prompt references a real business, place, or person whose details should be looked up'),
  siteFacts: siteFactsSchema.optional().describe('Verified business details from web research'),
});
```

**Step 2: Verify types compile**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors related to blueprint types (other pre-existing errors are OK).

**Step 3: Commit**

```bash
git add src/lib/blueprint/types.ts
git commit -m "feat(blueprint): add siteFacts and needsResearch to schema"
```

---

### Task 2: Update Blueprint System Prompt for `needsResearch`

**Files:**
- Modify: `src/lib/blueprint/prompts/blueprint-system-prompt.ts`

**Step 1: Add `needsResearch` to the JSON example and rules**

In the `<task>` section JSON example, add after `contentStrategy`:

```
  "needsResearch": true
```

Add a new rule (after rule 11) to the `<rules>` section:

```
12. Set "needsResearch": true when the user's prompt references a REAL business, person, place, or organization whose actual details (address, phone, hours, etc.) should be looked up. Set false or omit for fictional/generic sites.
```

**Step 2: Verify types compile**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`

**Step 3: Commit**

```bash
git add src/lib/blueprint/prompts/blueprint-system-prompt.ts
git commit -m "feat(blueprint): instruct AI to set needsResearch flag"
```

---

### Task 3: Create Research Module

**Files:**
- Create: `src/lib/blueprint/research.ts`

**Step 1: Create the research module**

```typescript
import { generateObject } from 'ai';
import { searchBrave } from '@/lib/search/brave';
import { searchTavily } from '@/lib/search/tavily';
import { siteFactsSchema, type SiteFacts } from '@/lib/blueprint/types';
import type { SearchResult } from '@/lib/search/types';
import type { LanguageModel } from 'ai';

const MAX_SEARCH_RESULTS = 5;

/**
 * Search for business details using Brave (primary) with Tavily fallback.
 * Returns raw search results or empty array on failure.
 */
async function searchForBusiness(siteName: string, siteDescription: string): Promise<SearchResult[]> {
  const query = `${siteName} ${siteDescription}`;

  try {
    const results = await searchBrave(query, MAX_SEARCH_RESULTS);
    if (results.length > 0) return results;
  } catch {
    // Fall through to Tavily
  }

  try {
    const results = await searchTavily(query, MAX_SEARCH_RESULTS);
    if (results.length > 0) return results;
  } catch {
    // Both failed
  }

  return [];
}

/**
 * Extract structured site facts from raw search results using an AI model.
 */
async function extractFacts(
  model: LanguageModel,
  siteName: string,
  siteDescription: string,
  searchResults: SearchResult[],
): Promise<SiteFacts | null> {
  const snippets = searchResults
    .map((r) => `[${r.title}](${r.url})\n${r.snippet}`)
    .join('\n\n');

  try {
    const { object } = await generateObject({
      model,
      schema: siteFactsSchema,
      maxOutputTokens: 1024,
      prompt: `Extract verified business details for "${siteName}" (${siteDescription}) from these search results. Only include facts you are confident about from the search results. Leave fields empty/omitted if not found.

Search results:
${snippets}`,
    });

    // Check if we got anything useful (at least one non-empty field)
    const hasContent = Object.values(object).some((v) =>
      v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0) && !(typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0)
    );

    return hasContent ? object : null;
  } catch (err) {
    console.warn('[blueprint-research] Fact extraction failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Research site facts for a blueprint. Searches the web and extracts structured
 * business details. Returns null if search finds nothing or extraction fails.
 */
export async function researchSiteFacts(
  model: LanguageModel,
  siteName: string,
  siteDescription: string,
): Promise<SiteFacts | null> {
  const searchResults = await searchForBusiness(siteName, siteDescription);
  if (searchResults.length === 0) return null;

  return extractFacts(model, siteName, siteDescription, searchResults);
}
```

**Step 2: Verify types compile**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`

**Step 3: Commit**

```bash
git add src/lib/blueprint/research.ts
git commit -m "feat(blueprint): add research module for site facts extraction"
```

---

### Task 4: Integrate Research into Blueprint Generate Route

**Files:**
- Modify: `src/app/api/blueprint/generate/route.ts`

**Step 1: Add the research step after blueprint generation**

Add import at top:

```typescript
import { researchSiteFacts } from '@/lib/blueprint/research';
```

After the font sanitization lines (after line ~122 `blueprint.designSystem.bodyFont = sanitizeFont(...)`) and before the `prisma.blueprint.upsert` call, add:

```typescript
    // Research site facts if the AI flagged this as a real business
    if (blueprint.needsResearch) {
      try {
        const siteFacts = await researchSiteFacts(
          modelInstance,
          blueprint.siteName,
          blueprint.siteDescription,
        );
        if (siteFacts) {
          blueprint.siteFacts = siteFacts;
        }
      } catch (err) {
        // Non-fatal: proceed without facts
        console.warn('[blueprint-generate] Site facts research failed:', err instanceof Error ? err.message : err);
      }
    }
```

No other changes needed - the existing `prisma.blueprint.upsert` and response already use the `blueprint` object, so `siteFacts` will be included automatically.

**Step 2: Verify types compile**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`

**Step 3: Commit**

```bash
git add src/app/api/blueprint/generate/route.ts
git commit -m "feat(blueprint): run site facts research after blueprint generation"
```

---

### Task 5: Add `siteFacts` to Components System Prompt

**Files:**
- Modify: `src/lib/blueprint/prompts/components-system-prompt.ts`

**Step 1: Add site facts block to the prompt**

In `getComponentsSystemPrompt`, after the `<site_info>` block (after line ~48 `</site_info>`), add a conditional `<site_facts>` block. Change the function to build the site facts section:

```typescript
  const siteFactsBlock = blueprint.siteFacts
    ? `\n<site_facts>
These are verified business details from web research. Use them in the footer (address, phone, social links) and header (if relevant). Do NOT invent or guess details not listed here.
${blueprint.siteFacts.businessName ? `Business name: ${blueprint.siteFacts.businessName}` : ''}
${blueprint.siteFacts.address ? `Address: ${blueprint.siteFacts.address}` : ''}
${blueprint.siteFacts.phone ? `Phone: ${blueprint.siteFacts.phone}` : ''}
${blueprint.siteFacts.email ? `Email: ${blueprint.siteFacts.email}` : ''}
${blueprint.siteFacts.hours ? `Hours: ${blueprint.siteFacts.hours}` : ''}
${blueprint.siteFacts.services?.length ? `Services: ${blueprint.siteFacts.services.join(', ')}` : ''}
${blueprint.siteFacts.tagline ? `Tagline: ${blueprint.siteFacts.tagline}` : ''}
${blueprint.siteFacts.socialMedia ? `Social media: ${Object.entries(blueprint.siteFacts.socialMedia).map(([k, v]) => `${k}: ${v}`).join(', ')}` : ''}
${blueprint.siteFacts.additionalInfo ? `Additional info: ${blueprint.siteFacts.additionalInfo}` : ''}
</site_facts>\n`
    : '';
```

Then insert `${siteFactsBlock}` right after the `</site_info>` closing tag in the template literal.

Also update the `<footer_requirements>` section to reference site facts when available. After the existing footer tagline line, add:

```
${blueprint.siteFacts?.address ? `- Business address: "${blueprint.siteFacts.address}"` : ''}
${blueprint.siteFacts?.phone ? `- Phone number: "${blueprint.siteFacts.phone}"` : ''}
${blueprint.siteFacts?.socialMedia ? `- Social media links: ${Object.entries(blueprint.siteFacts.socialMedia).map(([k, v]) => `${k} (${v})`).join(', ')}` : ''}
```

**Step 2: Verify types compile**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`

**Step 3: Commit**

```bash
git add src/lib/blueprint/prompts/components-system-prompt.ts
git commit -m "feat(blueprint): include site facts in components system prompt"
```

---

### Task 6: Add `siteFacts` to Page System Prompt

**Files:**
- Modify: `src/lib/blueprint/prompts/page-system-prompt.ts`

**Step 1: Build site facts block and update webSearch guidance**

Add a `siteFactsBlock` variable similar to Task 5 (same construction), insert it before the `<content_strategy>` section.

**Step 2: Update the webSearch instruction in `<tool_workflow>`**

Replace the existing webSearch line (line ~197):

```
1. webSearch — search when the site references a real business, person, place, or location. Look up their actual details (address, phone, hours, services, team, local info). Also search for embed codes or integration details. Do NOT search for generic design inspiration, layout ideas, or "examples of X" — use your own knowledge for those.
```

With a conditional version:

```typescript
const webSearchInstruction = blueprint.siteFacts
  ? `1. webSearch — shared site facts are provided in <site_facts> above. Use them for address, phone, hours, social links, etc. — do NOT re-search for those. Only call webSearch for page-specific details NOT covered by site facts (e.g., detailed menu items, team member bios, gallery content, embed codes, local area info). Do NOT search for generic design inspiration, layout ideas, or "examples of X".`
  : `1. webSearch — search when the site references a real business, person, place, or location. Look up their actual details (address, phone, hours, services, team, local info). Also search for embed codes or integration details. Do NOT search for generic design inspiration, layout ideas, or "examples of X" — use your own knowledge for those.`;
```

Use `${webSearchInstruction}` in the template.

**Step 3: Verify types compile**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`

**Step 4: Commit**

```bash
git add src/lib/blueprint/prompts/page-system-prompt.ts
git commit -m "feat(blueprint): include site facts in page prompt, update webSearch guidance"
```

---

### Task 7: Add Business Details Section to Blueprint Card

**Files:**
- Modify: `src/features/blueprint/blueprint-card.tsx`

**Step 1: Add imports and SiteFacts type**

Add to existing imports:

```typescript
import { Building2 } from 'lucide-react';
import type { SiteFacts } from '@/lib/blueprint/types';
```

**Step 2: Add site facts editing helpers**

Inside the component, after the `updateStrategy` function, add:

```typescript
  const factsSource = isEditing ? draft.siteFacts : blueprint.siteFacts;

  const updateFact = (field: keyof SiteFacts, value: string | string[] | Record<string, string>) => {
    setDraft((prev) => ({
      ...prev,
      siteFacts: { ...prev.siteFacts, [field]: value },
    }));
  };
```

**Step 3: Add the Business Details section in JSX**

After the Tone section (after line ~232 closing `</div>`) and before the Actions `<div>`, add:

```tsx
        {/* Business Details (only if siteFacts present) */}
        {factsSource && Object.values(factsSource).some((v) => v !== undefined && v !== null && v !== '') && (
          <div className="space-y-2 border-t pt-3">
            <div className="flex items-center gap-1.5">
              <Building2 className="size-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">Business Details</span>
              {!isEditing && (
                <span className="ml-auto text-[10px] text-muted-foreground/60">from web research</span>
              )}
            </div>
            {factsSource.businessName && (
              <FactRow label="Name" value={factsSource.businessName} field="businessName" isEditing={isEditing} onChange={updateFact} />
            )}
            {factsSource.address && (
              <FactRow label="Address" value={factsSource.address} field="address" isEditing={isEditing} onChange={updateFact} />
            )}
            {factsSource.phone && (
              <FactRow label="Phone" value={factsSource.phone} field="phone" isEditing={isEditing} onChange={updateFact} />
            )}
            {factsSource.email && (
              <FactRow label="Email" value={factsSource.email} field="email" isEditing={isEditing} onChange={updateFact} />
            )}
            {factsSource.hours && (
              <FactRow label="Hours" value={factsSource.hours} field="hours" isEditing={isEditing} onChange={updateFact} />
            )}
            {factsSource.tagline && (
              <FactRow label="Tagline" value={factsSource.tagline} field="tagline" isEditing={isEditing} onChange={updateFact} />
            )}
            {factsSource.services && factsSource.services.length > 0 && !isEditing && (
              <div className="flex items-start gap-2 pl-5">
                <span className="w-14 shrink-0 text-xs font-medium text-muted-foreground">Services</span>
                <div className="flex flex-wrap gap-1">
                  {factsSource.services.map((s) => (
                    <span key={s} className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs">{s}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
```

**Step 4: Add the FactRow helper component**

Add this before the `BlueprintCard` export (or at the bottom of the file):

```tsx
function FactRow({
  label,
  value,
  field,
  isEditing,
  onChange,
}: {
  label: string;
  value: string;
  field: keyof SiteFacts;
  isEditing: boolean;
  onChange: (field: keyof SiteFacts, value: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 pl-5">
      <span className="w-14 shrink-0 text-xs font-medium text-muted-foreground">{label}</span>
      {isEditing ? (
        <input
          type="text"
          className="min-w-0 flex-1 border-b border-dashed border-input bg-transparent text-xs text-muted-foreground focus-visible:outline-none focus-visible:border-ring"
          value={value}
          onChange={(e) => onChange(field, e.target.value)}
        />
      ) : (
        <span className="text-xs text-muted-foreground">{value}</span>
      )}
    </div>
  );
}
```

**Step 5: Verify types compile**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`

**Step 6: Commit**

```bash
git add src/features/blueprint/blueprint-card.tsx
git commit -m "feat(blueprint): show editable business details in blueprint card"
```

---

### Task 8: Manual Integration Test

**Step 1: Start dev server**

Run: `npm run dev`

**Step 2: Test with a real business**

Enter a prompt like: "Create a website for Sunrise Bakery in Portland, Oregon"

Verify:
- Blueprint card shows a "Business Details" section with address, phone, etc.
- Clicking "Edit" allows modifying the facts
- After approving, the footer contains the same address/phone as the contact page
- All pages reference the same business details consistently

**Step 3: Test with a fictional business**

Enter: "Create a portfolio website for a freelance photographer"

Verify:
- No "Business Details" section in the blueprint card (needsResearch should be false/missing)
- Generation works as before

**Step 4: Test with search failure**

If Brave API key is missing/invalid, verify:
- Blueprint generates normally without siteFacts
- No error shown to user
- Pages fall back to webSearch as before

---
