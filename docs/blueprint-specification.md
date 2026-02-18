# Blueprint Specification

The JSON schema for blueprints, design system fields, page specifications, and the 4-step generation pipeline.

---

## Overview

A Blueprint is a structured JSON plan that describes a complete website before any HTML is generated. The AI produces the blueprint first (structured output), the user reviews and edits it, then the system generates shared components, assets, and pages from it.

**Type definition:** `src/lib/blueprint/types.ts`

---

## Top-Level Schema

```typescript
interface Blueprint {
  siteName: string;                          // Name of the website
  siteDescription: string;                   // One-sentence description
  pages: BlueprintPage[];                    // Ordered page list (min 1)
  designSystem: BlueprintDesignSystem;       // Full design system
  sharedComponents: BlueprintSharedComponents; // Nav links + footer tagline
  contentStrategy: BlueprintContentStrategy; // Tone, audience, CTAs
  needsResearch: boolean;                    // True if site references a real business

  // Runtime-only (not in AI schema, populated post-generation):
  siteFacts?: SiteFacts;                     // Verified business data
  researchPending?: boolean;                 // True while background research runs
}
```

---

## Design System

```typescript
interface BlueprintDesignSystem {
  primaryColor: string;       // Hex, min 4 chars (e.g., "#3B82F6")
  secondaryColor: string;     // Hex
  accentColor: string;        // Hex
  backgroundColor: string;    // Hex — page background
  surfaceColor: string;       // Hex — card/panel background
  textColor: string;          // Hex — primary text
  textMutedColor: string;     // Hex — secondary/muted text
  headingFont: string;        // Google Font name (e.g., "Inter")
  bodyFont: string;           // Google Font name
  borderRadius: string;       // CSS token (e.g., "8px")
  mood: string;               // Evocative phrase (e.g., "warm rustic charm"), min 3 chars
  surfaceTreatment: SurfaceTreatment; // Default: "clean"
}
```

**Surface treatment options:** `textured`, `layered-gradients`, `glassmorphism`, `clean`, `organic`, `neubrutalist`, `claymorphism`

These values are translated into CSS custom properties during generation:

```css
:root {
  --color-primary: #3B82F6;
  --color-secondary: #...;
  --color-accent: #...;
  --color-bg: #...;
  --color-surface: #...;
  --color-text: #...;
  --color-text-muted: #...;
  --font-heading: 'Inter', sans-serif;
  --font-body: 'Source Sans Pro', sans-serif;
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
  --shadow-md: 0 4px 6px -1px rgba(0,0,0,0.1);
  --shadow-lg: 0 10px 15px -3px rgba(0,0,0,0.1);
  --radius: 8px;
  --transition: all 0.2s ease-in-out;
}
```

---

## Pages

```typescript
interface BlueprintPage {
  filename: string;          // e.g., "index.html", "about.html"
  title: string;             // Page <title> tag
  description: string;       // Meta description
  purpose: string;           // Role of this page in the site
  sections: BlueprintPageSection[]; // Ordered section list
}
```

### Page Sections

```typescript
interface BlueprintPageSection {
  id: string;                            // Unique kebab-case ID (e.g., "hero")
  name: string;                          // Human-readable label
  description: string;                   // What the section contains
  contentNotes: string;                  // Specific copy direction
  sectionType: SectionType;              // Default: "custom"
  layoutHint: LayoutHint;                // Default: "stacked"
  itemCount?: number;                    // Count of repeating items
  mediaType: MediaType;                  // Default: "none"
  interactiveElement: InteractiveElement; // Default: "none"
  motionIntent: MotionIntent;            // Default: "none"
}
```

### Section Type Enum (22 values)

