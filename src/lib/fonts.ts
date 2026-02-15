export interface FontCategory {
  label: string;
  fonts: string[];
}

export const FONT_CATEGORIES: FontCategory[] = [
  {
    label: 'Sans-serif',
    fonts: [
      'Inter', 'DM Sans', 'Work Sans', 'Lato', 'Open Sans', 'Source Sans 3',
      'Nunito Sans', 'Manrope', 'Barlow', 'Karla', 'IBM Plex Sans',
      'Public Sans', 'Figtree', 'Albert Sans', 'Mulish', 'Sora', 'Hanken Grotesk',
      'Rubik', 'Nunito', 'Cabin', 'Noto Sans', 'PT Sans', 'Josefin Sans',
    ],
  },
  {
    label: 'Geometric sans',
    fonts: [
      'Montserrat', 'Poppins', 'Raleway', 'Space Grotesk', 'Outfit', 'Syne',
      'Libre Franklin', 'Archivo', 'Jost', 'Exo 2', 'Quicksand', 'Urbanist',
      'Red Hat Display', 'Epilogue', 'Plus Jakarta Sans', 'Lexend',
    ],
  },
  {
    label: 'Serif',
    fonts: [
      'Playfair Display', 'Lora', 'Merriweather', 'EB Garamond', 'Cormorant',
      'Spectral', 'DM Serif Display', 'Literata', 'Source Serif 4', 'Alegreya',
      'Crimson Pro', 'Libre Baskerville', 'PT Serif', 'Noto Serif',
    ],
  },
  {
    label: 'Slab serif',
    fonts: ['Roboto Slab', 'Arvo', 'Aleo', 'Bitter', 'Zilla Slab'],
  },
  {
    label: 'Display',
    fonts: [
      'Oswald', 'Anton', 'Bebas Neue', 'Abril Fatface', 'Bricolage Grotesque',
      'Righteous', 'Fredoka', 'Comfortaa',
    ],
  },
  {
    label: 'Handwritten',
    fonts: ['Caveat', 'Dancing Script', 'Pacifico', 'Satisfy', 'Kalam'],
  },
  {
    label: 'Monospace',
    fonts: ['Space Mono', 'JetBrains Mono', 'Fira Code', 'IBM Plex Mono', 'Azeret Mono', 'Source Code Pro'],
  },
];

/** Flat list of all approved font names */
export const ALL_FONTS: string[] = FONT_CATEGORIES.flatMap((c) => c.fonts);

/** Case-insensitive lookup: lowercased name -> canonical name */
const FONT_LOOKUP = new Map<string, string>(
  ALL_FONTS.map((f) => [f.toLowerCase(), f]),
);

/**
 * Common font aliases: renamed Google Fonts, frequent LLM misspellings,
 * and near-miss variants that should map to an approved font.
 */
const FONT_ALIASES = new Map<string, string>(
  Object.entries({
    // Google Fonts renames
    'source sans pro': 'Source Sans 3',
    'source serif pro': 'Source Serif 4',
    // Variants LLMs confuse
    'roboto': 'Rubik',
    'dm serif text': 'DM Serif Display',
    'playfair display sc': 'Playfair Display',
    'crimson text': 'Crimson Pro',
    'ibm plex': 'IBM Plex Sans',
    'red hat text': 'Red Hat Display',
    'exo': 'Exo 2',
    'cormorant garamond': 'Cormorant',
    'noto sans display': 'Noto Sans',
    'noto serif display': 'Noto Serif',
    'josefin slab': 'Josefin Sans',
    'libre caslon text': 'Libre Baskerville',
    'libre caslon display': 'Libre Baskerville',
    'fira sans': 'Figtree',
    'fira mono': 'Fira Code',
    'ubuntu': 'Rubik',
    'ubuntu mono': 'Source Code Pro',
    'inconsolata': 'Source Code Pro',
    'overpass': 'Manrope',
    'hind': 'Mulish',
    'asap': 'Barlow',
    'catamaran': 'Work Sans',
    'maven pro': 'Jost',
    'titillium web': 'Archivo',
    'abel': 'Quicksand',
    'varela round': 'Quicksand',
    'dancing script': 'Dancing Script',
  }).map(([alias, canonical]) => [alias.toLowerCase(), canonical]),
);

const DEFAULT_HEADING_FONT = 'DM Sans';
const DEFAULT_BODY_FONT = 'Inter';

/**
 * Validate a font name against the approved list.
 * Resolution order: exact match (case-insensitive) -> alias map -> fallback default.
 */
export function sanitizeFont(name: string, role: 'heading' | 'body'): string {
  const key = name.toLowerCase().trim();

  // Exact match
  const exact = FONT_LOOKUP.get(key);
  if (exact) return exact;

  // Alias / renamed font
  const alias = FONT_ALIASES.get(key);
  if (alias) return alias;

  console.warn(`Font "${name}" not in approved list, falling back to default for ${role}`);
  return role === 'heading' ? DEFAULT_HEADING_FONT : DEFAULT_BODY_FONT;
}

/**
 * Build a Google Fonts CSS URL for the given font names.
 * Deduplicates and encodes names.
 */
export function buildGoogleFontsUrl(fonts: string[]): string {
  const unique = [...new Set(fonts)];
  const families = unique
    .map((f) => `family=${f.replace(/ /g, '+')}:wght@400;500;600;700`)
    .join('&');
  return `https://fonts.googleapis.com/css2?${families}&display=swap`;
}

/** Google Fonts URL that loads ALL curated fonts (for picker previews) */
export const ALL_FONTS_URL = buildGoogleFontsUrl(ALL_FONTS);
