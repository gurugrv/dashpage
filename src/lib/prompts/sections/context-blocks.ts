import type { ProjectFiles } from '@/types';
import type { TemporalContext } from '@/lib/prompts/temporal-context';
import { extractDesignTokens, generateManifest } from '@/lib/prompts/manifest/generate-manifest';
import { JS_UTILITIES_MARKER } from './js-utilities';

export function buildEditModeBlock(currentFiles?: ProjectFiles): string {
  if (!currentFiles?.['index.html']) return '';

  // Detect existing design tokens to prevent :root redefinition
  const indexHtml = currentFiles['index.html'] || '';
  const existingTokens = extractDesignTokens(indexHtml);
  const hasDesignTokens = existingTokens.length > 0;

  const hasSharedUtils = indexHtml.includes(JS_UTILITIES_MARKER);
  const hasComponents = Object.keys(currentFiles).some(f => f.startsWith('_components/'));

  const componentBlock = hasComponents
    ? `\nShared components:
- Blocks marked (component:X) are shared across all pages. Edit them in _components/ — changes apply everywhere.
- NEVER edit component blocks in page files — they contain placeholders, not HTML.
- To give a page a unique version, replace the placeholder with inline HTML using a different data-block name.`
    : '';

  const isMultiPage = Object.keys(currentFiles).filter(f => f.endsWith('.html') && !f.startsWith('_components/')).length > 1;

  const designTokenBlock = hasDesignTokens
    ? `\nDesign system preservation:
- The :root CSS custom properties are already defined in the page's <style> block. Do NOT redefine them — use var(--color-primary), var(--font-heading), etc. directly.
- If the user explicitly asks to change colors, fonts, or the design system, update the existing :root values — do not create a second :root block.`
    : '';

  const crossPageBlock = isMultiPage
    ? `\nCross-page awareness:
- New pages must use the same design_system tokens and font imports from site_overview.
- Only add new pages when the user explicitly asks for them.`
    : '';

  return `\n<edit_guidance>
Modify the existing HTML based on the user's request.
Build on the existing design — preserve what works, change what's requested.

Communication:
- Before editing, briefly acknowledge what the user asked to change and explain your approach ("I'll update the hero section with a bolder headline and swap the CTA color to match your brand").
- After editing, summarize what was changed and mention any design decisions you made. If relevant, suggest related tweaks the user might consider.

BEFORE EDITING: Check the manifest above. It shows every block's data-block ID and content summary. Target blocks by ID using editBlock.

Tool selection:
- editBlock (blockId): section-level changes — replace, modify, add, remove entire blocks. Primary tool.
- editBlock (selector): fine-grained changes within a block — change a heading, update an image, tweak classes.
- editFiles: text-level search/replace for small string changes. MUST call readFile first for exact content.
- Use readFile before editBlock replace for exact content.
- writeFiles: full page rewrites or new pages only.
- deleteFile: remove a page when the user asks to delete one.${designTokenBlock}${hasSharedUtils ? `\nShared JS utilities:
- The page may include legacy JS utilities (wb-utils). For new interactive elements, prefer Alpine.js directives (x-data, x-show, x-collapse, x-intersect) over data-attributes. See the interactivity patterns in the system prompt.` : ''}${componentBlock}${crossPageBlock}
</edit_guidance>`;
}

export function buildCurrentWebsiteBlock(currentFiles?: ProjectFiles): string {
  if (!currentFiles?.['index.html']) return '';

  const { perFile, siteOverview } = generateManifest(currentFiles, { editMode: true });
  const fileCount = Object.keys(currentFiles).length;
  const isMultiPage = fileCount > 1;

  const preamble = isMultiPage
    ? `The user has an existing multi-file website (${fileCount} files). Below is a structural manifest of each file.`
    : 'The user has an existing website. Below is a structural manifest of the page.';

  const instructions = isMultiPage
    ? 'Use readFile to inspect exact content before making editFiles changes.\nMaintain design consistency across ALL files.\nUnchanged files are preserved automatically — only include new or fully rewritten files in writeFiles.'
    : 'Use readFile to inspect exact content before making editFiles changes.\nWhen editing, consider the ENTIRE page context — maintain design consistency across all sections.';

  const overviewBlock = siteOverview ? `\n${siteOverview}\n` : '';

  return `\n<current_website>
${preamble}
${overviewBlock}
${perFile}

${instructions}
</current_website>`;
}

