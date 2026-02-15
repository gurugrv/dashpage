import type { ProjectFiles } from '@/types';
import type { TemporalContext } from '@/lib/prompts/temporal-context';
import { generateManifest } from '@/lib/prompts/manifest/generate-manifest';

export function buildEditModeBlock(currentFiles?: ProjectFiles): string {
  if (!currentFiles?.['index.html']) return '';

  const hasComponents = Object.keys(currentFiles).some(f => f.startsWith('_components/'));

  const componentBlock = hasComponents
    ? `\nShared components:
- Blocks marked (component:X) are shared across all pages. Edit them in _components/ — changes apply everywhere.
- NEVER edit component blocks in page files — they contain placeholders, not HTML.
- To give a page a unique version, replace the placeholder with inline HTML using a different data-block name.`
    : '';

  const isMultiPage = Object.keys(currentFiles).filter(f => f.endsWith('.html') && !f.startsWith('_components/')).length > 1;

  const crossPageBlock = isMultiPage
    ? `\nCross-page awareness:
- New pages must use the same design_system tokens and font imports from site_overview.
- Only add new pages when the user explicitly asks for them.`
    : '';

  return `\n<edit_guidance>
Modify the existing HTML based on the user's request.
Build on the existing design — preserve what works, change what's requested.

BEFORE EDITING: Check the manifest above. It shows every block's data-block ID and content summary. Target blocks by ID using editBlock.

Tool selection:
- editBlock (blockId): section-level changes — replace, modify, add, remove entire blocks. Primary tool.
- editBlock (selector): fine-grained changes within a block — change a heading, update an image, tweak classes.
- editFiles: text-level search/replace for small string changes. MUST call readFile first for exact content.
- writeFiles: full page rewrites or new pages only.${componentBlock}${crossPageBlock}
</edit_guidance>`;
}

export function buildCurrentWebsiteBlock(currentFiles?: ProjectFiles): string {
  if (!currentFiles?.['index.html']) return '';

  const { perFile, siteOverview } = generateManifest(currentFiles);
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
}