| Value | Description |
|-------|-------------|
| `hero` | Full-viewport hero/landing section |
| `features` | Feature grid/list |
| `testimonials` | Customer reviews/quotes |
| `pricing` | Pricing plans/tiers |
| `faq` | Frequently asked questions |
| `stats` | Key statistics/numbers |
| `team` | Team member profiles |
| `gallery` | Image gallery |
| `form` | Contact/signup form |
| `timeline` | Chronological timeline |
| `comparison` | Feature comparison table |
| `cta-banner` | Call-to-action banner |
| `case-study` | Case study showcase |
| `process-steps` | Step-by-step process |
| `logo-cloud` | Partner/client logo grid |
| `video-showcase` | Video embed section |
| `map-contact` | Map + contact info |
| `blog-grid` | Blog post grid |
| `portfolio-grid` | Portfolio item grid |
| `before-after` | Before/after comparison |
| `scrollytelling` | Scroll-driven narrative |
| `mega-menu-preview` | Mega menu preview |
| `calculator-tool` | Interactive calculator |
| `custom` | Freeform section |

### Layout Hint Enum (14 values)

`bento-grid`, `split-screen`, `card-mosaic`, `asymmetric`, `centered-minimal`, `horizontal-scroll`, `diagonal`, `full-bleed`, `stacked`, `sticky-stack`, `overlapping-layers`, `cinematic-fullscreen`, `alternating-sides`, `custom`

### Media Type Enum (8 values)

`hero-image`, `inline-photos`, `icons-only`, `background-pattern`, `illustration`, `video-embed`, `gradient-mesh`, `none`

### Interactive Element Enum (11 values)

`accordion`, `tabs`, `carousel`, `counter-animation`, `toggle-switch`, `hover-reveal`, `progressive-disclosure`, `before-after-slider`, `tilt-card`, `scroll-scrub`, `none`

### Motion Intent Enum (10 values)

`entrance-reveal`, `staggered-cards`, `parallax-bg`, `counter-animation`, `kinetic-type`, `hover-showcase`, `scroll-reveal`, `text-reveal`, `zoom-entrance`, `none`

---

## Shared Components

```typescript
interface BlueprintSharedComponents {
  navLinks: { label: string; href: string }[]; // Min 1 entry
  footerTagline: string;                        // Short tagline for footer
}
```

---

## Content Strategy

```typescript
interface BlueprintContentStrategy {
  tone: string;                  // Writing tone (e.g., "professional yet approachable")
  targetAudience: string;        // Who the site serves
  primaryCTA: string;            // Main call-to-action text and goal
  brandVoice: string;            // 2-3 word brand personality
  valuePropositions: string[];   // 3-5 concrete value props (default: [])
  differentiators: string[];     // What makes the business unique (default: [])
  keyStats: { label: string; value: string }[]; // Impressive numbers (default: [])
  brandStory: string;            // 2-3 sentence narrative (default: "")
}
```

---

## Site Facts

Populated after blueprint generation via web research or the Discovery flow. All fields optional with empty-string/empty-array defaults.

```typescript
interface SiteFacts {
  businessName: string;
  address: string;
  phone: string;
  email: string;
  hours: string;          // e.g., "Mon: 9am-5pm, Tue: 9am-5pm"
  services: string[];     // Key services/offerings
  tagline: string;
  socialMedia: string;    // Comma-separated "Platform: URL" pairs
  category: string;       // e.g., "dentist"
  googleMapsUri: string;
  location: string;       // "lat,lng" for map embeds
  additionalInfo: string;
}
```

**Priority:** Discovery data (user-provided) wins over research data (web-scraped) for non-empty fields.

---

## 4-Step Generation Pipeline

### Step 1: Generate Blueprint

**Route:** `POST /api/blueprint/generate`

```
Input: user prompt + provider/model config
Output: Blueprint JSON (structured output or text + repair)
```

- Uses `generateText()` with `Output.object({ schema: blueprintSchema })` for providers supporting structured output
- Falls back to raw text mode with `repairAndParseJson()` for others
- Post-processing: sanitizes font names, populates `siteFacts` from discovery data if available
- If `needsResearch: true`, triggers background web research via `after()` (non-blocking)
- Saves to DB, sets generation state phase to `"awaiting-approval"`
- User reviews and can edit the blueprint before proceeding