interface StyleSeed {
  mood: string;
  hueRange: string;
  strategy: 'LIGHT' | 'MUTED' | 'BOLD' | 'HIGH-CONTRAST';
  vibe: string;
  visualStyle: string;
  imageStyle: string;
}

const STYLE_SEEDS: StyleSeed[] = [
  { mood: 'vintage film warmth', hueRange: '30-50', strategy: 'MUTED', vibe: 'faded amber tones, warm grain, sepia-kissed surfaces', visualStyle: 'retro-nostalgic', imageStyle: 'warm film-grain photography, faded colors, golden hour tones' },
  { mood: 'Scandinavian minimalism', hueRange: '200-220', strategy: 'LIGHT', vibe: 'pale ice blues, birch whites, muted slate accents', visualStyle: 'tech-minimal', imageStyle: 'clean product photography, white space, natural materials' },
  { mood: 'Mediterranean sun', hueRange: '35-55', strategy: 'BOLD', vibe: 'sun-baked gold, cobalt blue accents, whitewashed surfaces', visualStyle: 'bold-expressive', imageStyle: 'sun-drenched travel photography, blue doors, terracotta rooftops' },
  { mood: 'Japanese wabi-sabi', hueRange: '70-100', strategy: 'MUTED', vibe: 'moss greens, stone grays, weathered bamboo tones', visualStyle: 'organic-warm', imageStyle: 'soft natural light photography, close-up botanicals, earth tones' },
  { mood: 'Art Deco opulence', hueRange: '40-60', strategy: 'BOLD', vibe: 'rich golds, deep emerald, onyx backgrounds with metallic sheen', visualStyle: 'luxury-refined', imageStyle: 'high-contrast editorial photography, metallic surfaces, geometric patterns' },
  { mood: 'desert twilight', hueRange: '15-35', strategy: 'MUTED', vibe: 'burnt sienna, dusty mauve, cooling indigo shadows', visualStyle: 'organic-warm', imageStyle: 'warm desert landscape photography, long shadows, earth pigments' },
  { mood: 'coastal morning', hueRange: '180-200', strategy: 'LIGHT', vibe: 'seafoam greens, driftwood neutrals, soft horizon blues', visualStyle: 'tech-minimal', imageStyle: 'soft coastal photography, morning light, muted ocean tones' },
  { mood: 'urban industrial', hueRange: '20-40', strategy: 'HIGH-CONTRAST', vibe: 'exposed concrete grays, rust orange accents, matte black type', visualStyle: 'brutalist-raw', imageStyle: 'gritty documentary photography, concrete textures, high contrast B&W' },
  { mood: 'botanical garden', hueRange: '120-150', strategy: 'MUTED', vibe: 'deep fern greens, terracotta pots, sun-dappled cream', visualStyle: 'organic-warm', imageStyle: 'soft natural light photography, close-up botanicals, earth tones' },
  { mood: 'moody editorial', hueRange: '220-250', strategy: 'HIGH-CONTRAST', vibe: 'ink navy, crisp whites, single warm accent', visualStyle: 'editorial-magazine', imageStyle: 'dramatic editorial photography, deep shadows, cinematic framing' },
  { mood: 'tropical sunset', hueRange: '340-20', strategy: 'BOLD', vibe: 'hot coral, mango orange, deep plum sky', visualStyle: 'bold-expressive', imageStyle: 'vibrant sunset photography, saturated tropical colors, golden light' },
  { mood: 'alpine freshness', hueRange: '170-195', strategy: 'LIGHT', vibe: 'glacier teal, pine green, snow white with crisp edges', visualStyle: 'tech-minimal', imageStyle: 'crisp mountain photography, cold blue light, sharp details' },
  { mood: 'Bauhaus geometry', hueRange: '0-10', strategy: 'HIGH-CONTRAST', vibe: 'primary red, clean yellow, structural blue on white', visualStyle: 'brutalist-raw', imageStyle: 'graphic flat-color compositions, geometric shapes, bold primary tones' },
  { mood: 'terracotta and clay', hueRange: '10-30', strategy: 'MUTED', vibe: 'warm terracotta, sandy beige, olive leaf accents', visualStyle: 'organic-warm', imageStyle: 'warm artisanal photography, handmade textures, clay and earth materials' },
  { mood: 'midnight jazz club', hueRange: '260-280', strategy: 'BOLD', vibe: 'deep plum, smoky amber, brass gold highlights', visualStyle: 'luxury-refined', imageStyle: 'moody low-light photography, warm amber glow, smoke and brass' },
  { mood: 'morning coffee shop', hueRange: '25-45', strategy: 'MUTED', vibe: 'roasted brown, cream froth, warm caramel tones', visualStyle: 'organic-warm', imageStyle: 'warm cafe photography, steam and cream tones, natural wood surfaces' },
  { mood: 'autumn forest walk', hueRange: '15-40', strategy: 'MUTED', vibe: 'burnt orange, deep crimson, bark brown, golden light', visualStyle: 'retro-nostalgic', imageStyle: 'warm autumn photography, fallen leaves, golden forest light' },
  { mood: 'ocean at dawn', hueRange: '190-215', strategy: 'LIGHT', vibe: 'pearl gray-blue, soft coral horizon, silvery foam', visualStyle: 'editorial-magazine', imageStyle: 'serene ocean photography, soft dawn light, muted blue-gray tones' },
  { mood: 'French patisserie', hueRange: '330-350', strategy: 'LIGHT', vibe: 'blush pink, pistachio green, champagne gold, cream', visualStyle: 'luxury-refined', imageStyle: 'elegant food photography, pastel tones, soft focus, marble surfaces' },
  { mood: 'Brooklyn loft', hueRange: '20-35', strategy: 'HIGH-CONTRAST', vibe: 'exposed brick red, charcoal steel, warm Edison amber', visualStyle: 'brutalist-raw', imageStyle: 'industrial interior photography, exposed brick, warm Edison lighting' },
  { mood: 'Moroccan riad', hueRange: '15-35', strategy: 'MUTED', vibe: 'warm terracotta, teal tile accents, sandy plaster surfaces', visualStyle: 'retro-nostalgic', imageStyle: 'warm travel photography, zellige tiles, arched doorways, spice markets' },
  { mood: 'Northern lights', hueRange: '150-180', strategy: 'BOLD', vibe: 'electric teal, aurora green, deep arctic navy', visualStyle: 'bold-expressive', imageStyle: 'dramatic aurora photography, deep sky, electric green streaks' },
  { mood: 'cherry blossom season', hueRange: '330-345', strategy: 'LIGHT', vibe: 'soft sakura pink, warm gray bark, pale sky blue', visualStyle: 'editorial-magazine', imageStyle: 'soft floral photography, blurred bokeh petals, pastel spring light' },
  { mood: 'volcanic earth', hueRange: '5-25', strategy: 'BOLD', vibe: 'lava orange, obsidian black, sulfur yellow accents', visualStyle: 'bold-expressive', imageStyle: 'dramatic geological photography, molten textures, high contrast fire tones' },
  { mood: 'golden hour photography', hueRange: '35-55', strategy: 'MUTED', vibe: 'honey amber, warm shadows, sun-kissed highlights', visualStyle: 'editorial-magazine', imageStyle: 'golden hour portraits, warm backlit subjects, lens flare' },
  { mood: 'rainy day cafe', hueRange: '200-225', strategy: 'MUTED', vibe: 'slate blue-gray, steamed milk cream, warm wood brown', visualStyle: 'corporate-clean', imageStyle: 'cozy interior photography, rain on windows, warm ambient light' },
  { mood: 'Southwest desert', hueRange: '20-40', strategy: 'BOLD', vibe: 'turquoise jewelry, red sandstone, coyote tan', visualStyle: 'bold-expressive', imageStyle: 'vivid desert photography, turquoise and red sandstone, dramatic skies' },
  { mood: 'Pacific Northwest moss', hueRange: '110-140', strategy: 'MUTED', vibe: 'deep emerald moss, wet bark brown, misty silver-green', visualStyle: 'organic-warm', imageStyle: 'misty forest photography, close-up moss and ferns, diffused green light' },
  { mood: 'Tuscan vineyard', hueRange: '40-60', strategy: 'MUTED', vibe: 'olive green, sun-dried tomato red, aged stone cream', visualStyle: 'retro-nostalgic', imageStyle: 'warm Tuscan landscape photography, olive groves, stone villa textures' },
  { mood: 'bioluminescent tech', hueRange: '150-180', strategy: 'BOLD', vibe: 'void black backgrounds, holo teal accents, plasma gradients', visualStyle: 'tech-minimal', imageStyle: 'dark tech photography, glowing interfaces, teal and cyan light trails' },
  { mood: 'Danish hygge', hueRange: '30-50', strategy: 'LIGHT', vibe: 'candlelight amber, wool cream, soft charcoal warmth', visualStyle: 'corporate-clean', imageStyle: 'cozy interior photography, candlelight, wool textures, soft warmth' },
  { mood: 'Parisian bistro', hueRange: '345-10', strategy: 'MUTED', vibe: 'burgundy wine, zinc gray, antique brass, chalk white', visualStyle: 'editorial-magazine', imageStyle: 'moody French bistro photography, dark wood, zinc counters, warm wine tones' },
  { mood: 'coral reef depths', hueRange: '175-200', strategy: 'BOLD', vibe: 'vivid coral, deep ocean teal, anemone orange', visualStyle: 'bold-expressive', imageStyle: 'vivid underwater photography, coral textures, deep blue-green water' },
  { mood: 'Saharan market', hueRange: '20-45', strategy: 'MUTED', vibe: 'spice market oranges, indigo textiles, sandy plaster', visualStyle: 'organic-warm', imageStyle: 'warm market photography, spice piles, draped indigo fabrics, sandy textures' },
  { mood: 'misty Scottish highlands', hueRange: '140-170', strategy: 'MUTED', vibe: 'heather purple, peat brown, silvery mist green', visualStyle: 'editorial-magazine', imageStyle: 'atmospheric landscape photography, rolling mist, muted heather tones' },
  { mood: 'Cuban street colors', hueRange: '45-70', strategy: 'BOLD', vibe: 'vibrant turquoise, sun-faded yellow, flamingo pink', visualStyle: 'retro-nostalgic', imageStyle: 'vibrant street photography, classic cars, sun-faded paint, tropical colors' },
  { mood: 'Vermont autumn', hueRange: '10-35', strategy: 'BOLD', vibe: 'fiery maple red, pumpkin orange, deep forest green', visualStyle: 'bold-expressive', imageStyle: 'dramatic autumn landscape, fiery foliage, crisp morning light' },
  { mood: 'Kyoto temple garden', hueRange: '80-110', strategy: 'MUTED', vibe: 'bamboo green, stone gray, vermillion gate accents', visualStyle: 'luxury-refined', imageStyle: 'serene Japanese garden photography, raked gravel, moss, vermillion accents' },
  { mood: 'Saharan dusk', hueRange: '25-45', strategy: 'MUTED', vibe: 'sand gold, deep navy sky, warm ochre', visualStyle: 'corporate-clean', imageStyle: 'warm desert dusk photography, sand dunes, deep sky gradient' },
  { mood: 'Amalfi Coast tiles', hueRange: '195-215', strategy: 'BOLD', vibe: 'cerulean blue, lemon yellow, sun-bleached white', visualStyle: 'luxury-refined', imageStyle: 'Mediterranean coastal photography, blue tiles, lemon groves, white plaster' },
  { mood: 'Norwegian fjord', hueRange: '200-230', strategy: 'LIGHT', vibe: 'steel blue water, snow white, deep pine green', visualStyle: 'tech-minimal', imageStyle: 'crisp fjord photography, cold blue water, snow-capped mountains' },
];

