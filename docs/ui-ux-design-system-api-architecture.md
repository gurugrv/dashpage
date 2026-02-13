# UI/UX Design System API Architecture
## Option B: Robust Implementation to Prevent Prompt Stuffing

### Problem Statement
Adding all 67 styles, 96 color palettes, 57 font pairings, and 100 industry rules to the system prompt would cause:
- Token bloat (~15K+ tokens)
- Reduced context window for user conversations
- Slower inference times
- Higher API costs
- Diminished focus on critical guidelines

### Solution: Hierarchical Design System Service

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              USER REQUEST                                    │
│  "Build a landing page for a beauty spa"                                    │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      INTENT CLASSIFIER (Lightweight)                         │
│  Extracts: Industry, Product Type, Style Keywords                           │
│  Output: { industry: "wellness", type: "service", keywords: ["elegant"] }   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    DESIGN SYSTEM RESOLVER API                                │
│  • Queries CSV databases (cached in memory)                                 │
│  • Matches industry → color palette, typography, patterns                   │
│  • Returns condensed design system (~500 tokens)                            │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│              DYNAMIC CONTEXT INJECTION (Per-Request)                         │
│  Appends relevant guidelines to system prompt at runtime                    │
│  Only includes matched rules, not full database                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         LLM GENERATION                                       │
│  Receives: Base prompt + Condensed Design System + User Request             │
│  Token overhead: ~500-800 tokens (vs 15K+ for full DB)                      │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Implementation Components

### 1. Intent Classifier (`src/lib/design-system/classifier.ts`)

```typescript
interface IntentClassification {
  industry: string;      // "wellness", "fintech", "saas", "ecommerce"
  productType: string;   // "landing", "dashboard", "portfolio"
  styleKeywords: string[]; // ["elegant", "minimal", "playful"]
  confidence: number;
}

// Uses lightweight keyword matching + fuzzy search
// No LLM call required - deterministic matching
export function classifyIntent(userPrompt: string): IntentClassification;
```

### 2. Design System Database (`src/lib/design-system/db/`)

CSV files converted to TypeScript objects at build time for fast in-memory access:

```typescript
// src/lib/design-system/db/index.ts
export const COLOR_PALETTES: Record<string, ColorPalette> = {
  wellness: {
    primary: '#EC4899',
    secondary: '#A8D5BA',
    accent: '#CA8A04',
    background: '#FDF2F8',
    text: '#831843',
    notes: 'Soft pink + sage green + gold'
  },
  fintech: {
    primary: '#0F172A',
    secondary: '#1E3A8A',
    accent: '#CA8A04',
    background: '#F8FAFC',
    text: '#020617',
    notes: 'Navy trust + gold premium'
  },
  // ... 94 more
};

export const TYPOGRAPHY_PAIRS: Record<string, FontPairing> = {
  luxury: {
    heading: 'Cormorant',
    body: 'Montserrat',
    mood: 'Elegant, calming, sophisticated',
    importUrl: 'https://fonts.google.com/share?selection.family=Cormorant|Montserrat'
  },
  modern: {
    heading: 'Space Grotesk',
    body: 'DM Sans',
    mood: 'Tech, modern, innovative',
    importUrl: 'https://fonts.google.com/share?selection.family=Space+Grotesk|DM+Sans'
  },
  // ... 55 more
};

export const INDUSTRY_RULES: Record<string, IndustryRule> = {
  'beauty-spa': {
    pattern: 'Hero-Centric + Social Proof',
    style: 'Soft UI Evolution',
    colorMood: 'Soft pastels + Gold accents',
    typographyMood: 'Elegant + Calming',
    keyEffects: 'Soft shadows + Smooth transitions (200-300ms)',
    antiPatterns: ['Bright neon colors', 'Harsh animations', 'AI purple/pink gradients'],
    severity: 'HIGH'
  },
  // ... 99 more
};
```

### 3. Design System Resolver (`src/lib/design-system/resolver.ts`)

```typescript
interface ResolvedDesignSystem {
  colors: ColorPalette;
  typography: FontPairing;
  industryRule: IndustryRule;
  layoutPattern: LayoutPattern;
  uxGuidelines: string[];
}

export function resolveDesignSystem(
  classification: IntentClassification
): ResolvedDesignSystem {
  // 1. Match industry → color palette
  const colors = COLOR_PALETTES[classification.industry] 
    ?? COLOR_PALETTES['saas']; // fallback

  // 2. Match style keywords → typography
  const typography = matchTypography(classification.styleKeywords);

  // 3. Match product type → industry rules
  const industryKey = `${classification.industry}-${classification.productType}`;
  const industryRule = INDUSTRY_RULES[industryKey] 
    ?? INDUSTRY_RULES[classification.industry];

  // 4. Get layout pattern
  const layoutPattern = LANDING_PATTERNS[
    industryRule?.pattern ?? 'Hero-Centric'
  ];

  // 5. Filter relevant UX guidelines
  const uxGuidelines = filterRelevantUX(classification);

  return { colors, typography, industryRule, layoutPattern, uxGuidelines };
}
```

### 4. Prompt Builder (`src/lib/design-system/prompt-builder.ts`)

```typescript
export function buildDesignSystemPrompt(
  resolved: ResolvedDesignSystem
): string {
  const { colors, typography, industryRule, layoutPattern } = resolved;

  return `<design_system_matched>