### Step 2: Generate Components

**Route:** `POST /api/blueprint/components`

```
Input: Blueprint JSON + provider/model config
Output: header.html + footer.html (via writeFiles tool call)
```

- Uses `streamText()` with tools: `searchIcons`, `searchImages`, `writeFiles`
- AI receives: design system, navigation spec, siteFacts, header/footer requirements
- Must call `writeFiles` with exactly `header.html` and `footer.html`
- Fallback: extracts `<header>` and `<footer>` from raw text if tools not invoked
- Saves to `GenerationState.componentHtml`, phase `"components-complete"`

### Step 3: Generate Assets

**Route:** `POST /api/blueprint/assets`

```
Input: Blueprint JSON + component HTML + provider/model config
Output: styles.css + scripts.js (via writeFiles tool call)
```

- Uses `streamText()` with tools
- AI receives: design system, actual generated header/footer HTML, collected interactive elements and motion intents from all pages
- `styles.css` must contain: `:root` variables, base styles, utility classes, animation keyframes, scroll reveal, component styles
- `scripts.js` must contain: mobile menu toggle, scroll reveal (IntersectionObserver), smooth scroll, conditional accordion/tabs/counter
- Saves to `GenerationState.sharedStyles`, phase `"assets-complete"`

**Deterministic alternative:** `generateSharedStyles()` in `src/lib/blueprint/generate-shared-styles.ts` can produce basic `styles.css` and `<head>` tags without an AI call. Used as a pre-seed or fallback.

### Step 4: Generate Pages

**Route:** `POST /api/blueprint/pages`

```
Input: Blueprint JSON + shared styles + provider/model config
Output: Per-page HTML files (parallel, max 5 concurrent)
```

- Each page generated independently with restricted tool subset
- AI receives: design system, shared `<head>` tags verbatim, page spec with all section metadata, content strategy, siteFacts, sibling page context
- Header/footer injected as `<!-- @component:header -->` / `<!-- @component:footer -->` placeholders (multi-page) or inline (single-page)
- Continuation: up to 2 retries per page with continuation prompts
- Post-processing per page: `validateBlocks()` (auto-assign `data-block` attributes)
- After all pages: `extractComponents()` detects duplicate nav/footer, extracts to `_components/`
- Deduplication passes: shared head tags, duplicate CDN scripts, common CSS rules, common inline scripts
- Phase set to `"generating-pages"`, record deleted on completion

---

## Multi-Page Detection

`detectMultiPageIntent()` in `src/lib/blueprint/detect-multi-page.ts` activates blueprint mode automatically when:

- Explicit page count >= 3 (e.g., "5 pages")
- Keywords: "multi-page", "full website", "complete site", "separate pages"
- 3+ distinct page names from a list of 35 common names (home, about, contact, menu, services, etc.)
- Comma/and-separated page name sequence of 3+

---

## JSON Repair

`repairAndParseJson()` in `src/lib/blueprint/repair-json.ts` handles malformed AI output:

1. Strips `<think>...</think>` reasoning blocks (DeepSeek, etc.)
2. Runs `jsonrepair()` (handles: missing braces, trailing commas, unquoted keys, single quotes, truncated output, markdown fences)
3. Validates against Zod schema with `safeParse()`
4. Retries with original text if cleaned text fails
5. Returns `null` on complete failure

---

## Generation State Tracking

The `GenerationState` DB model tracks pipeline progress for resume support:

| Phase | Set By | Stored Data |
|-------|--------|-------------|
| `"awaiting-approval"` | Generate route | Blueprint saved |
| `"components-complete"` | Components route | `componentHtml: { headerHtml, footerHtml }` |
| `"assets-complete"` | Assets route | `sharedStyles: { headTags, stylesCss, scriptsJs }` |
| `"generating-pages"` | Pages route | `pageStatuses`, `completedPages` |
| *(deleted)* | Pages route | On successful completion |

---

## SSE Stream Events

