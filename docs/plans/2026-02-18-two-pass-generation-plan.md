# Two-Pass Single-Page Generation — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce single-page first-generation time from ~6-7 minutes to ~60-115 seconds by splitting into blueprint planning (Pass 1) + parallel section generation (Pass 2).

**Architecture:** Reuse existing blueprint pipeline for Pass 1 (structured JSON planning). New section-level parallel generation route for Pass 2. Assembly step merges section HTML fragments into one `index.html`. First-generation only — edits remain single-pass.

**Tech Stack:** Next.js App Router, Vercel AI SDK 6 (`streamText`, `generateText`), Zod schemas, SSE streaming, Cheerio (assembly validation)

**Design Doc:** `docs/plans/2026-02-18-two-pass-generation-design.md`

---

## Task 1: Extend Blueprint Schema with Section Content Fields

**Files:**
- Modify: `src/lib/blueprint/types.ts`

**Step 1: Add structured content fields to `blueprintPageSectionSchema`**

Add these optional fields after the existing `contentDepth` field in `blueprintPageSectionSchema` (around line 66):

```typescript
headlineText: z.string().optional().default('').describe('Exact headline text for this section (e.g., "Transform Your Smile with Confidence")'),
subheadlineText: z.string().optional().default('').describe('Exact subheadline or supporting text'),
ctaText: z.string().optional().default('').describe('Call-to-action button text (e.g., "Book Your Free Consultation")'),
ctaHref: z.string().optional().default('').describe('CTA link target (e.g., "#contact" or "pricing.html")'),
items: z.array(z.object({
  title: z.string().describe('Item title (e.g., "Cosmetic Dentistry")'),
  description: z.string().describe('Item description (1-2 sentences)'),
  iconQuery: z.string().optional().default('').describe('Icon search query for this item'),
  imageQuery: z.string().optional().default('').describe('Image search query for this item'),
})).optional().default([]).describe('Pre-planned content items for repeating elements (cards, features, services)'),
```

**Step 2: Add `sectionFlow` to `blueprintPageSchema`**

Add after the `sections` field (around line 81):

```typescript
sectionFlow: z.array(z.object({
  sectionId: z.string().describe('Matches a section id'),
  background: z.enum(['bg', 'surface', 'primary', 'dark', 'accent', 'gradient']).describe('Assigned background token'),
  visualWeight: z.enum(['heavy', 'balanced', 'light']).describe('Visual density'),
  dividerStyle: z.enum(['none', 'hairline', 'gradient-fade', 'diagonal-clip', 'wave']).optional().default('none').describe('Transition to next section'),
})).optional().default([]).describe('Explicit background and visual weight assignments per section for parallel generation coherence'),
```

**Step 3: Export new types**

Add after existing type exports (around line 170):

```typescript
export type BlueprintSectionItem = z.infer<typeof blueprintPageSectionSchema>['items'][number];
export type BlueprintSectionFlow = NonNullable<z.infer<typeof blueprintPageSchema>['sectionFlow']>[number];
```

**Step 4: Commit**

```bash
git add src/lib/blueprint/types.ts
git commit -m "feat(two-pass): extend blueprint schema with section content fields and sectionFlow"
```

---

## Task 2: Update Blueprint System Prompt for Richer Section Content

**Files:**
- Modify: `src/lib/blueprint/prompts/blueprint-system-prompt.ts`

**Step 1: Add section content fields to the example JSON in `<task>` block**

In the example sections inside the `<task>` block (lines ~23-37), add the new fields to the existing example sections. For the hero section example, add:

```
"headlineText": "We Build What Others Won't", "subheadlineText": "Engineering the impossible since 2019", "ctaText": "Start Your Project", "ctaHref": "#contact",
```

For the features section:

```
"items": [
  {"title": "Lightning Speed", "description": "Ship in weeks, not months", "iconQuery": "lightning bolt"},
  {"title": "Battle-Tested", "description": "99.9% uptime guarantee", "iconQuery": "shield check"},
  {"title": "24/7 Support", "description": "Real humans, not chatbots", "iconQuery": "headset"},
  {"title": "Fair Pricing", "description": "No hidden fees, no surprises", "iconQuery": "price tag"},
  {"title": "Custom Solutions", "description": "Tailored to your workflow", "iconQuery": "puzzle piece"}
],
```

Add a `sectionFlow` example to the page object (after `sections` array):

```json
"sectionFlow": [
  {"sectionId": "hero", "background": "gradient", "visualWeight": "heavy", "dividerStyle": "diagonal-clip"},
  {"sectionId": "features", "background": "bg", "visualWeight": "balanced", "dividerStyle": "none"},
  {"sectionId": "process", "background": "surface", "visualWeight": "balanced", "dividerStyle": "gradient-fade"},
  {"sectionId": "stats-cta", "background": "dark", "visualWeight": "light", "dividerStyle": "diagonal-clip"},
  {"sectionId": "testimonials", "background": "bg", "visualWeight": "balanced", "dividerStyle": "none"}
]
```