<colors>
Primary: ${colors.primary} | Secondary: ${colors.secondary} | Accent/CTA: ${colors.accent}
Background: ${colors.background} | Text: ${colors.text}
Notes: ${colors.notes}
</colors>

<typography>
Headings: ${typography.heading} | Body: ${typography.body}
Mood: ${typography.mood}
Google Fonts: ${typography.importUrl}
</typography>

<layout_pattern>
Type: ${layoutPattern.name}
Structure: ${layoutPattern.sections.join(' → ')}
CTA Placement: ${layoutPattern.ctaPlacement}
</layout_pattern>

${industryRule ? `<industry_specific>
Recommended Style: ${industryRule.style}
Key Effects: ${industryRule.keyEffects}
Anti-patterns to AVOID: ${industryRule.antiPatterns.join(', ')}
</industry_specific>` : ''}
</design_system_matched>`;
}
```

### 5. Chat API Integration (`src/app/api/chat/route.ts`)

```typescript
import { classifyIntent } from '@/lib/design-system/classifier';
import { resolveDesignSystem } from '@/lib/design-system/resolver';
import { buildDesignSystemPrompt } from '@/lib/design-system/prompt-builder';

export async function POST(req: Request) {
  const { messages, currentFiles, ... } = await req.json();
  const userPrompt = messages[messages.length - 1].content;

  // Step 1: Classify intent (deterministic, ~1ms)
  const classification = classifyIntent(userPrompt);

  // Step 2: Resolve design system (in-memory lookup, ~5ms)
  const designSystem = resolveDesignSystem(classification);

  // Step 3: Build dynamic prompt section (~500 tokens)
  const designSystemPrompt = buildDesignSystemPrompt(designSystem);

  // Step 4: Construct final system prompt
  const systemPrompt = getSystemPrompt(currentFiles?.['index.html'], {
    designSystemInjection: designSystemPrompt, // dynamic injection
  });

  // Step 5: Call LLM with enriched prompt
  const stream = await streamAIResponse(systemPrompt, messages);
  return new Response(stream);
}
```

## Token Budget Analysis

| Approach | Tokens | Impact |
|----------|--------|--------|
| **Full DB in Prompt** | ~15,000 | ❌ Too large, degrades performance |
| **Option A (Static Guidelines)** | ~1,200 | ✅ Good baseline always included |
| **Option B (Dynamic Match)** | ~500-800 | ✅ Per-request, highly relevant |
| **Combined (A + B)** | ~1,700-2,000 | ✅ Best balance: universal + specific |

## Caching Strategy

```typescript
// In-memory LRU cache for frequent classifications
const designSystemCache = new LRUCache<string, ResolvedDesignSystem>({
  max: 100, // Cache 100 most recent
  ttl: 1000 * 60 * 60, // 1 hour
});

export function resolveDesignSystem(classification: IntentClassification) {
  const cacheKey = `${classification.industry}-${classification.productType}`;
  
  if (designSystemCache.has(cacheKey)) {
    return designSystemCache.get(cacheKey)!;
  }

  const resolved = computeDesignSystem(classification);
  designSystemCache.set(cacheKey, resolved);
  return resolved;
}
```

## Fallback Strategy

When classification confidence is low (< 0.6):

```typescript
if (classification.confidence < 0.6) {
  // Don't inject specific design system
  // Rely on Option A static guidelines only
  return { designSystemInjection: null };
}
```

## Benefits of This Architecture

1. **No Prompt Stuffing**: Only relevant guidelines included per request
2. **Fast Resolution**: In-memory lookups, no external API calls
3. **Deterministic**: Same input → same design system (testable)
4. **Extensible**: Easy to add new industries, colors, patterns
5. **Cost Efficient**: Minimal token overhead (~500 tokens)
6. **Cacheable**: Frequently used design systems cached

## Migration Path

**Phase 1 (Current)**: Option A implemented ✅
- Static universal guidelines in system prompt
- Immediate improvement without complexity

**Phase 2**: Add classifier
- Implement intent classification
- Add logging to verify accuracy

**Phase 3**: Add resolver
- Convert CSV data to TypeScript
- Implement matching logic
- A/B test with/without dynamic injection

**Phase 4**: Full integration
- Integrate into chat API
- Add caching layer
- Monitor token usage and quality metrics

## File Structure

```
src/lib/design-system/
├── index.ts                 # Public API
├── classifier.ts            # Intent classification
├── resolver.ts              # Design system resolution
├── prompt-builder.ts        # Prompt generation
├── cache.ts                 # LRU cache implementation
└── db/
    ├── colors.ts            # Color palettes (96)
    ├── typography.ts        # Font pairings (57)
    ├── industry-rules.ts    # Industry rules (100)
    ├── layout-patterns.ts   # Landing patterns (30)
    └── ux-guidelines.ts     # Critical UX rules (99)
```

## Data Source Attribution

All data sourced from `docs/ui-ux-pro-max-skill-main/`:
- `src/ui-ux-pro-max/data/colors.csv` → `db/colors.ts`
- `src/ui-ux-pro-max/data/typography.csv` → `db/typography.ts`
- `src/ui-ux-pro-max/data/ui-reasoning.csv` → `db/industry-rules.ts`
- `src/ui-ux-pro-max/data/landing.csv` → `db/layout-patterns.ts`
- `src/ui-ux-pro-max/data/ux-guidelines.csv` → `db/ux-guidelines.ts`
