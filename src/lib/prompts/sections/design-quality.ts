// Shared design quality guidelines used by both single-page and blueprint generation.
// Single source of truth — imported by base-rules.ts AND blueprint prompt files.
// Font names in the prompt below must stay in sync with src/lib/fonts.ts FONT_CATEGORIES.

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

Anti-convergence: You tend to gravitate toward the same few palettes (teal/coral, navy/gold, sage/cream). Actively resist familiar combinations. If your first instinct feels "safe" or "seen before", push further into the design seed's hue zone.
</color_system>

<typography>
Choose 2 primary font families (heading + body). Add a monospace font when the page contains code snippets, terminal output, or technical content. Load all via Google Fonts CDN.

Pick a HEADING font for personality, pair with a legible BODY font. Mix categories — serif + sans, geometric + humanist, display + workhorse.

VARIETY IS MANDATORY: Do NOT default to Inter, DM Sans, Poppins, or Montserrat. Treat these as last-resort options. Start from less common pairings — Sora + Literata, Epilogue + Source Serif 4, Bricolage Grotesque + Karla, Outfit + Spectral — then branch out from there.

Approved Google Fonts (ONLY use fonts from this list):
Sans-serif (body/UI): Inter, DM Sans, Work Sans, Lato, Open Sans, Source Sans 3, Nunito Sans, Manrope, Barlow, Karla, IBM Plex Sans, Public Sans, Figtree, Albert Sans, Mulish, Sora, Hanken Grotesk
Geometric sans (headings): Montserrat, Poppins, Raleway, Space Grotesk, Outfit, Syne, Libre Franklin, Archivo, Jost, Exo 2, Quicksand, Urbanist, Red Hat Display, Epilogue
Serif (editorial): Playfair Display, Lora, Merriweather, EB Garamond, Cormorant, Spectral, DM Serif Display, Literata, Source Serif 4, Alegreya
Slab serif: Roboto Slab, Arvo, Aleo, Bitter, Zilla Slab
Display (hero only): Oswald, Anton, Bebas Neue, Abril Fatface, Bricolage Grotesque
Monospace (code/technical): Space Mono, JetBrains Mono, Fira Code, IBM Plex Mono, Azeret Mono

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

<creative_framework>
Match your creative approach to the request:

IF the request is vague ("make me a landing page", "build a portfolio"):
-> BE BOLD: Choose distinctive colors, interesting layouts, strong typography. Make creative decisions confidently rather than playing safe.

IF the user provides brand guidelines or specific design direction:
-> BE RESPECTFUL: Work within their constraints. Add polish through excellent execution, not creative rebellion.

IF building enterprise/professional tools (dashboards, admin panels, SaaS):
-> BE CONSERVATIVE: Prioritize usability and convention. Clean, functional, well-organized. Creativity through craft, not bold choices.

IF building personal/creative projects (portfolios, art sites, event pages):
-> BE EXPERIMENTAL: Unconventional layouts, creative typography, unique visual treatments. Take calculated risks.

Final rule: Ship something interesting rather than boring — but never ugly or confusing.
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
