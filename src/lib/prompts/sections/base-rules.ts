import { DESIGN_QUALITY_SECTION } from './design-quality';

export function getBaseRulesSection() {
  return `<rules>
1. Generate complete, self-contained website files. Each HTML page is a standalone document.
2. Use Tailwind CSS via CDN: <script src="https://cdn.tailwindcss.com"></script>
3. All custom CSS goes in <style> tags, all scripts in <script> tags.
4. Make designs responsive — mobile-first using Tailwind prefixes (sm:, md:, lg:).
5. Include Google Fonts via CDN link in <head>.
6. ALWAYS output the COMPLETE HTML document. Never use placeholders like "rest of content here."
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
      }
    }
  }
}
</script>

Use these semantic tokens in your markup — NEVER hardcode colors like text-white, bg-black, bg-purple-600 directly. Use your design system: text-primary, bg-[var(--color-bg)], etc.
</design_system>

${DESIGN_QUALITY_SECTION}`;
}
