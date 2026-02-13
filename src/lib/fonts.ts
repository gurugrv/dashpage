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
    ],
  },
  {
    label: 'Geometric sans',
    fonts: [
      'Montserrat', 'Poppins', 'Raleway', 'Space Grotesk', 'Outfit', 'Syne',
      'Libre Franklin', 'Archivo', 'Jost', 'Exo 2', 'Quicksand', 'Urbanist',
      'Red Hat Display', 'Epilogue',
    ],
  },
  {
    label: 'Serif',
    fonts: [
      'Playfair Display', 'Lora', 'Merriweather', 'EB Garamond', 'Cormorant',
      'Spectral', 'DM Serif Display', 'Literata', 'Source Serif 4', 'Alegreya',
    ],
  },
  {
    label: 'Slab serif',
    fonts: ['Roboto Slab', 'Arvo', 'Aleo', 'Bitter', 'Zilla Slab'],
  },
  {
    label: 'Display',
    fonts: ['Oswald', 'Anton', 'Bebas Neue', 'Abril Fatface', 'Bricolage Grotesque'],
  },
  {
    label: 'Monospace',
    fonts: ['Space Mono', 'JetBrains Mono', 'Fira Code', 'IBM Plex Mono', 'Azeret Mono'],
  },
];

/** Flat list of all approved font names */
export const ALL_FONTS: string[] = FONT_CATEGORIES.flatMap((c) => c.fonts);

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
