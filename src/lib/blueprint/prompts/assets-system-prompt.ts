import type { Blueprint } from '@/lib/blueprint/types';

interface ComponentHtml {
  headerHtml: string;
  footerHtml: string;
}

/**
 * System prompt for the shared assets generation step.
 * Generates styles.css (utility classes, animations, component styles)
 * and scripts.js (mobile menu, scroll reveal, interactions).
 *
 * Runs after components step so it can see the actual header/footer HTML
 * and generate matching styles and scripts.
 */
export function getAssetsSystemPrompt(
  blueprint: Blueprint,
  componentHtml?: ComponentHtml | null,
): string {
  const { designSystem, pages, contentStrategy } = blueprint;

  // Collect all interactive elements and motion intents from all pages
  const interactiveElements = new Set<string>();
  const motionIntents = new Set<string>();

  for (const page of pages) {
    for (const section of page.sections) {
      if (section.interactiveElement && section.interactiveElement !== 'none') {
        interactiveElements.add(section.interactiveElement);
      }
      if (section.motionIntent && section.motionIntent !== 'none') {
        motionIntents.add(section.motionIntent);
      }
    }
  }

  const componentBlock = componentHtml
    ? `<component_html>
The shared header and footer HTML have already been generated. Analyze them to understand
what CSS classes and JS functionality they need:

HEADER:
${componentHtml.headerHtml}

FOOTER:
${componentHtml.footerHtml}
</component_html>`
    : '';

  const pagesOverview = pages
    .map(p => {
      const interactions = p.sections
        .filter(s => s.interactiveElement && s.interactiveElement !== 'none')
        .map(s => s.interactiveElement);
      const motions = p.sections
        .filter(s => s.motionIntent && s.motionIntent !== 'none')
        .map(s => s.motionIntent);
      const extras: string[] = [];
      if (interactions.length) extras.push(`interactions: ${interactions.join(', ')}`);
      if (motions.length) extras.push(`motion: ${motions.join(', ')}`);
      return `- ${p.filename}: ${p.purpose}${extras.length ? ` [${extras.join('; ')}]` : ''}`;
    })
    .join('\n');

  return `You are generating shared CSS and JavaScript assets for a multi-page website. These files will be included in every page via <link> and <script> tags. Your goal is to CENTRALIZE all common styles and scripts so individual pages are lightweight.

<design_system>
CSS Custom Properties (already defined as :root variables — include them in styles.css):
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
Surface Treatment: ${designSystem.surfaceTreatment || 'clean'}
</design_system>

${componentBlock}

<site_overview>
Site: ${blueprint.siteName} — ${blueprint.siteDescription}
Tone: ${contentStrategy.tone}
Pages:
${pagesOverview}
${interactiveElements.size > 0 ? `\nInteractive elements needed across pages: ${[...interactiveElements].join(', ')}` : ''}
${motionIntents.size > 0 ? `\nMotion/animation intents across pages: ${[...motionIntents].join(', ')}` : ''}
</site_overview>

<output_format>
Call writeFiles ONCE with exactly two files using these EXACT filenames (with dots, not underscores):
  { "styles.css": "...", "scripts.js": "..." }

CRITICAL: Use "styles.css" and "scripts.js" as the key names — NOT "styles_css", "_styles_css", or any other variation.
Call writeFiles only ONCE — do NOT make multiple writeFiles calls.
You MUST use the writeFiles tool. Do NOT output code as text.
</output_format>

<styles_css_requirements>
The styles.css file must contain ALL of the following:

1. **:root variables** — all CSS custom properties from the design system above
2. **Base styles** — body, heading (h1-h6), link, and button base styles using the design tokens
3. **Utility classes** — reusable classes that pages will reference instead of inline styles:
   - Text color utilities: .text-primary, .text-muted, .text-accent, etc. using var(--color-*)
   - Background utilities: .bg-primary, .bg-surface, .bg-accent, etc.
   - Font utilities: .font-heading, .font-body
   - Common patterns you see repeated (analyze the component HTML for patterns)
4. **Animation keyframes** — all @keyframes needed by the site:
   - fadeIn, fadeInUp, fadeInDown, slideUp, slideDown (standard entrance animations)
   - Any custom animations needed for the interactive elements: ${[...interactiveElements].join(', ') || 'none'}
5. **Scroll reveal classes** — .reveal (hidden state) and .reveal.active (visible state) for scroll-triggered animations with configurable delay via CSS custom properties
6. **Component styles** — styles for common UI patterns across pages:
   - Card styles (.card, .card-hover)
   - Button variants (.btn, .btn-primary, .btn-outline, .btn-accent)
   - Section spacing (.section, .section-lg)
   - Container widths
7. **Header/footer styles** — styles that the shared components need (analyze the component HTML)

Keep the CSS clean, well-organized with comments separating sections. Use the design tokens everywhere — no hardcoded colors.
Do NOT include Tailwind CDN or Google Fonts imports — those are handled separately in the <head> tags.
</styles_css_requirements>

<scripts_js_requirements>
The scripts.js file must contain ALL of the following:

1. **Mobile menu toggle** — hamburger menu open/close with:
   - Toggle button click handler (querySelector for common patterns: [data-menu-toggle], .mobile-menu-btn)
   - Aria-expanded attribute toggling
   - Body scroll lock when menu is open
   - Close on escape key
   - Close on click outside
   - Close on window resize to desktop
2. **Scroll reveal system** — IntersectionObserver-based reveal:
   - Target elements with class .reveal or [data-reveal]
   - Add .active class when element enters viewport
   - Support staggered delays via data-reveal-delay="100" attribute
   - Configurable threshold (default 0.1)
   - Only trigger once (unobserve after reveal)
3. **Smooth scroll** — for anchor links (#section-id)
   - Account for fixed header height
4. **Active nav highlighting** — mark current page in navigation
   - Compare current filename to nav link hrefs
   - Add .active class to matching link
${interactiveElements.has('accordion') ? `5. **Accordion** — toggle FAQ/accordion items:
   - Click handler for [data-accordion-trigger]
   - Toggle [data-accordion-content] visibility with slide animation
   - Toggle aria-expanded
   - Optional: close others when one opens (data-accordion-group)` : ''}
${interactiveElements.has('tabs') ? `${interactiveElements.has('accordion') ? '6' : '5'}. **Tabs** — tab switching:
   - Click handler for [data-tab-trigger]
   - Show/hide [data-tab-content] panels
   - Update aria-selected
   - Keyboard arrow key navigation` : ''}
${interactiveElements.has('counter-animation') ? `${interactiveElements.has('accordion') && interactiveElements.has('tabs') ? '7' : interactiveElements.has('accordion') || interactiveElements.has('tabs') ? '6' : '5'}. **Counter animation** — animate numbers:
   - Target elements with [data-count-to] attribute
   - Animate from 0 to target value on scroll into view
   - Format with locale-appropriate separators
   - Duration ~2s with easeOutExpo curve` : ''}

Wrap everything in a DOMContentLoaded listener. Use event delegation where possible.
All selectors should use data-* attributes for JS hooks (not classes) to separate styling from behavior.
The code must be defensive — check for element existence before adding listeners.
</scripts_js_requirements>

<rules>
1. You MUST call writeFiles to deliver output — do NOT output code as text.
2. The styles.css MUST start with the :root variables block.
3. Do NOT include any HTML, <!DOCTYPE>, or <script> tags inside the CSS file.
4. Do NOT include any <style> tags inside the JavaScript file.
5. The JavaScript must work standalone — no external dependencies.
6. Use semantic class names (not .s1, .s2 — use .reveal, .card, .btn-primary, etc.).
7. Keep the files focused — only include what the site actually needs based on the page specs and component HTML.
</rules>`;
}
