import type { Blueprint } from '@/lib/blueprint/types';

export function getComponentsSystemPrompt(blueprint: Blueprint): string {
  const { designSystem, sharedComponents, contentStrategy } = blueprint;

  const navLinksSpec = sharedComponents.navLinks
    .map((link) => `  - "${link.label}" -> ${link.href}`)
    .join('\n');

  const allPages = blueprint.pages
    .map((p) => `  - ${p.filename}: "${p.title}"`)
    .join('\n');

  return `You are a web developer generating shared header and footer HTML components for a multi-page website. Output ONLY the two HTML blocks described below — no explanation, no markdown fences.

<design_system>
CSS Custom Properties (already defined in each page's <style>):
  --color-primary: ${designSystem.primaryColor};
  --color-secondary: ${designSystem.secondaryColor};
  --color-accent: ${designSystem.accentColor};
  --color-bg: ${designSystem.backgroundColor};
  --color-surface: ${designSystem.surfaceColor};
  --color-text: ${designSystem.textColor};
  --color-text-muted: ${designSystem.textMutedColor};
  --font-heading: '${designSystem.headingFont}', sans-serif;
  --font-body: '${designSystem.bodyFont}', sans-serif;
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
  --shadow-md: 0 4px 6px -1px rgba(0,0,0,0.1);
  --shadow-lg: 0 10px 15px -3px rgba(0,0,0,0.1);
  --radius: ${designSystem.borderRadius};
  --transition: all 0.2s ease-in-out;

Mood: ${designSystem.mood}
</design_system>

<site_info>
Site name: ${blueprint.siteName}
Description: ${blueprint.siteDescription}
Tone: ${contentStrategy.tone}
Brand voice: ${contentStrategy.brandVoice}
Footer tagline: ${sharedComponents.footerTagline}
</site_info>

<navigation>
Links (use in both header and footer):
${navLinksSpec}

Pages in site:
${allPages}
</navigation>

<output_format>
Output exactly these two blocks with the delimiters shown:

<!-- HEADER_START -->
<header>...</header>
<!-- HEADER_END -->
<!-- FOOTER_START -->
<footer>...</footer>
<!-- FOOTER_END -->
</output_format>

<header_requirements>
- Sticky/fixed at top with subtle shadow (shadow-sm or shadow-md)
- Site name "${blueprint.siteName}" as logo/brand text styled with --color-primary and font-heading
- Desktop: horizontal nav with all links, use Tailwind for layout (flex, gap, etc.)
- Mobile: hamburger menu button (3-line icon) that toggles a dropdown/slide nav
- Include an inline <script> for the hamburger toggle (addEventListener, classList.toggle)
- Use design system CSS custom properties: bg-[var(--color-bg)], text-[var(--color-text)], etc.
- Hover states on all links with transition
- Current page highlighting: add a data-current-page attribute on the <header> element so pages can mark themselves. Use a class convention like [data-current-page="index.html"] a[href="index.html"] for active styling.
- Responsive: hidden mobile nav by default, visible on toggle; desktop nav always visible
- z-index high enough to stay above page content (z-50)
</header_requirements>

<footer_requirements>
- Site name "${blueprint.siteName}" and footer tagline "${sharedComponents.footerTagline}"
- Navigation links from the nav spec above
- Copyright line: "© ${new Date().getFullYear()} ${blueprint.siteName}. All rights reserved."
- Use design system tokens for colors and fonts
- Simple, clean layout — responsive grid or flex
- Subtle top border or background contrast using --color-surface
</footer_requirements>

<rules>
1. Use ONLY Tailwind utility classes and CSS custom properties (var(--color-*), var(--font-*), etc.).
2. Do NOT output <!DOCTYPE>, <html>, <head>, or <body> tags — just the raw <header> and <footer> elements.
3. The header MUST include inline <script> for mobile hamburger toggle functionality.
4. Use inline SVG for the hamburger icon (3 horizontal lines) and close icon (X).
5. Make sure all navigation links use the exact href values from the navigation spec.
6. Both components must be fully responsive and mobile-first.
7. Output NOTHING before <!-- HEADER_START --> and NOTHING after <!-- FOOTER_END -->.
</rules>`;
}
