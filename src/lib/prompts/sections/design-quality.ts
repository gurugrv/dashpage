// Shared design quality guidelines used by both single-page and blueprint generation.
// Single source of truth — imported by base-rules.ts AND blueprint prompt files.

export const DESIGN_QUALITY_SECTION = `<color_system>
Generate a UNIQUE color palette for each project — fresh colors every time.

Method:
1. Choose a BASE HUE (0-360) inspired by the subject — avoid the obvious choice.
2. Select a HARMONY RULE (complementary, split-complementary, triadic, or analogous).
3. Express ALL colors in HSL — hsl(H, S%, L%). Easier to reason about than hex.
4. Pick a PALETTE STRATEGY, then derive 7 semantic colors within its ranges:

LIGHT (default — airy, professional):
  bg L 94-98% S 2-8% | text L 5-15% | surface L 96-99% | textMuted L 35-50%
  primary S 50-85% L 40-55% | secondary S 30-60% L 40-55% | accent S 60-90% L 45-60%

MUTED (earthy, artisanal, warm):
  bg L 90-95% S 5-15% | text L 8-18% | surface L 93-97% S 4-12% | textMuted L 32-48%
  primary S 30-55% L 35-50% | secondary S 20-45% L 38-52% | accent S 45-70% L 40-55%

BOLD (vibrant, energetic, playful):
  bg L 94-98% S 3-10% | text L 5-15% | surface L 96-99% | textMuted L 30-45%
  primary S 70-95% L 42-58% | secondary S 55-80% L 40-55% | accent S 75-95% L 45-60%

DARK (luxury, tech — ONLY when user explicitly requests dark theme):
  bg L 8-15% S 5-20% | text L 85-95% | surface L 12-20% S 4-15% | textMuted L 55-70%
  primary S 50-85% L 55-70% | secondary S 30-60% L 50-65% | accent S 65-95% L 55-70%

HIGH-CONTRAST (accessibility-first, editorial):
  bg L 97-100% S 0-3% | text L 0-10% | surface L 95-98% | textMuted L 25-40%
  primary S 60-90% L 35-50% | secondary S 40-70% L 35-50% | accent S 70-95% L 40-55%

Hard constraints (apply to ALL strategies):
- WCAG AA: text on bg/surface >= 4.5:1, large text >= 3:1
- primary and accent must differ in hue OR saturation (not just lightness)
- Generate custom HSL values — default Tailwind colors (indigo-600, gray-100) look generic
- Purple/blue gradients are the #1 AI-generated design tell — choose unexpected color stories

Apply colors to :root CSS custom properties (all in HSL):
--color-primary, --color-secondary, --color-accent, --color-bg, --color-surface, --color-text, --color-text-muted

Gradient rules: prefer solid colors; use gradients only to reinforce mood. Analogous colors in the same temperature family. Maximum 2 stops.

Push into the design seed's hue zone and find unexpected color stories:
- A bakery doesn't need warm browns — try dusty sage with terracotta accents
- A law firm doesn't need navy — try warm charcoal with aged brass or deep plum with silver
- A spa doesn't need pink + gold — try forest green with copper or warm stone with sage
- A SaaS product doesn't need flat blue — try dark mode with a single vivid accent
- A dental clinic doesn't need minty green — try warm coral with cream or soft gold with charcoal
The best palettes feel inevitable in hindsight but surprising at first glance.
</color_system>

<typography>
Choose 2 primary font families (heading + body). Add a monospace font when the page contains code snippets, terminal output, or technical content. Load all via Google Fonts CDN.

Pick a HEADING font for personality, pair with a legible BODY font. Mix categories — serif + sans, geometric + humanist, display + workhorse.

VARIETY IS MANDATORY: Do NOT default to Inter, DM Sans, Poppins, or Montserrat. Treat these as last-resort options. Use any real Google Font from fonts.google.com. Prefer distinctive, lesser-used pairings over common defaults — explore the full catalog.

Rules:
- Clear size hierarchy: text-sm -> text-base -> text-lg -> text-xl -> text-2xl -> text-4xl+
- Body line-height: 1.5-1.7. Minimum 16px for body content (readability baseline).
- Use font weight variation meaningfully (300/400/500/600/700)
- Headings must feel distinctly different from body text
- Use font-mono class for code/pre elements when a monospace font is loaded
</typography>

<visual_polish>
Every page MUST include these details — they separate professional from amateur:

Transitions & Hover:
- All interactive elements need hover states (opacity, scale, color shift, or shadow change)
- Use smooth transitions: duration-200 ease-in-out (or duration-300). Prefer specific transition utilities (transition-colors, transition-shadow, transition-transform) or combine them. Use transition-all only when multiple properties change together.
- Buttons: subtle scale (hover:scale-105) or shadow lift on hover
- Links: underline animation or color transition
- Cards: shadow elevation on hover (hover:shadow-lg)

Shadows & Depth:
- Use layered shadows for cards and elevated elements (not flat)
- Subtle shadows create hierarchy — use them intentionally
- Shadow color should complement the design (not pure black)

Spacing & Layout:
- Generous whitespace between sections (py-16 md:py-24 minimum)
- Group related elements tightly (gap-2 to gap-4), separate groups widely
- Container max-width for readability (max-w-7xl mx-auto px-4)
- Consistent alignment within sections

States:
- Focus-visible states on interactive elements (for accessibility)
- Active/pressed states on buttons
- If relevant: loading indicators, empty states, disabled states

Micro-details:
- Rounded corners should be consistent (use --radius token)
- Icon sizing: 16px (sm), 20px (md), 24px (lg) — keep consistent
- Badge/pill elements for tags and status indicators
- Dividers or spacing (not both) to separate content sections
</visual_polish>

<motion_design>
Bring the page to life with purposeful animation:

Entrance animations:
- Fade-up and slide-in for content sections using Alpine.js x-intersect directive (see interactivity patterns)
- Staggered reveals for card grids and lists (increment delay by 100-150ms per item)
- Smooth scroll behavior: html { scroll-behavior: smooth }

Scroll effects:
- Parallax-lite: subtle CSS transform: translateY() on scroll for hero backgrounds or decorative elements
- Hero section kinetic typography or animated gradient backgrounds (CSS @keyframes on background-position)
- Progress indicators or scroll-triggered counters using Alpine.js x-intersect + counter pattern

Micro-interactions:
- Button press feedback: active:scale-95 with transition
- Toggle switches, expanding cards, accordion animations
- Hover reveals: content that slides or fades in on card hover
- Form focus effects: border color transitions, floating labels

Performance rules:
- ONLY animate transform and opacity (composited properties) for 60fps
- Use will-change sparingly — only on elements actively animating
- ALWAYS respect prefers-reduced-motion: wrap animations in @media (prefers-reduced-motion: no-preference)
- Keep durations 150-400ms for UI, up to 800ms for decorative entrance animations
</motion_design>

<creative_framework>
Each generation should feel like a DIFFERENT designer built it. Vary your aesthetic instincts.

Aesthetic vocabulary — draw from these for inspiration:
brutalist, neobrutalist, organic/biomorphic, editorial, retro-futuristic, maximalist, art-deco, Swiss/international, Memphis, mid-century modern, cyberpunk, Japanese minimalist, Scandinavian, industrial, whimsical/playful

Match intensity to the request:
IF vague ("make me a landing page", "build a portfolio"):
-> BE BOLD: Strong layout archetype, distinctive palette, unexpected typography. Make creative decisions confidently.

IF brand guidelines or specific design direction provided:
-> BE RESPECTFUL: Work within constraints. Polish through execution, not rebellion.

IF enterprise/professional tools (dashboards, admin panels, SaaS):
-> BE CONSERVATIVE: Usability first. Creativity through craft and micro-details, not wild layout choices.

IF personal/creative projects (portfolios, art sites, event pages):
-> BE EXPERIMENTAL: Push the layout archetype further. Unconventional typography. Take calculated risks.

The layout archetype in your creative direction is your structural foundation — build on it, don't ignore it for a generic grid.
</creative_framework>

<content_rules>
Generate realistic, contextual content for every text element — specificity creates believability:

- Headings: Specific and compelling — "Handcrafted Sourdough, Delivered Fresh" not "Welcome to Our Bakery"
- Body text: Real descriptions with specific details and benefits
- Names: Realistic names for people, companies, and products
- Numbers: Believable statistics ("4.9 stars from 2,847 reviews" not "XX reviews")
- Testimonials: Distinct voices with specific praise, not generic "Great service!"
- Navigation: Contextually appropriate menu items
- CTAs: Action-specific ("Start Your Free Trial", "View the Menu", "Book a Call") not generic "Learn More"
</content_rules>

<anti_patterns>
NEVER do these — they are the hallmarks of generic AI-generated sites:

Structure:
- NEVER: hero section + 3 equal-width cards + CTA banner + footer. This is THE most common AI layout. Break it.
- NEVER: all sections the same height or vertical padding
- NEVER: everything centered — vary alignment across sections (left-aligned hero, right-aligned stats, centered CTA)
- NEVER: predictable section ordering — surprise the user with unexpected content flow

Typography:
- NEVER default to: Inter, Roboto, Open Sans, Poppins, DM Sans, Montserrat, Lato, Source Sans Pro
- NEVER use the same font weight throughout — create contrast with weight variation
- NEVER make all headings the same size — use dramatic scale differences

Color:
- NEVER: purple/indigo/blue gradient as primary accent (the #1 AI design tell)
- NEVER: evenly-distributed color palette — one dominant color with sharp accents
- NEVER: gray-100 backgrounds with indigo-600 buttons (Tailwind defaults)

Elements:
- NEVER: emoji as icons — always use the searchIcons tool for real SVGs
- NEVER: placeholder images when searchImages is available
- NEVER: "Lorem ipsum" or "Learn More" as button text — be specific
- NEVER: small decorative icons on service/feature cards (the icon-above-title-above-description card pattern). This is one of the most generic AI layouts. Instead use: numbered lists, bold typography, colored borders/accents, background images, asymmetric layouts, or creative typography to differentiate cards.
</anti_patterns>

<layout_techniques>
Use these CSS patterns to create visual interest. Mix and match across sections:

Bento grid:
  display:grid; grid-template-columns:repeat(4,1fr); gap:1.5rem;
  Feature tiles: grid-column:span 2; grid-row:span 2;

Diagonal dividers:
  clip-path:polygon(0 0, 100% 0, 100% 85%, 0 100%);
  Next section: negative margin-top to overlap the clipped edge.

Overlapping depth:
  position:relative; z-index layers; negative margins (-mt-16, -ml-8);
  Child elements breaking parent bounds for dimensional feel.

Glassmorphism:
  backdrop-filter:blur(16px); background:rgba(255,255,255,0.08);
  border:1px solid rgba(255,255,255,0.15); Rich bg behind.

Horizontal scroll:
  overflow-x:auto; scroll-snap-type:x mandatory; display:flex;
  Children: flex:0 0 clamp(280px,80vw,600px); scroll-snap-align:start;

Sticky stacking:
  Each section: position:sticky; top:0; z-index incrementing;
  Opaque backgrounds. Box-shadow on leading edge for depth.

Asymmetric splits:
  grid-template-columns: 2fr 3fr (or 3fr 2fr). Alternate per section.
  Not everything needs to be 50/50 or full-width.
</layout_techniques>`;

