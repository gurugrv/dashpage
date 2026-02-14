// Shared design quality guidelines used by both single-page and blueprint generation.
// Single source of truth — imported by base-rules.ts AND blueprint prompt files.
// Font names in the prompt below must stay in sync with src/lib/fonts.ts FONT_CATEGORIES.

export const DESIGN_QUALITY_SECTION = `<color_system>
Use selectColorPalette to get curated, proven color palettes. Each palette returns semantic roles: primary, secondary, accent, background, surface, text, textMuted.

Workflow:
1. Pick mood tags (warm, cool, earthy, pastel, bold, muted, elegant, playful, minimal, vibrant, dark, luxury)
2. Pick an industry tag (restaurant, saas, healthcare, fintech, ecommerce, creative, legal, education, beauty, nature, corporate, portfolio)
3. Call selectColorPalette → choose the best palette from the results
4. Apply the palette roles directly to your :root CSS custom properties

Color rules:
- Maintain WCAG AA contrast (4.5:1 for text, 3:1 for large text) — the curated palettes are pre-checked but verify when mixing colors
- Pick mood/industry tags that match the SUBJECT — a bakery should use warm/earthy, not cool/minimal

Gradient rules:
- DEFAULT: Use solid colors. Avoid gradients unless they serve a purpose.
- If using gradients: ONLY analogous colors (blue->teal, purple->pink, orange->red)
- NEVER mix opposing temperatures (pink->green, orange->blue)
- Maximum 2 color stops. No rainbow gradients.
- NEVER default to purple/blue gradients — this is the #1 sign of AI-generated design
</color_system>

<typography>
Use EXACTLY 2 font families maximum. Load via Google Fonts CDN.

Required structure:
- ONE font for headings (can vary weights: 400-700)
- ONE font for body text (typically 400 and 500)

Approved Google Fonts (ONLY use fonts from this list — never guess font names).
Pick fonts that match the project mood. Use the pairings below as guidance, or create your own combinations from the approved list:

Sans-serif (body/UI): Inter, DM Sans, Work Sans, Lato, Open Sans, Source Sans 3, Nunito Sans, Manrope, Barlow, Karla, IBM Plex Sans, Public Sans, Figtree, Albert Sans, Mulish, Sora, Hanken Grotesk
Geometric sans (headings): Montserrat, Poppins, Raleway, Space Grotesk, Outfit, Syne, Libre Franklin, Archivo, Jost, Exo 2, Quicksand, Urbanist, Red Hat Display, Epilogue
Serif (editorial): Playfair Display, Lora, Merriweather, EB Garamond, Cormorant, Spectral, DM Serif Display, Literata, Source Serif 4, Alegreya
Slab serif: Roboto Slab, Arvo, Aleo, Bitter, Zilla Slab
Display (hero only): Oswald, Anton, Bebas Neue, Abril Fatface, Bricolage Grotesque
Monospace: Space Mono, JetBrains Mono, Fira Code, IBM Plex Mono, Azeret Mono

Recommended pairings (pick based on mood — vary your choices, don't repeat the same pair):

Modern/SaaS: Manrope + Inter | Space Grotesk + DM Sans
Elegant/Luxury: Playfair Display + DM Sans | Cormorant + Manrope
Editorial/Blog: DM Serif Display + DM Sans | Lora + Source Sans 3
Corporate/Trust: Work Sans + Source Sans 3 | IBM Plex Sans + IBM Plex Serif
Bold/Impact: Montserrat + Open Sans | Syne + Inter
Warm/Friendly: Nunito Sans + Lato | Poppins + Merriweather
Creative/Fun: Jost + DM Sans | Outfit + Karla | Raleway + Lora
Clean/Minimal: Inter + Inter | Figtree + Figtree
Tech/Startup: Albert Sans + Barlow | Archivo + Source Sans 3
Dashboard/Admin: Hanken Grotesk + Archivo | Urbanist + Red Hat Display
Wellness/Health: Mulish + Karla | Sora + Space Mono
Publishing/Education: Alegreya + Alegreya Sans | Epilogue + Source Sans 3

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
-> INSTEAD: Choose a cohesive, subject-appropriate palette with your design system tokens

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
