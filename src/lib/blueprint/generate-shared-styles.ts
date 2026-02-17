import type { BlueprintDesignSystem } from '@/lib/blueprint/types';

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

  // Encode font names for Google Fonts URL
  const fontsParam = [headingFont, bodyFont]
    .filter((f, i, arr) => arr.indexOf(f) === i) // dedupe if same font
    .map((f) => `family=${f.replace(/ /g, '+')}:wght@400;500;600;700`)
    .join('&');

  const stylesCss = `:root {
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
  --transition: all 0.2s ease-in-out;
}

body {
  font-family: var(--font-body);
  color: var(--color-text);
  background-color: var(--color-bg);
}

h1, h2, h3, h4, h5, h6 {
  font-family: var(--font-heading);
}`;

  const headTags = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?${fontsParam}&display=swap" rel="stylesheet">
<link rel="stylesheet" href="styles.css">
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