// Condensed version for blueprint page/component generation where the design system
// (colors, fonts, radius) is already defined. Keeps visual quality rules, drops
// color generation and font selection instructions.
export const BLUEPRINT_DESIGN_QUALITY_SECTION = `<visual_polish>
Every page MUST include these details — they separate professional from amateur:

Transitions & Hover:
- All interactive elements need hover states (opacity, scale, color shift, or shadow change)
- Use smooth transitions: duration-200 ease-in-out (or duration-300). Prefer specific transition utilities (transition-colors, transition-shadow, transition-transform) or combine them. Use transition-all only when multiple properties change together.
- Buttons: subtle scale (hover:scale-105) or shadow lift on hover
- Links: underline animation or color transition
- Cards: shadow elevation on hover (hover:shadow-lg)

Shadows & Depth:
- Use layered shadows for cards and elevated elements (not flat)
- Subtle shadows create hierarchy — use them intentionally
- Shadow color should complement the design (not pure black)

Spacing & Layout:
- Generous whitespace between sections (py-16 md:py-24 minimum)
- Group related elements tightly (gap-2 to gap-4), separate groups widely
- Container max-width for readability (max-w-7xl mx-auto px-4)
- Consistent alignment within sections

States:
- Focus-visible states on interactive elements (for accessibility)
- Active/pressed states on buttons
- If relevant: loading indicators, empty states, disabled states

Micro-details:
- Rounded corners should be consistent (use --radius token)
- Icon sizing: 16px (sm), 20px (md), 24px (lg) — keep consistent
- Badge/pill elements for tags and status indicators
- Dividers or spacing (not both) to separate content sections
</visual_polish>

<motion_design>
Bring the page to life with purposeful animation:

Entrance animations:
- Fade-up and slide-in for content sections using Alpine.js x-intersect directive (see interactivity patterns)
- Staggered reveals for card grids and lists (increment delay by 100-150ms per item)
- Smooth scroll behavior: html { scroll-behavior: smooth }

Scroll effects:
- Parallax-lite: subtle CSS transform: translateY() on scroll for hero backgrounds or decorative elements
- Hero section kinetic typography or animated gradient backgrounds (CSS @keyframes on background-position)
- Progress indicators or scroll-triggered counters using Alpine.js x-intersect + counter pattern

Micro-interactions:
- Button press feedback: active:scale-95 with transition
- Toggle switches, expanding cards, accordion animations
- Hover reveals: content that slides or fades in on card hover
- Form focus effects: border color transitions, floating labels

Performance rules:
- ONLY animate transform and opacity (composited properties) for 60fps
- Use will-change sparingly — only on elements actively animating
- ALWAYS respect prefers-reduced-motion: wrap animations in @media (prefers-reduced-motion: no-preference)
- Keep durations 150-400ms for UI, up to 800ms for decorative entrance animations
</motion_design>

<creative_framework>
Each generation should feel like a DIFFERENT designer built it. Vary your aesthetic instincts.

Aesthetic vocabulary — draw from these for inspiration:
brutalist, neobrutalist, organic/biomorphic, editorial, retro-futuristic, maximalist, art-deco, Swiss/international, Memphis, mid-century modern, cyberpunk, Japanese minimalist, Scandinavian, industrial, whimsical/playful

Match intensity to the request:
IF vague ("make me a landing page", "build a portfolio"):
-> BE BOLD: Strong layout archetype, distinctive palette, unexpected typography. Make creative decisions confidently.

IF brand guidelines or specific design direction provided:
-> BE RESPECTFUL: Work within constraints. Polish through execution, not rebellion.

IF enterprise/professional tools (dashboards, admin panels, SaaS):
-> BE CONSERVATIVE: Usability first. Creativity through craft and micro-details, not wild layout choices.

IF personal/creative projects (portfolios, art sites, event pages):
-> BE EXPERIMENTAL: Push the layout archetype further. Unconventional typography. Take calculated risks.

Choose a layout archetype from layout_archetypes that fits this page's content. The archetype is your structural foundation — build on it, don't ignore it for a generic grid.

Surface treatment — apply the design system's surfaceTreatment across section backgrounds:
- textured: subtle noise, grain, or paper textures via CSS (craft/artisanal)
- layered-gradients: multi-stop CSS gradients, mesh gradients using design tokens (bold/modern)
- glassmorphism: backdrop-blur with translucent panels over rich backgrounds (premium/tech)
- clean: flat, minimal surfaces — solid colors only (minimal/corporate)
- organic: blob shapes, curved dividers, wavy section separators via SVG/clip-path (playful/natural)
- neubrutalist: thick 2-4px borders, hard offset shadows (4-8px solid, no blur), high-contrast unexpected color combos (creative/bold)
- claymorphism: large soft shadows (blur 16px+, offset 8-12px), rounded puffy shapes, bright saturated colors (friendly/wellness)
</creative_framework>

<layout_techniques>
Use these CSS patterns to create visual interest. Mix and match across sections:

Bento grid:
  display:grid; grid-template-columns:repeat(4,1fr); gap:1.5rem;
  Feature tiles: grid-column:span 2; grid-row:span 2;

Diagonal dividers:
  clip-path:polygon(0 0, 100% 0, 100% 85%, 0 100%);
  Next section: negative margin-top to overlap the clipped edge.

Overlapping depth:
  position:relative; z-index layers; negative margins (-mt-16, -ml-8);
  Child elements breaking parent bounds for dimensional feel.

Glassmorphism:
  backdrop-filter:blur(16px); background:rgba(255,255,255,0.08);
  border:1px solid rgba(255,255,255,0.15); Rich bg behind.

Horizontal scroll:
  overflow-x:auto; scroll-snap-type:x mandatory; display:flex;
  Children: flex:0 0 clamp(280px,80vw,600px); scroll-snap-align:start;

Sticky stacking:
  Each section: position:sticky; top:0; z-index incrementing;
  Opaque backgrounds. Box-shadow on leading edge for depth.

Asymmetric splits:
  grid-template-columns: 2fr 3fr (or 3fr 2fr). Alternate per section.
  Not everything needs to be 50/50 or full-width.
</layout_techniques>

<anti_patterns>
NEVER do these — they are the hallmarks of generic AI-generated sites:

Structure:
- NEVER: hero section + 3 equal-width cards + CTA banner + footer. This is THE most common AI layout. Break it.
- NEVER: all sections the same height or vertical padding
- NEVER: everything centered — vary alignment across sections (left-aligned hero, right-aligned stats, centered CTA)
- NEVER: predictable section ordering — surprise the user with unexpected content flow

Typography:
- NEVER default to: Inter, Roboto, Open Sans, Poppins, DM Sans, Montserrat, Lato, Source Sans Pro
- NEVER use the same font weight throughout — create contrast with weight variation
- NEVER make all headings the same size — use dramatic scale differences

Color:
- NEVER: purple/indigo/blue gradient as primary accent (the #1 AI design tell)
- NEVER: evenly-distributed color palette — one dominant color with sharp accents
- NEVER: gray-100 backgrounds with indigo-600 buttons (Tailwind defaults)

Elements:
- NEVER: emoji as icons — always use the searchIcons tool for real SVGs
- NEVER: placeholder images when searchImages is available
- NEVER: "Lorem ipsum" or "Learn More" as button text — be specific
- NEVER: small decorative icons on service/feature cards (the icon-above-title-above-description card pattern). This is one of the most generic AI layouts. Instead use: numbered lists, bold typography, colored borders/accents, background images, asymmetric layouts, or creative typography to differentiate cards.
</anti_patterns>

<content_rules>
Generate realistic, contextual content for every text element — specificity creates believability:

- Headings: Specific and compelling — "Handcrafted Sourdough, Delivered Fresh" not "Welcome to Our Bakery"
- Body text: Real descriptions with specific details and benefits
- Names: Realistic names for people, companies, and products
- Numbers: Believable statistics ("4.9 stars from 2,847 reviews" not "XX reviews")
- Testimonials: Distinct voices with specific praise, not generic "Great service!"
- Navigation: Contextually appropriate menu items
- CTAs: Action-specific ("Start Your Free Trial", "View the Menu", "Book a Call") not generic "Learn More"
</content_rules>`;

export const EDIT_DESIGN_REMINDER = `<design_reminders>
Maintain visual consistency with the existing design system:
- Keep all :root CSS custom properties. Use design tokens, never hardcode colors.
- Interactive elements need hover states + transitions (duration-200/300).
- Maintain spacing rhythm (py-16 md:py-24 between sections).
- Focus-visible states on all interactive elements.
- Consistent border-radius via --radius token.
- Preserve the existing color story — use the established palette, not purple/blue gradients or emoji icons.
- Keep all design system variables and font imports intact.
</design_reminders>`;
