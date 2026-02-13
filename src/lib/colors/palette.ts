import chroma from 'chroma-js';

// --- Types ---

export type HarmonyType =
  | 'complementary'
  | 'analogous'
  | 'triadic'
  | 'split-complementary'
  | 'tetradic';

export type SchemeType = 'light' | 'dark';

export type ContrastLevel = 'AAA' | 'AA' | 'FAIL';

export interface ContrastCheck {
  ratio: number;
  level: ContrastLevel;
}

export interface ColorPalette {
  primary: string;
  secondary: string;
  accent: string;
  bg: string;
  surface: string;
  text: string;
  textMuted: string;
}

export interface PaletteResult {
  palette: ColorPalette;
  contrast: {
    textOnBg: ContrastCheck;
    textOnSurface: ContrastCheck;
    primaryOnBg: ContrastCheck;
    accentOnBg: ContrastCheck;
  };
  harmony: HarmonyType;
  scheme: SchemeType;
}

// --- Harmony offsets (hue rotation in degrees) ---

const HARMONY_OFFSETS: Record<HarmonyType, { secondary: number; accent: number }> = {
  complementary: { secondary: 180, accent: 180 },
  analogous: { secondary: 30, accent: -30 },
  triadic: { secondary: 120, accent: 240 },
  'split-complementary': { secondary: 150, accent: 210 },
  tetradic: { secondary: 90, accent: 180 },
};

// --- Core functions ---

function rotateHue(color: chroma.Color, degrees: number): chroma.Color {
  const [l, c, h] = color.lch();
  return chroma.lch(l, c, (h + degrees + 360) % 360);
}

function getContrastLevel(ratio: number): ContrastLevel {
  if (ratio >= 7) return 'AAA';
  if (ratio >= 4.5) return 'AA';
  return 'FAIL';
}

function checkContrast(fg: string, bg: string): ContrastCheck {
  const ratio = Math.round(chroma.contrast(fg, bg) * 100) / 100;
  return { ratio, level: getContrastLevel(ratio) };
}

function generateNeutrals(primaryHue: number, scheme: SchemeType) {
  // Neutrals carry a subtle tint of the primary hue for cohesion
  if (scheme === 'light') {
    return {
      bg: chroma.lch(97, 2, primaryHue).hex(),
      surface: chroma.lch(100, 0, primaryHue).hex(), // pure white
      text: chroma.lch(15, 3, primaryHue).hex(),
      textMuted: chroma.lch(45, 5, primaryHue).hex(),
    };
  }

  // dark scheme
  return {
    bg: chroma.lch(10, 2, primaryHue).hex(),
    surface: chroma.lch(15, 3, primaryHue).hex(),
    text: chroma.lch(93, 2, primaryHue).hex(),
    textMuted: chroma.lch(60, 5, primaryHue).hex(),
  };
}

function adjustAccentLightness(color: chroma.Color, scheme: SchemeType): chroma.Color {
  // Ensure accent has enough contrast against the background
  const [l, c, h] = color.lch();
  if (scheme === 'light') {
    // For light scheme, accent should be medium-dark (L: 35-55)
    const targetL = Math.min(Math.max(l, 35), 55);
    return chroma.lch(targetL, Math.max(c, 40), h);
  }
  // For dark scheme, accent should be medium-light (L: 55-75)
  const targetL = Math.min(Math.max(l, 55), 75);
  return chroma.lch(targetL, Math.max(c, 40), h);
}

// --- Main export ---

export function generatePalette(
  baseColor: string,
  harmony: HarmonyType,
  scheme: SchemeType = 'light',
): PaletteResult {
  const base = chroma(baseColor);
  const [, , primaryHue] = base.lch();
  const offsets = HARMONY_OFFSETS[harmony];

  const secondary = rotateHue(base, offsets.secondary);
  const rawAccent = rotateHue(base, offsets.accent);
  const accent = adjustAccentLightness(rawAccent, scheme);

  const neutrals = generateNeutrals(primaryHue, scheme);

  const palette: ColorPalette = {
    primary: base.hex(),
    secondary: secondary.hex(),
    accent: accent.hex(),
    ...neutrals,
  };

  return {
    palette,
    contrast: {
      textOnBg: checkContrast(palette.text, palette.bg),
      textOnSurface: checkContrast(palette.text, palette.surface),
      primaryOnBg: checkContrast(palette.primary, palette.bg),
      accentOnBg: checkContrast(palette.accent, palette.bg),
    },
    harmony,
    scheme,
  };
}