export const LAYOUT_ARCHETYPES_SECTION = `<layout_archetypes>
Choose a layout archetype that fits the content. Vary your choices across generations — don't default to the same archetype every time.

bento-grid: Asymmetric grid tiles with varying column/row spans. Mix large feature tiles (span 2-3 cols) with small detail tiles. NOT a uniform card grid.
  CSS: display:grid; grid-template-columns:repeat(4,1fr); grid-column:span 2, grid-row:span 2 for variety. Gap 1rem-1.5rem.

split-screen: Side-by-side contrasting panels (50/50 or 60/40). Hero splits image and text. Sections alternate which side has content vs media.
  CSS: display:grid; grid-template-columns:1fr 1fr (or 3fr 2fr). On mobile: stack vertically. Contrasting bg colors per side.

editorial-magazine: Large hero image with overlaid text, multi-column body text, pull quotes that break columns, varied image sizes. Magazine spread feel.
  CSS: column-count:2 for text; column-span:all for pull quotes. Mix full-bleed images with contained text. Vary font sizes dramatically.

immersive-scroll: Full-viewport sections (min-h-screen) creating a narrative scroll journey. Each section is a complete visual moment.
  CSS: Each section min-h-screen with flex centering. Snap optional: scroll-snap-type:y mandatory. Intersection Observer for reveals.

asymmetric-hero: Hero content pushed off-center. Overlapping elements create depth — images breaking container bounds, text overlaid with offset.
  CSS: Hero grid: grid-template-columns:1fr 1.5fr. Overlap with negative margins and z-index.

card-mosaic: Mixed card sizes in masonry-like flow. Some tall, some wide, some small. NOT uniform heights.
  CSS: CSS columns (column-count:3, break-inside:avoid) OR grid with grid-auto-rows:minmax(200px,auto) and varying spans.

diagonal-sections: Angled dividers between sections using clip-path. Alternating angles. Background colors shift across diagonals.
  CSS: clip-path:polygon(0 0,100% 0,100% 85%,0 100%). Alternate angle direction. Negative margin-top to overlap clipped edges.

centered-minimal: Dramatic whitespace, single-column focus. Content narrow (max-w-2xl). Large type contrasts with small body. The emptiness IS the design.
  CSS: max-w-2xl mx-auto. Huge vertical padding (py-32+). Very large headings (text-6xl+) with normal body text.

horizontal-scroll-showcase: Key sections scroll horizontally. Portfolio items, features, or testimonials in a sideways strip with snap points.
  CSS: overflow-x:auto; scroll-snap-type:x mandatory; display:flex. Children: flex:0 0 80vw; scroll-snap-align:start.

glassmorphism-layers: Frosted glass cards over rich gradient or image backgrounds. Translucent panels with blur. Depth through layered transparency.
  CSS: backdrop-filter:blur(16px); background:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.2). Rich bg behind.

mega-footer-architecture: Minimal above-the-fold content. Footer is a dense, multi-column information hub. Footer IS a design feature.
  CSS: Footer grid with 4-5 columns, py-20+. Dark bg contrasting with page. Above-fold: minimal, single CTA.

kinetic-typography-hero: Oversized animated text as primary visual. Minimal imagery — words ARE the design. Text scales, rotates, or reveals.
  CSS: text-8xl md:text-9xl, font-weight:900. CSS @keyframes for text animation. mix-blend-mode for text over backgrounds.

overlapping-collage: Scattered, rotated elements in art-directed chaos. Images and cards overlap intentionally. Handmade, editorial feel.
  CSS: position:absolute/relative with manual offsets. transform:rotate(-3deg to 5deg). z-index layering. Negative margins.

dashboard-inspired: Data visualization aesthetic for non-dashboard sites. Stat counters, progress rings, metric cards. Information feels quantified.
  CSS: Grid of stat cards with large numbers (text-5xl font-bold). SVG circles for progress rings. Monospace font for data.

sticky-reveal-panels: Sections pin in place and layer over each other on scroll. Card-stacking reveal effect.
  CSS: Each section: position:sticky; top:0; min-h-screen. Increment z-index. Box-shadow on top edge. Opaque backgrounds.

Pick the archetype that best matches the content's purpose, then adapt it — not every section needs to follow it, but the overall page structure should reflect it.
</layout_archetypes>`;