**Step 2: Add new field instructions to `<section_planning>` block**

After the existing `contentDepth` guidance (around line 162), add:

```
<section_content_planning>
For EVERY section, you MUST also populate these fields for two-pass generation coherence:

headlineText (REQUIRED for all sections): The exact headline text to display. Not a description — the actual words. Examples:
  - Hero: "Transform Your Smile with Confidence" (not "compelling headline about dental care")
  - Features: "Why Families Choose Us" (not "section about features")
  - Testimonials: "What Our Patients Say" (not "testimonials section")

subheadlineText: Supporting text below the headline. 1-2 sentences max.

ctaText + ctaHref: For any section with a call-to-action button. Use "#sectionId" for anchor links within the page.

items: For sections with repeating elements (features, services, team, testimonials, pricing tiers):
  - Each item needs title + description (1-2 real sentences, not lorem ipsum)
  - Add iconQuery for sections using icons (features, services, process steps)
  - Add imageQuery for sections needing photos (team, testimonials, gallery)
  - Match itemCount — if itemCount is 4, provide exactly 4 items

sectionFlow: REQUIRED array matching every section. Plan background alternation explicitly:
  - NEVER assign the same background to consecutive sections
  - Pattern example: gradient → bg → surface → dark → bg → surface
  - hero sections: typically "gradient" or "dark" with "heavy" weight
  - content sections: alternate "bg" and "surface" with "balanced" weight
  - stats/CTA sections: "dark" or "primary" with "light" weight
  - Use dividerStyle to create visual separation between similar backgrounds
</section_content_planning>
```

**Step 3: Verify no schema/prompt mismatch**

Read through the full prompt and ensure the example JSON matches the updated schema fields. All new fields have `.optional().default(...)` so existing blueprint generation won't break.

**Step 4: Commit**

```bash
git add src/lib/blueprint/prompts/blueprint-system-prompt.ts
git commit -m "feat(two-pass): enrich blueprint system prompt with section content planning"
```

---

## Task 3: Create Section-Level System Prompt Builder

**Files:**
- Create: `src/lib/twopass/section-prompt.ts`
- Create: `src/lib/twopass/types.ts`

**Step 1: Create types file**

```typescript
// src/lib/twopass/types.ts
import type { Blueprint, BlueprintPageSection, BlueprintSectionFlow } from '@/lib/blueprint/types';

export interface SectionGenerationContext {
  blueprint: Blueprint;
  section: BlueprintPageSection;
  sectionIndex: number;
  totalSections: number;
  flow: BlueprintSectionFlow | undefined;
  previousSection?: { id: string; name: string; background: string; summary: string };
  nextSection?: { id: string; name: string; background: string; summary: string };
  isHeader: boolean;
  isFooter: boolean;
  headTags: string;
  anchorIds: string[];
}

export interface SectionResult {
  sectionId: string;
  html: string;
  error?: string;
}
```

**Step 2: Create section prompt builder**

Create `src/lib/twopass/section-prompt.ts`. This builds a focused prompt for generating one section HTML fragment. The prompt must:

- Include design system token reference (variable names only, not definitions — those come from the shared `<style>`)
- Include content strategy (tone, audience, brand voice, CTA)
- Include site facts if present
- Include the section's full spec with headlineText, items, layout hints
- Include neighbor context (what comes before/after)
- Include sectionFlow entry (assigned background, visual weight, divider)
- Include shared copy anchors (business name, primary CTA text from contentStrategy)
- Include tool workflow (searchImages/searchIcons → writeSection)
- Include rules (Tailwind only, data-block required, namespace keyframes)

Key sections of the prompt:

