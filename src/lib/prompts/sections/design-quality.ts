// Shared design quality guidelines used by both single-page and blueprint generation.
// Single source of truth — imported by base-rules.ts AND blueprint prompt files.

export const DESIGN_QUALITY_SECTION = `<color_system>
Use EXACTLY 3-5 colors total. Count them before finalizing.

Required structure:
1. ONE primary brand color (drives the identity)
2. 2-3 neutrals (background, surface, text variations)
3. 1-2 accent colors maximum (for CTAs, highlights)

Color rules:
- Use color psychology: warm tones (orange, red, amber) for energy; cool tones (blue, teal, green) for trust; dark tones for luxury
- Maintain WCAG AA contrast (4.5:1 for text, 3:1 for large text)
- Pick colors that match the SUBJECT — a bakery site shouldn't use tech-blue, a fintech app shouldn't use playful pink

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

Recommended pairings (pick based on the project mood):

Modern/Tech: Space Grotesk (headings) + DM Sans (body)
Editorial/Blog: Playfair Display (headings) + Source Sans 3 (body)
Bold/Impact: Montserrat (headings) + Open Sans (body)
Elegant/Premium: Playfair Display (headings) + DM Sans (body)
Clean/Minimal: DM Sans (headings) + DM Sans (body)
Corporate: Work Sans (headings) + Source Sans 3 (body)
Creative/Fun: Jost (headings) + DM Sans (body)
Warm/Friendly: Nunito (headings) + Open Sans (body)

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
- Use smooth transitions: transition-all duration-200 ease-in-out (or duration-300)
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
-> INSTEAD: Use purposeful visual elements — real photos from the searchImages tool, Lucide/Heroicons-style SVG icons, meaningful illustrations.

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
