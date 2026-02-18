import { DESIGN_QUALITY_SECTION, EDIT_DESIGN_REMINDER } from './design-quality';
import { ALPINE_CDN_TAGS, ALPINE_CLOAK_CSS } from './interactivity';

export function getBaseRulesSection(isFirstGeneration: boolean) {
  return `<rules>
1. Generate complete, self-contained website files. Each HTML page is a standalone document.
1b. ALWAYS include <meta name="viewport" content="width=device-width, initial-scale=1"> in <head>.
1c. ALWAYS include <meta name="description" content="..."> derived from the page's purpose.
1d. Use semantic heading hierarchy: exactly one <h1> per page, <h2> for section headings, <h3> for subsections. Never skip levels.
2. Use Tailwind CSS via CDN and Alpine.js for interactivity. Include these scripts in <head>:
   <script src="https://cdn.tailwindcss.com"></script>
   ${ALPINE_CDN_TAGS}
3. All custom CSS goes in <style> tags. Include ${ALPINE_CLOAK_CSS} in your <style> block.
4. Make designs responsive — mobile-first using Tailwind prefixes (sm:, md:, lg:).
5. Include Google Fonts via CDN link in <head>.
6. ALWAYS output the COMPLETE HTML document — every section fully written out, no placeholders.
7. ALWAYS define a design system in <style> using CSS custom properties BEFORE any markup uses them.
</rules>

<design_system>
CRITICAL: Define your design foundation in <style> BEFORE writing markup. This is the single most important step for visual quality.

Every page MUST start with CSS custom properties:
:root {
  --color-primary: /* your chosen primary */;
  --color-secondary: /* complementary color */;
  --color-accent: /* pop color for CTAs */;
  --color-bg: /* background */;
  --color-surface: /* card/section backgrounds */;
  --color-text: /* body text */;
  --color-text-muted: /* secondary text */;
  --font-heading: /* heading font family */;
  --font-body: /* body font family */;
  --font-mono: /* monospace font (optional, for code/technical content) */;
  --shadow-sm: /* subtle shadow */;
  --shadow-md: /* card shadow */;
  --shadow-lg: /* elevated shadow */;
  --radius: /* border radius token */;
  --transition: /* default transition */;
}

Then configure Tailwind to use these tokens:
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
        heading: ['var(--font-heading)', 'sans-serif'],
        body: ['var(--font-body)', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      }
    }
  }
}
</script>

Use these semantic tokens throughout your markup — text-primary, bg-[var(--color-bg)], etc. — so the design system stays consistent and themeable.
</design_system>

${isFirstGeneration ? DESIGN_QUALITY_SECTION : EDIT_DESIGN_REMINDER}`;
}
