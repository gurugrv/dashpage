import { GOOGLE_FONTS_SET, GOOGLE_FONTS_CANONICAL } from './google-fonts-catalog';

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

/** Flat list of all curated font names (used by blueprint picker) */
export const ALL_FONTS: string[] = FONT_CATEGORIES.flatMap((c) => c.fonts);

/** Case-insensitive lookup: lowercased name -> canonical name (curated list) */
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
    'fira mono': 'Fira Code',
  }).map(([alias, canonical]) => [alias.toLowerCase(), canonical]),
);

const DEFAULT_HEADING_FONT = 'DM Sans';
const DEFAULT_BODY_FONT = 'Inter';

/**
 * Validate a font name against the full Google Fonts catalog.
 * Resolution order: full catalog (case-insensitive) -> alias map -> fallback default.
 */
export function sanitizeFont(name: string, role: 'heading' | 'body'): string {
  const key = name.toLowerCase().trim();

  // Full catalog match (canonical casing)
  const canonical = GOOGLE_FONTS_CANONICAL.get(key);
  if (canonical) return canonical;

  // Alias / renamed font
  const alias = FONT_ALIASES.get(key);
  if (alias) return alias;

  // Curated list match (legacy — shouldn't be needed but safe)
  const curated = FONT_LOOKUP.get(key);
  if (curated) return curated;

  console.warn(`Font "${name}" not found in Google Fonts catalog, falling back to default for ${role}`);
  return role === 'heading' ? DEFAULT_HEADING_FONT : DEFAULT_BODY_FONT;
}

/**
 * Validate and fix font names in a complete HTML string.
 * Checks Google Fonts <link> URLs and CSS custom property values.
 * Invalid fonts are replaced with defaults; aliased fonts are corrected.
 */
export function sanitizeFontsInHtml(html: string): string {
  let result = html;

  // 1. Fix Google Fonts <link> URLs
  result = result.replace(
    /(<link[^>]*href=["'])([^"']*fonts\.googleapis\.com\/css2\?[^"']*)(["'][^>]*>)/gi,
    (_match, prefix: string, url: string, suffix: string) => {
      const fixedUrl = sanitizeGoogleFontsUrl(url);
      return `${prefix}${fixedUrl}${suffix}`;
    },
  );

  // 2. Fix @import url() for Google Fonts
  result = result.replace(
    /(@import\s+url\(["']?)([^"')]*fonts\.googleapis\.com\/css2\?[^"')]*)(["']?\))/gi,
    (_match, prefix: string, url: string, suffix: string) => {
      const fixedUrl = sanitizeGoogleFontsUrl(url);
      return `${prefix}${fixedUrl}${suffix}`;
    },
  );

  // 3. Fix CSS custom property font values (--font-heading, --font-body, --font-mono)
  result = result.replace(
    /(--font-(?:heading|body|mono)\s*:\s*)([^;}\n]+)/g,
    (_match, prop: string, value: string) => {
      const fixedValue = sanitizeFontCssValue(value);
      return `${prop}${fixedValue}`;
    },
  );

  return result;
}

/** Parse and fix individual font families in a Google Fonts CSS2 URL */
function sanitizeGoogleFontsUrl(url: string): string {
  // Extract family params: family=Font+Name:wght@400;700 or family=Font+Name
  const familyRegex = /family=([^&]+)/g;
  let fixedUrl = url;
  const replacements: Array<[string, string]> = [];

  let familyMatch;
  while ((familyMatch = familyRegex.exec(url)) !== null) {
    const rawParam = familyMatch[1];
    // Could have multiple families separated by &family= — each match is one family
    // Format: Font+Name:ital,wght@0,400;1,700 or just Font+Name
    const colonIdx = rawParam.indexOf(':');
    const encodedName = colonIdx !== -1 ? rawParam.slice(0, colonIdx) : rawParam;
    const suffix = colonIdx !== -1 ? rawParam.slice(colonIdx) : '';
    const fontName = decodeURIComponent(encodedName.replace(/\+/g, ' '));

    const validated = validateFontName(fontName);
    if (validated !== fontName) {
      if (validated === null) {
        // Invalid font — remove this family param entirely
        replacements.push([`family=${rawParam}`, '']);
      } else {
        const newEncoded = validated.replace(/ /g, '+');
        replacements.push([`family=${rawParam}`, `family=${newEncoded}${suffix}`]);
      }
    }
  }

  for (const [from, to] of replacements) {
    fixedUrl = fixedUrl.replace(from, to);
  }

  // Clean up leftover && or trailing/leading &
  fixedUrl = fixedUrl.replace(/&&+/g, '&').replace(/\?&/, '?').replace(/&$/, '');

  return fixedUrl;
}

/** Validate a single font name. Returns canonical name, aliased name, or null if invalid. */
function validateFontName(name: string): string | null {
  const key = name.toLowerCase().trim();

  const canonical = GOOGLE_FONTS_CANONICAL.get(key);
  if (canonical) return canonical;

  const alias = FONT_ALIASES.get(key);
  if (alias) return alias;

  console.warn(`Font "${name}" not found in Google Fonts catalog, removing from URL`);
  return null;
}

/** Fix font names in a CSS custom property value like "'Playfair Display', serif" */
function sanitizeFontCssValue(value: string): string {
  // Parse comma-separated font stack: 'Font Name', sans-serif
  const parts = value.split(',').map(p => p.trim());
  const fixedParts: string[] = [];

  for (const part of parts) {
    // Strip quotes to get the font name
    const unquoted = part.replace(/^['"]|['"]$/g, '').trim();

    // Generic families pass through
    if (['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-serif', 'ui-sans-serif', 'ui-monospace'].includes(unquoted)) {
      fixedParts.push(part);
      continue;
    }

    // Validate against catalog
    const key = unquoted.toLowerCase();
    const canonical = GOOGLE_FONTS_CANONICAL.get(key);
    if (canonical) {
      fixedParts.push(`'${canonical}'`);
      continue;
    }

    const alias = FONT_ALIASES.get(key);
    if (alias) {
      fixedParts.push(`'${alias}'`);
      continue;
    }

    // Check curated list as last resort
    const curated = FONT_LOOKUP.get(key);
    if (curated) {
      fixedParts.push(`'${curated}'`);
      continue;
    }

    // Not a valid Google Font — keep as-is (could be a system font)
    fixedParts.push(part);
  }

  return fixedParts.join(', ');
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

/** Check if a font name exists in the full Google Fonts catalog */
export function isValidGoogleFont(name: string): boolean {
  return GOOGLE_FONTS_SET.has(name.toLowerCase().trim());
}