```typescript
import type { SectionGenerationContext } from './types';
import { INTERACTIVITY_SECTION } from '@/lib/prompts/sections/interactivity';

export function getSectionSystemPrompt(ctx: SectionGenerationContext): string {
  const { blueprint, section, flow, previousSection, nextSection, isHeader, isFooter, anchorIds } = ctx;
  const { designSystem, contentStrategy, sharedComponents } = blueprint;

  // Build items list if present
  const itemsList = section.items?.length
    ? section.items.map((item, i) => {
        const parts = [`  ${i + 1}. "${item.title}": ${item.description}`];
        if (item.iconQuery) parts.push(`     Icon: search for "${item.iconQuery}"`);
        if (item.imageQuery) parts.push(`     Image: search for "${item.imageQuery}"`);
        return parts.join('\n');
      }).join('\n')
    : '';

  // Build neighbor context
  const neighborBlock = [
    previousSection ? `Previous section: "${previousSection.id}" — ${previousSection.summary} (${previousSection.background} background)` : 'This is the FIRST section on the page.',
    nextSection ? `Next section: "${nextSection.id}" — ${nextSection.summary} (${nextSection.background} background)` : 'This is the LAST section on the page.',
  ].join('\n');

  // Background mapping
  const bgMap: Record<string, string> = {
    bg: 'bg-[var(--color-bg)]',
    surface: 'bg-[var(--color-surface)]',
    primary: 'bg-[var(--color-primary)] text-white',
    dark: 'bg-gray-900 text-white',
    accent: 'bg-[var(--color-accent)]',
    gradient: 'a CSS gradient using var(--color-primary) and var(--color-secondary)',
  };
  const assignedBg = flow ? bgMap[flow.background] || 'bg-[var(--color-bg)]' : 'bg-[var(--color-bg)]';

  // Header/footer special handling
  if (isHeader) {
    return buildHeaderPrompt(blueprint, anchorIds);
  }
  if (isFooter) {
    return buildFooterPrompt(blueprint, anchorIds);
  }

  return `You generate ONE section of a website as an HTML fragment. Your output must feel like part of a cohesive whole.

