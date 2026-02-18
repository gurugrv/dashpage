// UI/UX Pro Max Guidelines - Condensed for system prompt
// Source: docs/ui-ux-pro-max-skill-main

export const UI_UX_GUIDELINES_SECTION = `<ui_ux_guidelines>
<industry_tones>
Industry color guidance — sets emotional register and tonal direction, not specific colors.
The design seed sets actual hues; this guides HOW to apply them.

Healthcare/Medical:
  Register: calm reassurance, human warmth — desaturate slightly, favor warm off-whites over stark white
  Avoid: cold clinical blue + stark white (hospital brochure circa 2005)
  Try: warm stone + sage + muted terracotta; dusty mint accents for wellness
  Type: warm humanist sans headings (Plus Jakarta Sans, Outfit), clean sans body

Dental/Orthodontics:
  Register: friendly confidence, clean but not sterile — bright yet soft tones
  Avoid: minty green + tooth-white (every dental site ever)
  Try: warm coral + cream; soft gold + charcoal; sky blue + warm sand
  Type: friendly rounded sans headings (Outfit, Manrope), clean sans body

Finance/Banking:
  Register: authority, weight, stability — deepen tones, use warm metallic accents sparingly
  Avoid: navy + gold + serif (every bank from 1990)
  Try: deep forest green + cream; warm charcoal + aged brass; for fintech — violet or electric accents on dark
  Type: refined serif headings (DM Serif Display, Newsreader), clean sans body

SaaS/B2B:
  Register: trust + clarity, quietly confident — lean cool on base, energetic accent for CTAs
  Avoid: flat blue + white + generic gradients (the AI startup look)
  Try: dark mode with single vivid accent; warm gray + teal; muted indigo + amber
  Type: geometric sans headings (Space Grotesk, Manrope), clean sans body

E-commerce/Retail:
  Register: confident, actionable, inviting — clear contrast, warm urgency for CTAs
  Avoid: Amazon-clone white + orange (big-box energy)
  Try: rich cream + emerald; warm charcoal + coral; muted blush + deep navy
  Type: bold sans headings (Bebas Neue, Bricolage Grotesque), clean sans body

Restaurant/Food:
  Register: appetizing warmth, sensory richness — lean warm on base hue, earth-toned accents
  Avoid: red + gold (fast food chain aesthetic)
  Try: deep olive + cream + terracotta; warm black + aged paper + copper
  Type: warm serif or expressive headings (Fraunces, Cormorant Garamond), humanist sans body

Bakery/Coffee:
  Register: artisanal warmth, handcrafted feel — soft saturation, textured surfaces
  Avoid: brown + cream (every coffee shop template)
  Try: dusty sage + terracotta; muted rose + warm charcoal; lavender + honey
  Type: artisanal serif headings (Fraunces, Young Serif), warm sans body (Plus Jakarta Sans)

Legal/Consulting:
  Register: understated authority, serious credibility — muted saturation, deep tones, minimal accent use
  Avoid: navy + serif + gold crest (stodgy law firm)
  Try: warm charcoal + aged brass; deep plum + silver; forest green + cream
  Type: editorial serif headings (DM Serif Display, Newsreader), refined sans body

Beauty/Spa/Wellness:
  Register: gentle, inviting, sensory — soften saturation, lean warm, airy backgrounds
  Avoid: pink + gold + script font (every beauty brand)
  Try: forest green + copper; warm stone + sage; muted terracotta + cream
  Type: elegant serif headings (Cormorant Garamond, Instrument Serif), light sans body (Outfit)

Fitness/Gym:
  Register: energy, power, motivation — high contrast, bold accents, dynamic feel
  Avoid: black + neon green (every gym bro site)
  Try: deep navy + electric coral; charcoal + amber; warm black + sunset orange
  Type: condensed bold headings (Bebas Neue, Bricolage Grotesque), strong sans body (Manrope)

Yoga/Meditation:
  Register: serenity, groundedness, breath — muted earth tones, generous whitespace
  Avoid: purple lotus + soft gradients (spiritual cliche)
  Try: warm stone + sage; sandy beige + dusty blue; muted terracotta + cream white
  Type: gentle serif headings (Cormorant Garamond, Newsreader), light sans body (Outfit)

Creative/Agency:
  Register: expressive energy, confident taste — push saturation higher, bolder contrasts
  Avoid: rainbow gradients + geometric shapes (trying too hard)
  Try: monochrome with one vivid accent; unexpected color clash; editorial black + white with bold type
  Type: expressive display headings (Syne, Bricolage Grotesque), neutral body (DM Sans)

Education:
  Register: approachable clarity, trustworthy — balanced warmth, clean hierarchy
  Avoid: primary color blocks (kindergarten aesthetic for adult ed)
  Try: warm gray + teal + amber accents; soft navy + warm cream; sage + warm white
  Type: friendly geometric headings (Space Grotesk, Outfit), readable sans body (Plus Jakarta Sans)

Nonprofit/Charity:
  Register: human warmth, hopeful urgency — approachable colors, genuine feel
  Avoid: green + earth tones (generic NGO look)
  Try: warm terracotta + deep teal; muted coral + charcoal; dusty blue + warm amber
  Type: warm humanist headings (Plus Jakarta Sans, Fraunces), clean sans body

Real Estate:
  Register: aspirational living, premium but approachable — clean, spacious palette
  Avoid: blue + white + stock photo of keys (every realtor site)
  Try: warm black + champagne; deep green + cream; muted navy + warm sand
  Type: refined serif headings (DM Serif Display, Playfair Display), clean sans body (Outfit)

Construction/Trades:
  Register: reliability, strength, hands-on expertise — grounded, sturdy colors
  Avoid: orange + black (hardware store vibes)
  Try: deep slate + warm amber; forest green + concrete gray; charcoal + rust accent
  Type: strong sans headings (Space Grotesk, Manrope), sturdy sans body

Automotive:
  Register: precision, power, sleekness — high contrast, metallic undertones
  Avoid: red + black + chrome (sports car showroom cliche)
  Try: deep graphite + electric blue accent; warm gunmetal + amber; matte black + copper
  Type: geometric/tech headings (Space Grotesk, Syne), clean sans body (DM Sans)

Travel/Hospitality:
  Register: wanderlust, warmth, escape — inviting tones, spacious airy feel
  Avoid: sky blue + white clouds (travel agency circa 2010)
  Try: warm sand + deep teal; terracotta + sage; soft coral + warm navy
  Type: editorial serif headings (Newsreader, Cormorant Garamond), warm sans body (Plus Jakarta Sans)

Wedding/Events:
  Register: elegance, romance, celebration — soft, refined, luminous
  Avoid: blush pink + gold script (Pinterest wedding board)
  Try: warm ivory + sage + muted plum; soft charcoal + champagne; dusty blue + warm cream
  Type: elegant serif headings (Cormorant Garamond, Playfair Display), light sans body (Outfit)

Pet Services:
  Register: playful warmth, trustworthy care — friendly, approachable, vibrant
  Avoid: paw prints + bright primary colors (pet store chain)
  Try: warm teal + coral; muted mustard + warm gray; sage + terracotta accents
  Type: friendly rounded headings (Bricolage Grotesque, Outfit), warm sans body (Plus Jakarta Sans)

Church/Religious:
  Register: welcoming community, peaceful depth — warm, dignified, approachable
  Avoid: purple + gold + stained glass aesthetic (too formal, excludes)
  Try: warm cream + deep blue-green; soft charcoal + amber; warm stone + muted sage
  Type: warm serif headings (Newsreader, Young Serif), humanist sans body (Manrope)

Salon/Barbershop:
  Register: style-forward, personal confidence — bold but refined
  Avoid: black + hot pink or red barber pole (overdone)
  Try: warm charcoal + rose gold; deep teal + cream; muted plum + warm brass
  Type: bold display headings (Bebas Neue, Syne), refined sans body (DM Sans)
</industry_tones>

<accessibility_rules>
- All interactive elements: cursor-pointer, hover feedback, smooth transition (duration-200/300), focus-visible:ring-2
- Touch targets: minimum 44x44px. Animations: 150-300ms, never >500ms. Respect prefers-reduced-motion.
- Text contrast: minimum 4.5:1 ratio. Form inputs: ALWAYS have labels. Icon buttons: aria-label required.
- Images: meaningful alt text. Keyboard navigation: all features via Tab/Enter.
</accessibility_rules>

<layout_principles>
Create visual impact through:
- Asymmetric layouts that break grid monotony — offset hero images, overlapping sections, diagonal divides
- Scale contrast: pair oversized typography with intimate body text, large hero images with tight detail grids
- Rhythm variation: alternate between full-bleed sections and contained content, dense grids and breathing whitespace
- Depth layers: overlapping elements, negative margins, z-index stacking for dimensional feel
- Viewport-aware sections: at least one section should command the full viewport height for dramatic impact

Responsive: 375px, 768px, 1024px, 1440px breakpoints
Content max-width: max-w-3xl for text (65-75ch readable length)

Responsive behavior per breakpoint:
  - 375px (mobile): single column, touch targets 44px+, hamburger nav, full-width images
  - 768px (tablet): 2-column grids, side nav possible, image+text splits
  - 1024px (desktop): full navigation, 3-4 column grids, hover effects activate
  - 1440px (max): max-width container, decorative elements appear, generous padding
</layout_principles>

<interaction_standards>
- Use the searchIcons tool for UI icons — real SVG icons look professional, emojis don't.
- Style focus states intentionally: replace default outlines with focus-visible:ring-2, not just outline-none.
- Form inputs always get visible labels (not placeholder-only). Allow paste on all fields.
- Keep mobile viewport zoomable — accessibility requires it.
- Animate with transform and opacity for smooth 60fps performance.
- Icon sizing conventions: 16px for inline text icons, 20-24px for UI chrome (nav, buttons), 32-48px for feature/service cards. Keep consistent per context.
- Do NOT use icons as primary visual decoration on feature cards — prefer numbered lists, bold typography, colored borders, or background images instead.
</interaction_standards>
</ui_ux_guidelines>`;