const STYLE_SEEDS: StyleSeed[] = [
  { mood: 'vintage film warmth', hueRange: '30-50', strategy: 'MUTED', vibe: 'faded amber tones, warm grain, sepia-kissed surfaces' },
  { mood: 'Scandinavian minimalism', hueRange: '200-220', strategy: 'LIGHT', vibe: 'pale ice blues, birch whites, muted slate accents' },
  { mood: 'Mediterranean sun', hueRange: '35-55', strategy: 'BOLD', vibe: 'sun-baked gold, cobalt blue accents, whitewashed surfaces' },
  { mood: 'Japanese wabi-sabi', hueRange: '70-100', strategy: 'MUTED', vibe: 'moss greens, stone grays, weathered bamboo tones' },
  { mood: 'Art Deco opulence', hueRange: '40-60', strategy: 'BOLD', vibe: 'rich golds, deep emerald, onyx backgrounds with metallic sheen' },
  { mood: 'desert twilight', hueRange: '15-35', strategy: 'MUTED', vibe: 'burnt sienna, dusty mauve, cooling indigo shadows' },
  { mood: 'coastal morning', hueRange: '180-200', strategy: 'LIGHT', vibe: 'seafoam greens, driftwood neutrals, soft horizon blues' },
  { mood: 'urban industrial', hueRange: '20-40', strategy: 'HIGH-CONTRAST', vibe: 'exposed concrete grays, rust orange accents, matte black type' },
  { mood: 'botanical garden', hueRange: '120-150', strategy: 'MUTED', vibe: 'deep fern greens, terracotta pots, sun-dappled cream' },
  { mood: 'moody editorial', hueRange: '220-250', strategy: 'HIGH-CONTRAST', vibe: 'ink navy, crisp whites, single warm accent' },
  { mood: 'tropical sunset', hueRange: '340-20', strategy: 'BOLD', vibe: 'hot coral, mango orange, deep plum sky' },
  { mood: 'alpine freshness', hueRange: '170-195', strategy: 'LIGHT', vibe: 'glacier teal, pine green, snow white with crisp edges' },
  { mood: 'Bauhaus geometry', hueRange: '0-10', strategy: 'HIGH-CONTRAST', vibe: 'primary red, clean yellow, structural blue on white' },
  { mood: 'terracotta and clay', hueRange: '10-30', strategy: 'MUTED', vibe: 'warm terracotta, sandy beige, olive leaf accents' },
  { mood: 'midnight jazz club', hueRange: '260-280', strategy: 'BOLD', vibe: 'deep plum, smoky amber, brass gold highlights' },
  { mood: 'morning coffee shop', hueRange: '25-45', strategy: 'MUTED', vibe: 'roasted brown, cream froth, warm caramel tones' },
  { mood: 'autumn forest walk', hueRange: '15-40', strategy: 'MUTED', vibe: 'burnt orange, deep crimson, bark brown, golden light' },
  { mood: 'ocean at dawn', hueRange: '190-215', strategy: 'LIGHT', vibe: 'pearl gray-blue, soft coral horizon, silvery foam' },
  { mood: 'French patisserie', hueRange: '330-350', strategy: 'LIGHT', vibe: 'blush pink, pistachio green, champagne gold, cream' },
  { mood: 'Brooklyn loft', hueRange: '20-35', strategy: 'HIGH-CONTRAST', vibe: 'exposed brick red, charcoal steel, warm Edison amber' },
  { mood: 'Moroccan riad', hueRange: '15-35', strategy: 'MUTED', vibe: 'warm terracotta, teal tile accents, sandy plaster surfaces' },
  { mood: 'Northern lights', hueRange: '150-180', strategy: 'BOLD', vibe: 'electric teal, aurora green, deep arctic purple' },
  { mood: 'cherry blossom season', hueRange: '330-345', strategy: 'LIGHT', vibe: 'soft sakura pink, warm gray bark, pale sky blue' },
  { mood: 'volcanic earth', hueRange: '5-25', strategy: 'BOLD', vibe: 'lava orange, obsidian black, sulfur yellow accents' },
  { mood: 'golden hour photography', hueRange: '35-55', strategy: 'MUTED', vibe: 'honey amber, warm shadows, sun-kissed highlights' },
  { mood: 'rainy day cafe', hueRange: '200-225', strategy: 'MUTED', vibe: 'slate blue-gray, steamed milk cream, warm wood brown' },
  { mood: 'Southwest desert', hueRange: '20-40', strategy: 'BOLD', vibe: 'turquoise jewelry, red sandstone, coyote tan' },
  { mood: 'Pacific Northwest moss', hueRange: '110-140', strategy: 'MUTED', vibe: 'deep emerald moss, wet bark brown, misty silver-green' },
  { mood: 'Tuscan vineyard', hueRange: '40-60', strategy: 'MUTED', vibe: 'olive green, sun-dried tomato red, aged stone cream' },
  { mood: 'neon Tokyo night', hueRange: '270-330', strategy: 'BOLD', vibe: 'electric purple, hot pink, deep indigo backgrounds' },
  { mood: 'Danish hygge', hueRange: '30-50', strategy: 'LIGHT', vibe: 'candlelight amber, wool cream, soft charcoal warmth' },
  { mood: 'Parisian bistro', hueRange: '345-10', strategy: 'MUTED', vibe: 'burgundy wine, zinc gray, antique brass, chalk white' },
  { mood: 'coral reef depths', hueRange: '175-200', strategy: 'BOLD', vibe: 'vivid coral, deep ocean teal, anemone purple' },
  { mood: 'sunset over lavender fields', hueRange: '270-290', strategy: 'MUTED', vibe: 'soft lavender, golden wheat, dusty rose horizon' },
  { mood: 'misty Scottish highlands', hueRange: '140-170', strategy: 'MUTED', vibe: 'heather purple, peat brown, silvery mist green' },
  { mood: 'Cuban street colors', hueRange: '45-70', strategy: 'BOLD', vibe: 'vibrant turquoise, sun-faded yellow, flamingo pink' },
  { mood: 'Vermont autumn', hueRange: '10-35', strategy: 'BOLD', vibe: 'fiery maple red, pumpkin orange, deep forest green' },
  { mood: 'Kyoto temple garden', hueRange: '80-110', strategy: 'MUTED', vibe: 'bamboo green, stone gray, vermillion gate accents' },
  { mood: 'Saharan dusk', hueRange: '25-45', strategy: 'MUTED', vibe: 'sand gold, deep indigo sky, warm ochre' },
  { mood: 'Amalfi Coast tiles', hueRange: '195-215', strategy: 'BOLD', vibe: 'cerulean blue, lemon yellow, sun-bleached white' },
  { mood: 'Norwegian fjord', hueRange: '200-230', strategy: 'LIGHT', vibe: 'steel blue water, snow white, deep pine green' },
];

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
  Mood: "${seed.mood}" | Base hue zone: ${seed.hueRange}° | Strategy bias: ${seed.strategy}
  Visual feel: ${seed.vibe}

Fuse this aesthetic with the user's subject matter — don't discard it, blend it.
A "${seed.mood}" law firm, a "${seed.mood}" bakery, a "${seed.mood}" SaaS dashboard — each would be different but carry that visual DNA in its palette and typography choices.

Steps:
1. State what you'll build and how the design seed influences your approach
2. Declare your exact palette: list all 7 HSL color values you'll use (primary, secondary, accent, bg, surface, text, text-muted) and explain why each fits the mood. Start from the seed's hue zone (${seed.hueRange}°), apply the ${seed.strategy} strategy ranges from color_system, then adjust to fit the subject
3. Pick a font pairing that reinforces the mood — explain the contrast principle (e.g., geometric + humanist, display + workhorse)
4. Use the writeFiles tool with your design system defined FIRST in <style>, using your declared palette values in :root {} custom properties

If the user's request explicitly names multiple pages, include all requested pages in a single writeFiles call. Each page must be a complete standalone HTML document. Otherwise, generate a single index.html.

Make a strong first impression — the design should feel polished and intentional, not templated.
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