<design_tokens>
Available CSS custom properties (defined in the page's <style> — do NOT redefine them):
  --color-primary, --color-secondary, --color-accent, --color-bg, --color-surface, --color-text, --color-text-muted
  --font-heading, --font-body
  --shadow-sm, --shadow-md, --shadow-lg
  --radius, --transition

Mood: ${designSystem.mood}
Surface Treatment: ${designSystem.surfaceTreatment || 'clean'}
Visual Style: ${designSystem.visualStyle || 'bold-expressive'}
</design_tokens>

<content_strategy>
Tone: ${contentStrategy.tone}
Target Audience: ${contentStrategy.targetAudience}
Primary CTA: ${contentStrategy.primaryCTA}
Brand Voice: ${contentStrategy.brandVoice}
${contentStrategy.valuePropositions?.length ? `Value Props: ${contentStrategy.valuePropositions.join(' | ')}` : ''}
${contentStrategy.keyStats?.length ? `Key Stats: ${contentStrategy.keyStats.map(s => `${s.value} ${s.label}`).join(', ')}` : ''}
${contentStrategy.brandStory ? `Brand Story: ${contentStrategy.brandStory}` : ''}
</content_strategy>

${blueprint.siteFacts ? buildSiteFactsBlock(blueprint.siteFacts) : ''}

<your_section>
Section: "${section.name}" [${section.id}]
Purpose: ${section.description}
${section.contentNotes ? `Content Notes: ${section.contentNotes}` : ''}
${section.headlineText ? `Headline: "${section.headlineText}"` : ''}
${section.subheadlineText ? `Subheadline: "${section.subheadlineText}"` : ''}
${section.ctaText ? `CTA: "${section.ctaText}" → ${section.ctaHref || '#'}` : ''}
Type: ${section.sectionType || 'custom'}
Layout: ${section.layoutHint || 'stacked'}
${section.itemCount ? `Items: ${section.itemCount}` : ''}
${section.mediaType && section.mediaType !== 'none' ? `Media: ${section.mediaType}` : ''}
${section.interactiveElement && section.interactiveElement !== 'none' ? `Interactive: ${section.interactiveElement}` : ''}
${section.motionIntent && section.motionIntent !== 'none' ? `Motion: ${section.motionIntent}` : ''}
${section.imageDirection ? `Image Direction: ${section.imageDirection}` : ''}
${itemsList ? `\nContent Items:\n${itemsList}` : ''}
</your_section>

<section_context>
${neighborBlock}

Your assigned background: ${assignedBg}
Visual weight: ${flow?.visualWeight || 'balanced'}
${flow?.dividerStyle && flow.dividerStyle !== 'none' ? `Divider below: ${flow.dividerStyle} (add a visual transition at the bottom of your section)` : ''}
</section_context>

<shared_copy>
Business/Site Name: ${blueprint.siteName}
Primary CTA Text: ${contentStrategy.primaryCTA}
${sharedComponents.footerTagline ? `Tagline: ${sharedComponents.footerTagline}` : ''}
</shared_copy>

${INTERACTIVITY_SECTION}

<tool_workflow>
Call tools BEFORE writing the section. Parallel calls save steps:
1. searchImages({ queries: [...] }) + searchIcons({ queries: [...] }) — gather all media in one call
   - Only search for what THIS section needs based on its media type and items
2. writeSection({ sectionId: "${section.id}", content: "<section>...</section>" })
   The content MUST be a single <section data-block="${section.id}"> element with complete HTML inside.

If a tool fails: use https://placehold.co/800x400/eee/999?text=Image for images, inline SVG for icons.
</tool_workflow>

<rules>
1. Output ONLY a <section data-block="${section.id}"> element. No <!DOCTYPE>, no <html>, no <head>, no <body>.
2. Use Tailwind utility classes + CSS custom properties everywhere. No hardcoded colors.
3. Do NOT include any <style> blocks. All styling via Tailwind utilities + design tokens.
   Exception: if you need a @keyframes animation, wrap it in <style> and prefix the name with your section ID: @keyframes ${section.id}-fadeIn
4. Responsive mobile-first. Test mental model: mobile → tablet → desktop.
5. All interactive elements (accordion, tabs, carousel) use Alpine.js (x-data, x-show, x-on:click, etc.)
6. Use your assigned background class on the outermost <section> element.
7. MUST call writeSection to output — do NOT output raw HTML as text.
8. If headlineText is provided, use it EXACTLY. Do not rephrase or improvise different text.
9. If items are provided, use their exact titles and descriptions. Do not add extra items beyond itemCount.
</rules>`;
}
```

Include helper functions `buildHeaderPrompt()`, `buildFooterPrompt()`, and `buildSiteFactsBlock()` in the same file. Header prompt generates a `<header data-block="main-nav">` fragment with sticky positioning, mobile hamburger (Alpine.js), and anchor links to section IDs. Footer prompt generates a `<footer data-block="site-footer">` with site name, tagline, section links, and copyright.

**Step 3: Commit**

```bash
git add src/lib/twopass/types.ts src/lib/twopass/section-prompt.ts
git commit -m "feat(two-pass): create section-level system prompt builder"
```

---

## Task 4: Create Page Assembly Function

**Files:**
- Create: `src/lib/twopass/assemble-page.ts`

**Step 1: Build the assembly function**

This function takes section HTML fragments and merges them into a complete `index.html`:

```typescript
import type { Blueprint } from '@/lib/blueprint/types';
import type { SectionResult } from './types';
import { generateSharedStyles } from '@/lib/blueprint/generate-shared-styles';
import { validateBlocks } from '@/lib/blocks/validate-blocks';
import type { ProjectFiles } from '@/types';

export function assemblePageFromSections(
  blueprint: Blueprint,
  sectionResults: SectionResult[],
  headTags: string,
): ProjectFiles {
  const page = blueprint.pages[0];
  const orderedSections = page.sections
    .map(s => sectionResults.find(r => r.sectionId === s.id))
    .filter((r): r is SectionResult => r !== undefined && !r.error);

  const headerResult = sectionResults.find(r => r.sectionId === 'main-nav');
  const footerResult = sectionResults.find(r => r.sectionId === 'site-footer');

  // Collect any <style> blocks from sections, hoist to <head>
  const styleBlocks: string[] = [];
  const cleanedSections = orderedSections.map(r => {
    return extractAndCollectStyles(r.html, r.sectionId, styleBlocks);
  });

  const headerHtml = headerResult ? extractAndCollectStyles(headerResult.html, 'main-nav', styleBlocks) : '';
  const footerHtml = footerResult ? extractAndCollectStyles(footerResult.html, 'site-footer', styleBlocks) : '';

  const hoistedStyles = styleBlocks.length > 0
    ? `<style>\n${styleBlocks.join('\n')}\n</style>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${page.title}</title>
  <meta name="description" content="${page.description}">
${headTags}
${hoistedStyles}
</head>
<body class="bg-[var(--color-bg)] text-[var(--color-text)] font-[var(--font-body)]">
${headerHtml}
<main>
${cleanedSections.join('\n')}
</main>
${footerHtml}
</body>
</html>`;

  const files: ProjectFiles = { 'index.html': html };
  validateBlocks(files);
  return files;
}
```

Include helper `extractAndCollectStyles(html, sectionId, collector)` that uses a regex to find `<style>` blocks within a section fragment, extracts them into the collector array (for hoisting to `<head>`), and returns the fragment without `<style>` blocks.

Also include `assemblePartialPage()` for incremental preview — same logic but tolerates missing sections (shows completed ones only).

**Step 2: Commit**

```bash
git add src/lib/twopass/assemble-page.ts
git commit -m "feat(two-pass): create page assembly function for section fragments"
```

---

## Task 5: Create Section Generation API Route

**Files:**
- Create: `src/app/api/twopass/sections/route.ts`

**Step 1: Build the route**

Model this closely on `/api/blueprint/pages/route.ts` (lines 146-548). Key differences:

- Input: `{ conversationId, provider, model, maxOutputTokens, blueprint, headTags }`
- Instead of iterating `blueprint.pages`, iterate `blueprint.pages[0].sections` + header + footer
- Each section uses `getSectionSystemPrompt()` instead of `getPageSystemPrompt()`
- Custom `writeSection` tool (not `writeFile`) — accepts `{ sectionId: string, content: string }`, validates the HTML contains a `<section>` or `<header>`/`<footer>` element, returns the content
- Tool subset: `writeSection`, `searchImages`, `searchIcons`, `webSearch`, `fetchUrl`
- `stopWhen: [hasToolCall('writeSection'), stepCountIs(6)]`
- SSE events match blueprint pages format: `section-status` (same shape as `page-status` but uses sectionId), `tool-activity`, `code-delta`, `pipeline-status`, `post-processed`
- Max concurrent: 5 (same as `MAX_CONCURRENT_PAGES`)
- After all sections complete: call `assemblePageFromSections()`, send `post-processed` event with the final `{ "index.html": html }`
- One retry per failed section with simplified prompt (no tool calls, just generate HTML from the plan)

The route structure:

```typescript
import { hasToolCall, stepCountIs, streamText } from 'ai';
import { prisma } from '@/lib/db/prisma';
import { resolveApiKey } from '@/lib/keys/key-manager';
import { PROVIDERS } from '@/lib/providers/registry';
import { getSectionSystemPrompt } from '@/lib/twopass/section-prompt';
import { assemblePageFromSections } from '@/lib/twopass/assemble-page';
import type { SectionResult, SectionGenerationContext } from '@/lib/twopass/types';
import type { Blueprint } from '@/lib/blueprint/types';
import { ChatRequestError } from '@/lib/chat/errors';
import { resolveMaxOutputTokens } from '@/lib/chat/constants';
import { registerGeneration, unregisterGeneration } from '@/lib/stream/generation-registry';
import { validateBlocks } from '@/lib/blocks/validate-blocks';
import { createOpenRouterModel } from '@/lib/providers/configs/openrouter';
import { tool } from 'ai';
import { z } from 'zod';

const MAX_CONCURRENT_SECTIONS = 5;

// ... route handler follows pattern of /api/blueprint/pages/route.ts
// Key: create writeSection tool per section, generate in parallel, assemble at end
```

For the `writeSection` tool definition:

```typescript
function createSectionTool(sectionId: string) {
  return {
    writeSection: tool({
      description: 'Write the HTML for this section',
      parameters: z.object({
        sectionId: z.string().describe('The section ID'),
        content: z.string().describe('Complete HTML for the section element'),
      }),
      execute: async ({ content }) => {
        return { success: true, content };
      },
    }),
  };
}
```

Also include `searchImages`, `searchIcons`, `webSearch`, `fetchUrl` from `createWebsiteTools` — but extract them individually rather than creating the full tool set. Use the `toolSubset` option:

```typescript
const SECTION_TOOLS = new Set(['searchImages', 'searchIcons', 'webSearch', 'fetchUrl']);
const { tools: resourceTools } = createWebsiteTools({}, { toolSubset: SECTION_TOOLS, imageProvider, imageModel });
const sectionTools = { ...resourceTools, ...createSectionTool(sectionId) };
```

For building `SectionGenerationContext` for each section, compute `previousSection` and `nextSection` from the ordered sections array and `sectionFlow`:

```typescript
function buildSectionContext(
  blueprint: Blueprint,
  sectionIndex: number,
  headTags: string,
): SectionGenerationContext {
  const page = blueprint.pages[0];
  const section = page.sections[sectionIndex];
  const flow = page.sectionFlow?.find(f => f.sectionId === section.id);
  const anchorIds = page.sections.map(s => s.id);

  const prev = sectionIndex > 0 ? page.sections[sectionIndex - 1] : undefined;
  const next = sectionIndex < page.sections.length - 1 ? page.sections[sectionIndex + 1] : undefined;
  const prevFlow = prev ? page.sectionFlow?.find(f => f.sectionId === prev.id) : undefined;
  const nextFlow = next ? page.sectionFlow?.find(f => f.sectionId === next.id) : undefined;

  return {
    blueprint,
    section,
    sectionIndex,
    totalSections: page.sections.length,
    flow,
    previousSection: prev ? { id: prev.id, name: prev.name, background: prevFlow?.background || 'bg', summary: prev.description } : undefined,
    nextSection: next ? { id: next.id, name: next.name, background: nextFlow?.background || 'bg', summary: next.description } : undefined,
    isHeader: false,
    isFooter: false,
    headTags,
    anchorIds,
  };
}
```

**Step 2: Commit**

```bash
git add src/app/api/twopass/sections/route.ts
git commit -m "feat(two-pass): create parallel section generation API route"
```

---

## Task 6: Create Client Orchestration Hook

**Files:**
- Create: `src/hooks/useTwoPassGeneration.ts`

**Step 1: Build the hook**

Model on `useBlueprintGeneration.ts` but simplified — no blueprint review/edit step, no components step, no resume state.

```typescript
'use client';

import { useCallback, useRef, useState } from 'react';
import type { Blueprint } from '@/lib/blueprint/types';
import type { ProjectFiles } from '@/types';
import { generateSharedStyles } from '@/lib/blueprint/generate-shared-styles';

export type TwoPassPhase =
  | 'idle'
  | 'planning'        // Pass 1: generating blueprint
  | 'generating'      // Pass 2: parallel section generation
  | 'complete'
  | 'error';

export interface SectionStatus {
  sectionId: string;
  name: string;
  status: 'pending' | 'generating' | 'complete' | 'error';
  error?: string;
}

interface UseTwoPassGenerationOptions {
  resolveModel: () => { provider: string; model: string; maxOutputTokens?: number } | null;
  savedTimeZone?: string | null;
  browserTimeZone?: string;
  onFilesReady: (files: ProjectFiles) => void;
  imageProvider?: 'pexels' | 'together';
  imageModel?: string;
}
```

The hook exposes:
- `phase: TwoPassPhase`
- `sectionStatuses: SectionStatus[]`
- `blueprint: Blueprint | null`
- `error: string | null`
- `generate(prompt: string, conversationId: string): Promise<void>`
- `cancel(): void`

The `generate` function:

```typescript
const generate = useCallback(async (prompt: string, conversationId: string) => {
  const modelConfig = resolveModel();
  if (!modelConfig) { setError('No model selected'); return; }

  setPhase('planning');
  abortControllerRef.current = new AbortController();

  // Pass 1: Generate blueprint (reuse existing endpoint)
  const blueprintRes = await fetch('/api/blueprint/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      conversationId,
      provider: modelConfig.provider,
      model: modelConfig.model,
      maxOutputTokens: modelConfig.maxOutputTokens,
      savedTimeZone,
      browserTimeZone,
    }),
    signal: abortControllerRef.current.signal,
  });

  if (!blueprintRes.ok) { /* handle error */ return; }
  const { blueprint } = await blueprintRes.json();

  // Check minimum section threshold
  if (blueprint.pages[0].sections.length < 3) {
    // Fall back to single-pass chat (too few sections for parallelism benefit)
    setPhase('idle');
    // Signal caller to use chat mode instead
    return;
  }

  // Wait for research if pending
  await pollForResearch(conversationId);

  setBlueprint(blueprint);
  setPhase('generating');

  // Generate shared styles (synchronous)
  const sharedStyles = generateSharedStyles(blueprint.designSystem);

  // Initialize section statuses
  const statuses: SectionStatus[] = [
    { sectionId: 'main-nav', name: 'Header', status: 'pending' },
    ...blueprint.pages[0].sections.map((s: { id: string; name: string }) => ({
      sectionId: s.id, name: s.name, status: 'pending' as const,
    })),
    { sectionId: 'site-footer', name: 'Footer', status: 'pending' },
  ];
  setSectionStatuses(statuses);

  // Pass 2: Parallel section generation via SSE
  const sectionsRes = await fetch('/api/twopass/sections', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      conversationId,
      provider: modelConfig.provider,
      model: modelConfig.model,
      maxOutputTokens: modelConfig.maxOutputTokens,
      blueprint,
      headTags: sharedStyles.headTags,
      imageProvider,
      imageModel,
    }),
    signal: abortControllerRef.current.signal,
  });

  // Process SSE stream (same pattern as useBlueprintGeneration.generatePages)
  // Update sectionStatuses on section-status events
  // On post-processed event: call onFilesReady with assembled files
  // On pipeline-status complete: setPhase('complete')
}, [resolveModel, savedTimeZone, browserTimeZone, onFilesReady, imageProvider, imageModel]);
```

Include `pollForResearch()` helper (same pattern as `useBlueprintGeneration` lines 780-812 — poll `/api/blueprint/{conversationId}` up to 5 times waiting for `researchPending` to clear).

**Step 2: Commit**

```bash
git add src/hooks/useTwoPassGeneration.ts
git commit -m "feat(two-pass): create client orchestration hook"
```

---

## Task 7: Integrate Two-Pass into Builder

**Files:**
- Modify: `src/components/Builder.tsx`

**Step 1: Import and initialize the hook**

After the `useBlueprintGeneration` initialization (around line 148-155), add:

```typescript
import { useTwoPassGeneration, type TwoPassPhase } from '@/hooks/useTwoPassGeneration';

// Inside Builder():
const {
  phase: twoPassPhase,
  sectionStatuses,
  blueprint: twoPassBlueprint,
  error: twoPassError,
  generate: twoPassGenerate,
  cancel: cancelTwoPass,
} = useTwoPassGeneration({
  resolveModel: useCallback(() => {
    if (!effectiveSelectedProvider || !effectiveSelectedModel) return null;
    return {
      provider: effectiveSelectedProvider,
      model: effectiveSelectedModel,
      maxOutputTokens: resolveMaxOutputTokens(),
    };
  }, [effectiveSelectedProvider, effectiveSelectedModel, resolveMaxOutputTokens]),
  savedTimeZone: getSavedTimeZone(),
  browserTimeZone: getBrowserTimeZone(),
  onFilesReady: setFilesWithRef,
  imageProvider: imageGenConfig.provider,
  imageModel: imageGenConfig.model,
});

const isTwoPassBusy = twoPassPhase !== 'idle' && twoPassPhase !== 'complete' && twoPassPhase !== 'error';
```

**Step 2: Route first-generation to two-pass instead of blueprint**

In the `handleSubmit` function (around line 468-481), the current code routes first messages to `discovery.startDiscovery()`. After discovery completes (around line 733-747), it calls `generateBlueprint()`. Change this to call `twoPassGenerate()` instead when the prompt results in a single-page site.

The cleanest integration point is in the discovery completion effect (lines 733-747). Currently:

```typescript
discovery.reset();
generateBlueprint(prompt, convId);
```

Change to:

```typescript
discovery.reset();
twoPassGenerate(prompt, convId);
```

This routes ALL first generations through two-pass. The hook itself handles the < 3 sections fallback (returns to idle, signaling the caller to use blueprint mode instead).

Add a fallback effect: if `twoPassPhase` transitions to `idle` after `planning` (meaning the hook declined — too few sections), trigger the normal blueprint flow:

```typescript
const prevTwoPassPhaseRef = useRef<TwoPassPhase>('idle');
useEffect(() => {
  const prev = prevTwoPassPhaseRef.current;
  prevTwoPassPhaseRef.current = twoPassPhase;

  // Two-pass declined (< 3 sections) — fall back to blueprint
  if (prev === 'planning' && twoPassPhase === 'idle') {
    const prompt = pendingBlueprintPromptRef.current;
    const convId = pendingBlueprintConversationIdRef.current;
    if (prompt && convId) {
      pendingBlueprintPromptRef.current = null;
      pendingBlueprintConversationIdRef.current = null;
      generateBlueprint(prompt, convId);
    }
  }
}, [twoPassPhase, generateBlueprint]);
```

**Step 3: Update busy state check**

Update `isBlueprintBusy` check at line 157 and the `handleSubmit` guard at line 440 to also check `isTwoPassBusy`:

```typescript
const isAnyGenerationBusy = isBlueprintBusy || isTwoPassBusy;
// Use isAnyGenerationBusy where isBlueprintBusy was used
```

**Step 4: Wire up stop/cancel**

In the stop handler (line 792), add `cancelTwoPass()`:

```typescript
onStop={() => { savePartial(); stop(); cancelTwoPass(); resetProgress(); }}
```

**Step 5: Add completion persistence**

Add an effect similar to the blueprint completion effect (lines 672-731) but for two-pass:

```typescript
useEffect(() => {
  if (twoPassPhase !== 'complete') return;
  const files = currentFilesRef.current;
  const convId = activeConversationIdRef.current;
  if (!convId || !isPersistableArtifact(files)) return;

  const bp = twoPassBlueprint;
  const content = bp
    ? `**${bp.siteName}** — ${bp.siteDescription}\n\nDesign: ${bp.designSystem.mood} · ${bp.designSystem.headingFont} / ${bp.designSystem.bodyFont} · ${bp.designSystem.primaryColor}`
    : 'Generated your website.';

  setStatusMessages([{
    id: `twopass-complete-${Date.now()}`,
    role: 'assistant' as const,
    parts: [{ type: 'text' as const, text: content }],
  }]);

  fetch(`/api/conversations/${convId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'assistant', content, htmlArtifact: files }),
  })
    .then(() => fetch(`/api/conversations/${convId}/generation-state`, { method: 'DELETE' }))
    .catch(err => console.error('Failed to persist two-pass completion:', err));
}, [twoPassPhase, twoPassBlueprint]);
```

**Step 6: Add phase status messages**

Add an effect for two-pass phase transitions (similar to lines 634-670):

```typescript
useEffect(() => {
  if (twoPassPhase === 'idle' || twoPassPhase === 'error') return;
  const phaseMessages: Partial<Record<TwoPassPhase, string>> = {
    'planning': 'Planning your site structure and design...',
    'generating': 'Building sections in parallel — this should be quick...',
  };
  const text = phaseMessages[twoPassPhase];
  if (text) {
    setStatusMessages(prev => [
      ...prev.filter(m => !m.id.startsWith('twopass-phase-')),
      { id: `twopass-phase-${twoPassPhase}-${Date.now()}`, role: 'assistant' as const, parts: [{ type: 'text' as const, text }] },
    ]);
  }
}, [twoPassPhase]);
```

**Step 7: Commit**

```bash
git add src/components/Builder.tsx
git commit -m "feat(two-pass): integrate two-pass generation into Builder"
```

---

## Task 8: Update Build Progress for Two-Pass Phases

**Files:**
- Modify: `src/components/BuildProgress.tsx`
- Modify: `src/hooks/useBuildProgress.ts` (if needed)

**Step 1: Add two-pass progress steps**

In `BuildProgress.tsx`, add a new step array for two-pass mode:

```typescript
const TWO_PASS_STEPS: Step[] = [
  { label: 'Planning', threshold: 20 },
  { label: 'Building sections', threshold: 90 },
  { label: 'Assembling', threshold: 100 },
];
```

**Step 2: Accept two-pass props**

Add optional props for two-pass section statuses:

```typescript
interface BuildProgressProps {
  progress: BuildProgressState;
  twoPassPhase?: TwoPassPhase;
  sectionStatuses?: SectionStatus[];
}
```

When `twoPassPhase` is present and not `idle`, render the two-pass progress view instead of the standard one. Show per-section status indicators (pending/generating/complete icons) below the main progress bar.

**Step 3: Wire props from Builder**

In `Builder.tsx`, pass `twoPassPhase` and `sectionStatuses` to the `PromptPanel` → `BuildProgress` chain. This requires threading the props through `PromptPanel`.

**Step 4: Commit**

```bash
git add src/components/BuildProgress.tsx src/hooks/useBuildProgress.ts src/components/PromptPanel.tsx
git commit -m "feat(two-pass): add section-level progress indicators"
```

---

## Task 9: End-to-End Testing and Quality Verification

**Files:** No new files — manual testing

**Step 1: Start dev server and test**

```bash
npm run dev
```

**Step 2: Test happy path**

1. Open localhost:3000, ensure a provider/model is configured
2. Type "Create a website for Bright Smile Dental" and submit
3. Verify: discovery phase triggers (if business detected)
4. Verify: "Planning your site..." status message appears
5. Verify: blueprint generation completes (check network tab for `/api/blueprint/generate`)
6. Verify: "Building sections..." with per-section progress appears
7. Verify: sections complete in parallel (check network tab for `/api/twopass/sections` SSE)
8. Verify: preview renders incrementally as sections complete
9. Verify: final assembled page looks cohesive — check:
   - Background alternation follows sectionFlow
   - Headlines match what Pass 1 planned
   - Design tokens used consistently (no hardcoded colors)
   - Header has working mobile menu
   - Footer has correct section links
   - No duplicate `<style>` blocks in `<head>`
10. Verify: subsequent edits work via normal chat ("Make the hero bigger")

**Step 3: Test edge cases**

1. **Vague prompt:** "make me a website" — should still produce a coherent site
2. **Abort:** Click stop during Pass 2 — should cleanly cancel all section calls
3. **Small site:** "Create a simple landing page with just a hero and contact form" — should fall back to blueprint mode (< 3 sections)
4. **Business site with discovery:** Test with a real business name to verify siteFacts flow through

**Step 4: Quality comparison**

Generate the same prompt via both two-pass (new) and single-pass (existing blueprint mode) and compare:
- Visual coherence
- Content quality
- Design token consistency
- Mobile responsiveness
- Interactive element functionality (accordions, carousels)

**Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix(two-pass): address issues found in end-to-end testing"
```

---

## Summary

| Task | Files | Estimated Effort |
|------|-------|---------|
| 1. Extend blueprint schema | types.ts | Small |
| 2. Update blueprint prompt | blueprint-system-prompt.ts | Medium |
| 3. Section prompt builder | NEW section-prompt.ts, types.ts | Large |
| 4. Page assembly function | NEW assemble-page.ts | Medium |
| 5. Section generation route | NEW route.ts | Large |
| 6. Client orchestration hook | NEW useTwoPassGeneration.ts | Large |
| 7. Builder integration | Builder.tsx | Medium |
| 8. Progress UI | BuildProgress.tsx, PromptPanel.tsx | Small |
| 9. E2E testing | Manual | Medium |

Tasks 1-2 are schema/prompt changes (low risk). Tasks 3-6 are the core new code. Task 7 is integration. Tasks 8-9 are polish and verification.
