import type { Blueprint, BlueprintPage } from '@/lib/blueprint/types';

interface SharedHtml {
  headerHtml?: string;
  footerHtml?: string;
}

export function getPageSystemPrompt(
  blueprint: Blueprint,
  page: BlueprintPage,
  sharedHtml?: SharedHtml,
): string {
  const { designSystem, sharedComponents, contentStrategy } = blueprint;

  const navLinksSpec = sharedComponents.navLinks
    .map((link) => `  - "${link.label}" -> ${link.href}`)
    .join('\n');

  const sectionsList = page.sections
    .map((s, i) => `  ${i + 1}. [${s.id}] ${s.name}: ${s.description}${s.contentNotes ? ` (Notes: ${s.contentNotes})` : ''}`)
    .join('\n');

  const hasSharedHeader = !!sharedHtml?.headerHtml;
  const hasSharedFooter = !!sharedHtml?.footerHtml;

  const headerSection = hasSharedHeader
    ? `<shared_header>
Embed this header HTML VERBATIM at the start of <body> (do NOT modify it):
${sharedHtml!.headerHtml}
</shared_header>`
    : `<header_spec>
Generate a responsive header with:
- Site name "${blueprint.siteName}" as logo/brand text (styled with --color-primary and font-heading)
- Desktop: horizontal nav with all links from shared_navigation, highlight current page (${page.filename})
- Mobile: hamburger menu button that toggles a dropdown/slide nav (include the JS)
- Use design system tokens: bg-[var(--color-bg)], text-[var(--color-text)], etc.
- Sticky/fixed at top with subtle shadow
ALL pages in this site use these EXACT same nav links, so keep the structure consistent.
</header_spec>`;

  const footerSection = hasSharedFooter
    ? `<shared_footer>
Embed this footer HTML VERBATIM at the end of <body> (do NOT modify it):
${sharedHtml!.footerHtml}
</shared_footer>`
    : `<footer_spec>
Generate a footer with:
- Site name and footer tagline
- Navigation links from shared_navigation
- Copyright line with current year
- Use design system tokens for colors
Keep the footer structure simple and consistent — all pages share the same footer.
</footer_spec>`;

  const headerRequirement = hasSharedHeader
    ? '3. Embed the shared header HTML VERBATIM at the start of <body> — do not modify it in any way.'
    : '3. Generate header per header_spec at start of <body>.';

  const footerRequirement = hasSharedFooter
    ? '5. Embed the shared footer HTML VERBATIM at the end of <body> — do not modify it in any way.'
    : '5. Generate footer per footer_spec at end of <body>.';

  return `You are a web developer generating a single HTML page from a site blueprint. Output ONLY the complete HTML document — no explanation, no markdown fences.

<design_system>
CSS Custom Properties to define in <style>:
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

<page_spec>
Filename: ${page.filename}
Title: ${page.title}
Meta Description: ${page.description}
Purpose: ${page.purpose}

Sections (generate in this order):
${sectionsList}
</page_spec>

<shared_navigation>
Site name: ${blueprint.siteName}
Navigation links (use in BOTH header and footer):
${navLinksSpec}
Footer tagline: ${sharedComponents.footerTagline}
</shared_navigation>

<content_strategy>
Tone: ${contentStrategy.tone}
Target Audience: ${contentStrategy.targetAudience}
Primary CTA: ${contentStrategy.primaryCTA}
Brand Voice: ${contentStrategy.brandVoice}
</content_strategy>

${headerSection}

${footerSection}

<requirements>
1. Output a COMPLETE <!DOCTYPE html> document.
2. In <head>: charset, viewport, <title>, meta description, Tailwind CDN, Google Fonts for ${designSystem.headingFont} and ${designSystem.bodyFont}, <style> with ALL CSS custom properties, Tailwind config extending theme with tokens.
${headerRequirement}
4. Generate ALL sections listed in page_spec with realistic content. No Lorem ipsum.
${footerRequirement}
6. Use Tailwind + design tokens. Responsive mobile-first. Hover/transition on all interactive elements.
7. Use Unsplash images (https://images.unsplash.com/photo-{id}?w={width}&h={height}&fit=crop). Inline SVGs for icons.
</requirements>

Output ONLY the HTML.`;
}