/**
 * Compact version of UI/UX guidelines for blueprint page generation.
 * Drops industry_tones (resolved by blueprint's content strategy) to save ~1,600 tokens.
 */
export const UI_UX_GUIDELINES_COMPACT_SECTION = `<ui_ux_guidelines>
<accessibility_rules>
- All interactive elements: cursor-pointer, hover feedback, smooth transition (duration-200/300), focus-visible:ring-2
- Touch targets: minimum 44x44px. Animations: 150-300ms, never >500ms. Respect prefers-reduced-motion.
- Text contrast: minimum 4.5:1 ratio. Form inputs: ALWAYS have labels. Icon buttons: aria-label required.
- Images: meaningful alt text. Keyboard navigation: all features via Tab/Enter.
</accessibility_rules>

<layout_principles>
Create visual impact through:
- Asymmetric layouts that break grid monotony — offset hero images, overlapping sections, diagonal divides
- Scale contrast: pair oversized typography with intimate body text, large hero images with tight detail grids
- Rhythm variation: alternate between full-bleed sections and contained content, dense grids and breathing whitespace
- Depth layers: overlapping elements, negative margins, z-index stacking for dimensional feel
- Viewport-aware sections: at least one section should command the full viewport height for dramatic impact

Responsive: 375px, 768px, 1024px, 1440px breakpoints
Content max-width: max-w-3xl for text (65-75ch readable length)

Responsive behavior per breakpoint:
  - 375px (mobile): single column, touch targets 44px+, hamburger nav, full-width images
  - 768px (tablet): 2-column grids, side nav possible, image+text splits
  - 1024px (desktop): full navigation, 3-4 column grids, hover effects activate
  - 1440px (max): max-width container, decorative elements appear, generous padding
</layout_principles>

<interaction_standards>
- Use the searchIcons tool for UI icons — real SVG icons look professional, emojis don't.
- Style focus states intentionally: replace default outlines with focus-visible:ring-2, not just outline-none.
- Form inputs always get visible labels (not placeholder-only). Allow paste on all fields.
- Keep mobile viewport zoomable — accessibility requires it.
- Animate with transform and opacity for smooth 60fps performance.
- Icon sizing conventions: 16px for inline text icons, 20-24px for UI chrome (nav, buttons), 32-48px for feature/service cards. Keep consistent per context.
- Do NOT use icons as primary visual decoration on feature cards — prefer numbered lists, bold typography, colored borders, or background images instead.
</interaction_standards>
</ui_ux_guidelines>`;