| Route | Event | Values |
|-------|-------|--------|
| Components | `component-status` | `generating`, `complete`, `error` |
| Assets | `assets-status` | `generating`, `complete`, `error` |
| Pages | `page-status` | `pending`, `generating`, `complete`, `error` |
| Pages | `pipeline-status` | `generating`, `complete`, `error` |
| All | `tool-activity` | Tool label (e.g., "Adding images", "Writing page") |
| Pages | `code-delta` | Live HTML streaming |
| Pages | `components-extracted` | Component extraction results |
| Pages | `post-processed` | Deduplication results |

---

## Example Blueprint JSON

```json
{
  "siteName": "Sunrise Bakery",
  "siteDescription": "Artisan bakery specializing in sourdough and custom wedding cakes",
  "pages": [
    {
      "filename": "index.html",
      "title": "Sunrise Bakery — Fresh Artisan Bread Daily",
      "description": "Handcrafted sourdough, pastries, and custom cakes in Springfield",
      "purpose": "Main landing page showcasing products and driving contact",
      "sections": [
        {
          "id": "hero",
          "name": "Hero",
          "description": "Full-viewport hero with bakery imagery and headline",
          "contentNotes": "Headline: 'Baked Fresh Every Morning'. Warm, inviting tone.",
          "sectionType": "hero",
          "layoutHint": "cinematic-fullscreen",
          "mediaType": "hero-image",
          "interactiveElement": "none",
          "motionIntent": "entrance-reveal"
        },
        {
          "id": "products",
          "name": "Our Products",
          "description": "Grid of product categories with images",
          "contentNotes": "Sourdough, Pastries, Wedding Cakes, Seasonal Specials",
          "sectionType": "features",
          "layoutHint": "bento-grid",
          "itemCount": 4,
          "mediaType": "inline-photos",
          "interactiveElement": "hover-reveal",
          "motionIntent": "staggered-cards"
        },
        {
          "id": "faq",
          "name": "FAQ",
          "description": "Common questions about ordering and delivery",
          "contentNotes": "Custom cake ordering, delivery radius, allergen info",
          "sectionType": "faq",
          "layoutHint": "stacked",
          "itemCount": 5,
          "mediaType": "none",
          "interactiveElement": "accordion",
          "motionIntent": "none"
        }
      ]
    }
  ],
  "designSystem": {
    "primaryColor": "#D97706",
    "secondaryColor": "#92400E",
    "accentColor": "#F59E0B",
    "backgroundColor": "#FFFBEB",
    "surfaceColor": "#FEF3C7",
    "textColor": "#1C1917",
    "textMutedColor": "#78716C",
    "headingFont": "Playfair Display",
    "bodyFont": "Source Sans Pro",
    "borderRadius": "12px",
    "mood": "warm rustic charm",
    "surfaceTreatment": "textured"
  },
  "sharedComponents": {
    "navLinks": [
      { "label": "Home", "href": "index.html" },
      { "label": "Menu", "href": "menu.html" },
      { "label": "Contact", "href": "contact.html" }
    ],
    "footerTagline": "Fresh from our oven to your table since 2010"
  },
  "contentStrategy": {
    "tone": "warm and inviting",
    "targetAudience": "local families and food enthusiasts",
    "primaryCTA": "Order a Custom Cake",
    "brandVoice": "artisan warmth",
    "valuePropositions": [
      "Handcrafted daily with organic flour",
      "Custom wedding cakes designed to your vision",
      "Free local delivery on orders over $30"
    ],
    "differentiators": [
      "Only sourdough bakery in Springfield",
      "15 years of wedding cake experience"
    ],
    "keyStats": [
      { "label": "Loaves Baked Daily", "value": "200+" },
      { "label": "Wedding Cakes/Year", "value": "150+" }
    ],
    "brandStory": "Started in a home kitchen in 2010, Sunrise Bakery has grown into Springfield's beloved artisan bakery. Every loaf is hand-shaped and slow-fermented for 24 hours."
  },
  "needsResearch": true
}
```

---

*Last updated: February 18, 2026*
