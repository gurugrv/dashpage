import type { BlueprintDesignSystem } from '@/lib/blueprint/types';
import { ALPINE_CDN_TAGS, ALPINE_CLOAK_CSS } from '@/lib/prompts/sections/interactivity';

interface SharedStyles {
  stylesCss: string;
  headTags: string;
}

/**
 * Builds shared CSS custom properties and <head> tags from blueprint design system.
 * Pure utility — no AI call. Values are 100% deterministic from the design system object.
 *
 * - `stylesCss`: CSS custom properties in :root {} + body base styles (stored as styles.css)
 * - `headTags`: Google Fonts preconnect + stylesheet, Tailwind CDN script with config,
 *   <link> to styles.css (resolves in downloaded zip; 404s silently in srcdoc while
 *   combineForPreview inlines the CSS)
 */
export function generateSharedStyles(designSystem: BlueprintDesignSystem): SharedStyles {
  const {
    primaryColor,
    secondaryColor,
    accentColor,
    backgroundColor,
    surfaceColor,
    textColor,
    textMutedColor,
    headingFont,
    bodyFont,
    borderRadius,
  } = designSystem;

  // Use dynamic font weights if available, fallback for old blueprints
  const headingWeights = designSystem.fontWeights?.heading ?? [400, 600, 700];
  const bodyWeights = designSystem.fontWeights?.body ?? [400, 500, 600];

  // Merge and dedupe weights per font
  const fontsParam = [headingFont, bodyFont]
    .filter((f, i, arr) => arr.indexOf(f) === i) // dedupe if same font
    .map((f) => {
      const weights = f === headingFont
        ? [...new Set([...headingWeights, ...(f === bodyFont ? bodyWeights : [])])]
        : bodyWeights;
      return `family=${f.replace(/ /g, '+')}:wght@${weights.sort((a, b) => a - b).join(';')}`;
    })
    .join('&');

  const stylesCss = `html {
  scroll-behavior: smooth;
}

:root {
  --color-primary: ${primaryColor};
  --color-secondary: ${secondaryColor};
  --color-accent: ${accentColor};
  --color-bg: ${backgroundColor};
  --color-surface: ${surfaceColor};
  --color-text: ${textColor};
  --color-text-muted: ${textMutedColor};
  --font-heading: '${headingFont}', sans-serif;
  --font-body: '${bodyFont}', sans-serif;
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
  --shadow-md: 0 4px 6px -1px rgba(0,0,0,0.1);
  --shadow-lg: 0 10px 15px -3px rgba(0,0,0,0.1);
  --radius: ${borderRadius};
  --transition: transform 0.2s ease-in-out, opacity 0.2s ease-in-out;
  --transition-fast: transform 0.15s ease-in-out, opacity 0.15s ease-in-out;
  --transition-slow: transform 0.4s ease-out, opacity 0.4s ease-out;
}

body {
  font-family: var(--font-body);
  color: var(--color-text);
  background-color: var(--color-bg);
  overflow-x: hidden;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
}

h1, h2, h3, h4, h5, h6 {
  font-family: var(--font-heading);
  text-wrap: balance;
}

p {
  text-wrap: pretty;
}

${ALPINE_CLOAK_CSS}`;

  // headTags stays the same structure but uses dynamic weights
  const headTags = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?${fontsParam}&display=swap" rel="stylesheet">
<link rel="stylesheet" href="styles.css">
${ALPINE_CDN_TAGS}
<script src="https://cdn.tailwindcss.com"></script>
<script>
tailwind.config = {
  theme: {
    extend: {
      colors: {
        primary: 'var(--color-primary)',
        secondary: 'var(--color-secondary)',
        accent: 'var(--color-accent)',
      },
      fontFamily: {
        heading: 'var(--font-heading)',
        body: 'var(--font-body)',
      },
      borderRadius: {
        DEFAULT: 'var(--radius)',
      },
    },
  },
};
</script>`;

  return { stylesCss, headTags };
}
