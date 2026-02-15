import type { Blueprint, BlueprintPage } from '@/lib/blueprint/types';
import { DESIGN_QUALITY_SECTION } from '@/lib/prompts/sections/design-quality';
import { UI_UX_GUIDELINES_SECTION } from '@/lib/prompts/sections/ui-ux-guidelines';

interface SharedHtml {
  headerHtml?: string;
  footerHtml?: string;
}

export function getPageSystemPrompt(
  blueprint: Blueprint,
  page: BlueprintPage,
  sharedHtml?: SharedHtml,
  headTags?: string,
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
  const isSinglePage = blueprint.pages.length === 1;

  const siteFactsBlock = blueprint.siteFacts
    ? `<site_facts>
These are verified business details from web research. Use them for address, phone, hours, social links, etc. Do NOT invent or guess details not listed here.
${blueprint.siteFacts.businessName ? `Business name: ${blueprint.siteFacts.businessName}` : ''}
${blueprint.siteFacts.address ? `Address: ${blueprint.siteFacts.address}` : ''}
${blueprint.siteFacts.phone ? `Phone: ${blueprint.siteFacts.phone}` : ''}
${blueprint.siteFacts.email ? `Email: ${blueprint.siteFacts.email}` : ''}
${blueprint.siteFacts.hours ? `Hours: ${blueprint.siteFacts.hours}` : ''}
${blueprint.siteFacts.services?.length ? `Services: ${blueprint.siteFacts.services.join(', ')}` : ''}
${blueprint.siteFacts.tagline ? `Tagline: ${blueprint.siteFacts.tagline}` : ''}
${blueprint.siteFacts.socialMedia ? `Social media: ${Object.entries(blueprint.siteFacts.socialMedia).map(([k, v]) => `${k}: ${v}`).join(', ')}` : ''}
${blueprint.siteFacts.additionalInfo ? `Additional info: ${blueprint.siteFacts.additionalInfo}` : ''}
</site_facts>

`
    : '';

  // Page position and sibling context for multi-page sites
  const pageIndex = blueprint.pages.findIndex(p => p.filename === page.filename);
  const totalPages = blueprint.pages.length;
  const siblingContext = blueprint.pages
    .filter(p => p.filename !== page.filename)
    .map(p => `- ${p.filename}: ${p.purpose}`)
    .join('\n');

  const headerSection = hasSharedHeader
    ? `<shared_header>
Embed this header HTML VERBATIM at the start of <body> (do NOT modify it):
${sharedHtml!.headerHtml}
</shared_header>`
    : isSinglePage
      ? `<header_spec>
Generate a responsive header with:
- Site name "${blueprint.siteName}" as logo/brand text (styled with --color-primary and font-heading)
- Navigation: use smooth-scroll anchor links to the page sections (e.g., #hero, #features, #contact) — NOT links to other .html files
- Mobile: hamburger menu button that toggles a dropdown/slide nav (include the JS)
- Use design system tokens: bg-[var(--color-bg)], text-[var(--color-text)], etc.
- Sticky/fixed at top with subtle shadow
</header_spec>`
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
    : isSinglePage
      ? `<footer_spec>
Generate a footer with:
- Site name and footer tagline
- Anchor links to key sections of the page
- Copyright line with current year
- Use design system tokens for colors
</footer_spec>`
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

  const designSystemSection = headTags
    ? `<shared_head>
Include these tags VERBATIM in <head> (do NOT generate your own CSS custom properties, Tailwind CDN, or Google Fonts setup):
${headTags}
</shared_head>

<design_system_reference>
Available CSS custom properties (defined in styles.css — do NOT redefine them):
  --color-primary, --color-secondary, --color-accent, --color-bg, --color-surface, --color-text, --color-text-muted
  --font-heading, --font-body
  --shadow-sm, --shadow-md, --shadow-lg
  --radius, --transition

Mood: ${designSystem.mood}
</design_system_reference>`
    : `<design_system>
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
  --transition: 0.2s ease-in-out;

Mood: ${designSystem.mood}
</design_system>`;

  const requirement2 = headTags
    ? '2. In <head>: charset, viewport, <title>, meta description, then the shared_head tags VERBATIM. Do NOT generate your own CSS custom properties, Tailwind CDN script, Google Fonts links, or Tailwind config — they are all provided in the shared head.'
    : `2. In <head>: charset, viewport, <title>, meta description, Tailwind CDN, Google Fonts for ${designSystem.headingFont} and ${designSystem.bodyFont}, <style> with ALL CSS custom properties, Tailwind config extending theme with tokens.`;

  const webSearchInstruction = blueprint.siteFacts
    ? `1. webSearch — shared site facts are provided in <site_facts> above. Use them for address, phone, hours, social links, etc. — do NOT re-search for those. Only call webSearch for page-specific details NOT covered by site facts (e.g., detailed menu items, team member bios, gallery content, embed codes, local area info). Do NOT search for generic design inspiration, layout ideas, or "examples of X".`
    : `1. webSearch — search when the site references a real business, person, place, or location. Look up their actual details (address, phone, hours, services, team, local info). Also search for embed codes or integration details. Do NOT search for generic design inspiration, layout ideas, or "examples of X" — use your own knowledge for those.`;

  return `You are a web developer generating a single HTML page from a site blueprint. You create distinctive, production-ready pages that look like they were designed by a professional, not generated by AI.

${designSystemSection}

${DESIGN_QUALITY_SECTION}

${UI_UX_GUIDELINES_SECTION}

<design_token_usage>
CRITICAL: Use the design system CSS custom properties EVERYWHERE in your markup. Never hardcode colors.
- Backgrounds: bg-[var(--color-bg)], bg-[var(--color-surface)], bg-[var(--color-primary)]
- Text: text-[var(--color-text)], text-[var(--color-text-muted)], text-[var(--color-primary)]
- Borders: border-[var(--color-primary)], border-[var(--color-surface)]
- Shadows: shadow-[var(--shadow-sm)], shadow-[var(--shadow-md)], shadow-[var(--shadow-lg)]
- Radius: rounded-[var(--radius)]
- Transitions: duration-200 ease-in-out (prefer transition-colors, transition-shadow, transition-transform; use transition-all when multiple properties change)

${blueprint.pages.length === 1
    ? 'This is a standalone single-page website. Make it complete and self-contained — include header, all sections, and footer in one cohesive page.'
    : 'This page is PART OF A MULTI-PAGE SITE. It must feel like it belongs to the same site as every other page — consistent color usage, typography, spacing rhythm, and visual personality across all pages.'}
</design_token_usage>

${totalPages > 1 ? `<site_context>
This is page ${pageIndex + 1} of ${totalPages} in the site.
Other pages in this site:
${siblingContext}

Ensure this page's visual weight and content depth matches its role. The homepage should feel like the front door; inner pages should reward the click.
</site_context>

` : ''}<page_spec>
Filename: ${page.filename}
Title: ${page.title}
Meta Description: ${page.description}
Purpose: ${page.purpose}

Sections (generate in this order):
${sectionsList}
</page_spec>

${hasSharedHeader && hasSharedFooter ? '' : isSinglePage
    ? `<site_info>
Site name: ${blueprint.siteName}
Footer tagline: ${sharedComponents.footerTagline}
Section IDs for anchor navigation: ${page.sections.map((s) => `#${s.id}`).join(', ')}
</site_info>`
    : `<shared_navigation>
Site name: ${blueprint.siteName}
Navigation links (use in BOTH header and footer):
${navLinksSpec}
Footer tagline: ${sharedComponents.footerTagline}
</shared_navigation>`}

${siteFactsBlock}<content_strategy>
Tone: ${contentStrategy.tone}
Target Audience: ${contentStrategy.targetAudience}
Primary CTA: ${contentStrategy.primaryCTA}
Brand Voice: ${contentStrategy.brandVoice}
</content_strategy>

${headerSection}

${footerSection}

<tool_workflow>
Call tools BEFORE writing the page. Parallel calls save steps:
${webSearchInstruction}
2. searchImages({ queries: [...all image needs...] }) + searchIcons({ queries: [...all icon needs...] }) (parallel) — gather all images and icons in one step
   - searchImages: pass ALL queries in one call. Use DIFFERENT queries per image. Choose orientation per query: landscape (heroes/banners), portrait (people/cards), square (avatars/thumbnails)
   - searchIcons: pass ALL queries in one call (e.g. queries: [{query:"hamburger menu"}, {query:"close"}, {query:"arrow right"}]). Use "outline" style for UI chrome, "solid" for emphasis
3. fetchUrl (if webSearch snippets need more detail — get full content from a result URL)
4. writeFile → generate the complete HTML page enriched with real data from search:
   writeFile({ filename: "${page.filename}", content: "<!DOCTYPE html>..." })
   The content MUST be a complete HTML document starting with <!DOCTYPE html>. Never use placeholders or abbreviated content.
   IMPORTANT: Always use writeFile (singular) for page generation — NOT writeFiles.

If a tool fails: use https://placehold.co/800x400/eee/999?text=Image for images, inline SVG for icons, your own knowledge for web content. Never let a tool failure halt generation.
</tool_workflow>

<requirements>
1. Output a COMPLETE <!DOCTYPE html> document.
${requirement2}
${headerRequirement}
4. Generate ALL sections listed in page_spec with realistic content. No Lorem ipsum.
${footerRequirement}
6. Use Tailwind + design tokens. Responsive mobile-first. Hover/transition on all interactive elements.
7. Available tools: writeFile, editDOM, editFiles, readFile, searchImages, searchIcons, webSearch, fetchUrl.
8. You MUST call writeFile to output the page — do NOT output raw HTML as text.
</requirements>`;
}