export function getRandomStyleSeed(): StyleSeed {
  return STYLE_SEEDS[Math.floor(Math.random() * STYLE_SEEDS.length)];
}

const KEYWORD_STRATEGY_MAP: Record<string, StyleSeed['strategy'][]> = {
  // Food & hospitality
  restaurant: ['MUTED', 'BOLD'],
  bakery: ['MUTED', 'BOLD'],
  cafe: ['MUTED', 'LIGHT'],
  coffee: ['MUTED', 'LIGHT'],
  food: ['MUTED', 'BOLD'],
  bar: ['BOLD', 'MUTED'],
  hotel: ['MUTED', 'LIGHT'],
  // Tech & SaaS
  tech: ['LIGHT', 'HIGH-CONTRAST'],
  saas: ['LIGHT', 'HIGH-CONTRAST'],
  software: ['LIGHT', 'HIGH-CONTRAST'],
  app: ['LIGHT', 'BOLD'],
  startup: ['BOLD', 'LIGHT'],
  ai: ['BOLD', 'HIGH-CONTRAST'],
  // Luxury & premium
  luxury: ['BOLD', 'MUTED'],
  premium: ['BOLD', 'MUTED'],
  jewelry: ['BOLD', 'MUTED'],
  fashion: ['BOLD', 'HIGH-CONTRAST'],
  boutique: ['MUTED', 'BOLD'],
  // Professional services
  law: ['HIGH-CONTRAST', 'MUTED'],
  legal: ['HIGH-CONTRAST', 'MUTED'],
  consulting: ['HIGH-CONTRAST', 'LIGHT'],
  finance: ['HIGH-CONTRAST', 'MUTED'],
  accounting: ['HIGH-CONTRAST', 'LIGHT'],
  // Creative & personal
  portfolio: ['HIGH-CONTRAST', 'BOLD'],
  photography: ['HIGH-CONTRAST', 'MUTED'],
  art: ['BOLD', 'HIGH-CONTRAST'],
  design: ['BOLD', 'LIGHT'],
  agency: ['BOLD', 'HIGH-CONTRAST'],
  // Health & wellness
  health: ['LIGHT', 'MUTED'],
  wellness: ['LIGHT', 'MUTED'],
  spa: ['MUTED', 'LIGHT'],
  yoga: ['MUTED', 'LIGHT'],
  fitness: ['BOLD', 'LIGHT'],
  gym: ['BOLD', 'HIGH-CONTRAST'],
  // Education & nonprofit
  education: ['LIGHT', 'MUTED'],
  school: ['LIGHT', 'BOLD'],
  nonprofit: ['MUTED', 'LIGHT'],
  charity: ['MUTED', 'BOLD'],
  // Real estate & construction
  'real estate': ['LIGHT', 'HIGH-CONTRAST'],
  construction: ['MUTED', 'HIGH-CONTRAST'],
  architecture: ['HIGH-CONTRAST', 'MUTED'],
  // Automotive & transport
  automotive: ['HIGH-CONTRAST', 'BOLD'],
  car: ['HIGH-CONTRAST', 'BOLD'],
  // Travel & hospitality
  travel: ['LIGHT', 'MUTED'],
  hospitality: ['MUTED', 'LIGHT'],
  // Manufacturing & trades
  manufacturing: ['HIGH-CONTRAST', 'MUTED'],
  plumber: ['HIGH-CONTRAST', 'MUTED'],
  electrician: ['HIGH-CONTRAST', 'MUTED'],
  contractor: ['HIGH-CONTRAST', 'MUTED'],
  // Medical & dental
  dental: ['LIGHT', 'MUTED'],
  medical: ['LIGHT', 'MUTED'],
  clinic: ['LIGHT', 'MUTED'],
  // Personal care
  salon: ['MUTED', 'LIGHT'],
  barbershop: ['MUTED', 'BOLD'],
  // E-commerce variants
  ecommerce: ['LIGHT', 'BOLD'],
  'e-commerce': ['LIGHT', 'BOLD'],
  shop: ['LIGHT', 'BOLD'],
  store: ['LIGHT', 'BOLD'],
  // Pets
  pet: ['BOLD', 'LIGHT'],
  veterinary: ['LIGHT', 'MUTED'],
  // Religious & community
  church: ['MUTED', 'LIGHT'],
  religious: ['MUTED', 'LIGHT'],
  // Events & celebrations
  wedding: ['LIGHT', 'MUTED'],
  event: ['BOLD', 'LIGHT'],
};

