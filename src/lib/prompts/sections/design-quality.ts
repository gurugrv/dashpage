// Shared design quality guidelines used by both single-page and blueprint generation.
// Single source of truth — imported by base-rules.ts AND blueprint prompt files.
// Font names in the prompt below must stay in sync with src/lib/fonts.ts FONT_CATEGORIES.

export const DESIGN_QUALITY_SECTION = `<color_system>
Generate a UNIQUE color palette for each project. Never reuse the same colors across projects.

Method:
1. Choose a BASE HUE (0-360) inspired by the subject — but avoid the obvious choice.
   A bakery doesn't have to be orange. A law firm doesn't have to be navy. Surprise yourself.
2. Select a HARMONY RULE (complementary, split-complementary, triadic, or analogous)
3. Express ALL colors in HSL format — hsl(H, S%, L%). HSL is easier to reason about and tweak
   (shift hue by 10°, bump saturation, adjust lightness) without recalculating hex codes.
4. Derive 7 semantic color PAIRS (each surface gets a foreground). HSL lightness ranges are mandatory:
   - background (L 94-98%): Light tint of the base hue. NOT pure white — add a subtle warm/cool cast.
   - text (L 5-15%): Very dark shade tinted toward the base hue. NOT pure black.
   - surface (L 96-99%): Slightly lighter/different from background for cards and elevated elements.
   - surfaceFg (L 5-15%): Text color on surface — must contrast >= 4.5:1 against surface.
   - primary (S 50-85%, L 40-55%): Dominant brand color — saturated, mid-lightness.
   - primaryFg (L 95-100%): Text on primary backgrounds — almost always near-white.
   - secondary (S 30-60%, L 40-55%): Harmonically related to primary — slightly muted or shifted.
   - secondaryFg (L 95-100%): Text on secondary backgrounds.
   - accent (S 60-90%, L 45-60%): High-contrast pop for CTAs/highlights — must stand out from primary.
   - accentFg (L 95-100%): Text on accent backgrounds.
   - textMuted (L 35-50%): Mid-gray tinted toward the base hue for secondary text.

   DEFAULT IS LIGHT THEME. Background must be light (L >= 94%). Only use dark backgrounds if user explicitly requests dark mode.

Constraints:
- WCAG AA: Every foreground/surface pair must meet >= 4.5:1 contrast ratio, large text >= 3:1
- primary and accent must differ in hue OR saturation (not just lightness)
- background color cast should be subtle — just enough to avoid sterile white (2-8% saturation)
- NEVER use default Tailwind colors (indigo-600, gray-100, etc.) — generate custom HSL values
- NEVER default to purple/blue gradients — this is the #1 AI-generated design tell

Apply colors to :root CSS custom properties (all in HSL):
--color-primary, --color-primary-fg, --color-secondary, --color-secondary-fg,
--color-accent, --color-accent-fg, --color-bg, --color-surface, --color-surface-fg,
--color-text, --color-text-muted

Gradient rules:
- DEFAULT: Use solid colors. Avoid gradients unless they serve a purpose.
- If using gradients: ONLY analogous colors (blue->teal, purple->pink, orange->red)
- NEVER mix opposing temperatures (pink->green, orange->blue)
- Maximum 2 color stops. No rainbow gradients.
</color_system>

<typography>
Use EXACTLY 2 font families maximum. Load via Google Fonts CDN.

Step 1 — Read the brief's tone ("minimal," "bold," "editorial," "playful," etc.) to narrow the typographic universe.

Step 2 — Pick the HEADING font first. This carries the personality of the design.
Choose from the approved list below based on the mood. Be distinctive — don't default to safe choices.

Step 3 — Pair with a complementary BODY font. The body font must be highly legible at 14-18px and contrast with the heading font without clashing.

Pairing principles:
- Contrast, not conflict — mix geometric + humanist, serif + sans, or display + workhorse. Never two similar fonts.
- Shared x-height — so they feel cohesive at the same size
- Weight range — each font needs at least 3 weights (300/400/700) for proper hierarchy

Approved Google Fonts (ONLY use fonts from this list — never guess font names):

Sans-serif (body/UI): Inter, DM Sans, Work Sans, Lato, Open Sans, Source Sans 3, Nunito Sans, Manrope, Barlow, Karla, IBM Plex Sans, Public Sans, Figtree, Albert Sans, Mulish, Sora, Hanken Grotesk
Geometric sans (headings): Montserrat, Poppins, Raleway, Space Grotesk, Outfit, Syne, Libre Franklin, Archivo, Jost, Exo 2, Quicksand, Urbanist, Red Hat Display, Epilogue
Serif (editorial): Playfair Display, Lora, Merriweather, EB Garamond, Cormorant, Spectral, DM Serif Display, Literata, Source Serif 4, Alegreya
Slab serif: Roboto Slab, Arvo, Aleo, Bitter, Zilla Slab
Display (hero only): Oswald, Anton, Bebas Neue, Abril Fatface, Bricolage Grotesque
Monospace: Space Mono, JetBrains Mono, Fira Code, IBM Plex Mono, Azeret Mono

IMPORTANT: Do NOT default to the same fonts. Each project should use a DIFFERENT combination.
Rotate through the full approved list. Avoid repeating Inter, DM Sans, Manrope, or Poppins as defaults.

Typography rules:
- Clear size hierarchy: text-sm -> text-base -> text-lg -> text-xl -> text-2xl -> text-4xl+
- Body text line-height: 1.5-1.7 (leading-relaxed or leading-7)
- Never use font sizes below 16px (text-base) for body content
- Use font weight variation meaningfully (300/400/500/600/700)
- Headings should feel distinctly different from body text
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

<anti_patterns>
NEVER do these — they make designs look AI-generated:

Colors:
- Purple/blue gradients on white backgrounds (the #1 AI tell)
- Using default Tailwind palette without customization (indigo-600, gray-100, etc.)
- Neon colors on dark backgrounds without purpose
- Reusing the same hex values across different projects
-> INSTEAD: Generate a unique palette using the color_system method above. Every project deserves its own colors.

Typography:
- Defaulting to Inter, Roboto, or system fonts every time
- All text the same size/weight with no hierarchy
-> INSTEAD: Pick from the recommended font pairings above. Create clear visual hierarchy.

Layout:
- Three equal boxes with icons in a row (the "features section" cliché)
- Centered everything with no visual variety
- Hero with giant heading + subtext + two buttons (every AI does this identically)
-> INSTEAD: Use asymmetric layouts, varied card sizes, interesting grid compositions. Break predictable patterns.

Content:
- Lorem ipsum or "Your content here" placeholder text
- "Welcome to Our Website" or "About Us" generic headings
- "Lorem ipsum dolor sit amet" anywhere
-> INSTEAD: Write realistic, contextual content. A bakery gets real menu items. A SaaS gets real feature descriptions. A portfolio gets real project names.

Visual:
- Abstract decorative blobs, gradient circles, or floating shapes as filler
- Emojis used as icons
- Stock-looking patterns with no connection to the content
-> INSTEAD: Use purposeful visual elements — real photos from the searchImages tool, icons from the searchIcons tool, meaningful illustrations.

Structure:
- Identical padding/margins on every section
- No hover effects or transitions on interactive elements
- Missing mobile responsiveness
-> INSTEAD: Vary section rhythms. Add hover/transition to every clickable element. Test mobile layout.
</anti_patterns>

<content_rules>
NEVER use Lorem ipsum or generic placeholder text. Generate realistic, contextual content:

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
- NEVER introduce purple/blue gradients, emoji icons, or lorem ipsum.
- NEVER remove existing design system variables or font imports.
</design_reminders>`;