export function getWeightedStyleSeed(userPrompt: string): StyleSeed {
  const lower = userPrompt.toLowerCase();
  const matchedStrategies: StyleSeed['strategy'][] = [];

  for (const [keyword, strategies] of Object.entries(KEYWORD_STRATEGY_MAP)) {
    if (lower.includes(keyword)) {
      matchedStrategies.push(...strategies);
    }
  }

  if (matchedStrategies.length === 0) {
    return getRandomStyleSeed();
  }

  // Filter seeds by compatible strategies
  const compatibleSeeds = STYLE_SEEDS.filter(s => matchedStrategies.includes(s.strategy));
  if (compatibleSeeds.length === 0) {
    return getRandomStyleSeed();
  }

  return compatibleSeeds[Math.floor(Math.random() * compatibleSeeds.length)];
}

export function buildFirstGenerationBlock(isFirstGeneration: boolean, userPrompt?: string): string {
  if (!isFirstGeneration) return '';

  const seed = userPrompt ? getWeightedStyleSeed(userPrompt) : getRandomStyleSeed();

  return `\n<first_generation>
This is a NEW website. Your design seed for this project:

DESIGN SEED:
  Mood: "${seed.mood}" | Hue zone: ${seed.hueRange}° | Strategy: ${seed.strategy}
  Visual feel: ${seed.vibe}
  Visual style: ${seed.visualStyle} — use this archetype to guide your layout composition, spacing rhythm, and visual weight.
  Image style: ${seed.imageStyle} — use this to guide your searchImages queries and image treatment.

Choose a layout archetype from layout_archetypes above that fits both this visual style and the content. Fuse the design seed's aesthetic with the archetype's structure.

Steps:
1. Define your :root CSS custom properties (7 colors from the seed's strategy ranges + font families + shadows + radius) and Tailwind config
2. Call writeFiles with the complete HTML — apply your chosen layout archetype's structural pattern

Make a strong first impression — the design should feel polished, intentional, and unlike anything a template generator would produce.
</first_generation>`;
}

export function buildTemporalBlock(temporalContext?: TemporalContext): string {
  if (!temporalContext) return '';

  return `\n<temporal_context>
Authoritative current date: ${temporalContext.currentDate} (${temporalContext.timeZone}).
Interpret "today/current/this year/recent" using this date context.
Use explicit dates when time period accuracy matters.
</temporal_context>`;
}
