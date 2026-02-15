import type { ProjectFiles } from '@/types';

/** Max file size (chars) to include in full instead of generating a manifest. */
const SMALL_FILE_THRESHOLD = 1000;

/**
 * Extract CSS custom properties from :root {} blocks.
 */
export function extractDesignTokens(html: string): string[] {
  const tokens: string[] = [];
  const rootBlockRe = /:root\s*\{([^}]+)\}/g;
  let rootMatch;

  while ((rootMatch = rootBlockRe.exec(html)) !== null) {
    const block = rootMatch[1];
    const propRe = /(--[\w-]+)\s*:\s*([^;]+)/g;
    let propMatch;
    while ((propMatch = propRe.exec(block)) !== null) {
      tokens.push(`${propMatch[1]}: ${propMatch[2].trim()}`);
    }
  }

  return tokens;
}

/**
 * Extract Google Fonts family names from <link> tags.
 * Handles both fonts.googleapis.com and fonts.bunny.net URLs.
 */
export function extractFonts(html: string): string[] {
  const fonts: string[] = [];
  const linkRe = /<link[^>]+href=["']([^"']*(?:fonts\.googleapis\.com|fonts\.bunny\.net)[^"']*)["'][^>]*>/gi;
  let match;

  while ((match = linkRe.exec(html)) !== null) {
    const url = match[1];
    // Parse family names from URL: ?family=Inter:wght@400;700&family=Playfair+Display
    const familyRe = /family=([^:&]+)/g;
    let familyMatch;
    while ((familyMatch = familyRe.exec(url)) !== null) {
      const name = decodeURIComponent(familyMatch[1].replace(/\+/g, ' ')).trim();
      if (name && !fonts.includes(name)) fonts.push(name);
    }
  }

  return fonts;
}

/**
 * Extract internal link targets from <nav> elements.
 * Returns filenames like ["index.html", "about.html"].
 */
export function extractNavLinks(html: string): string[] {
  const links: string[] = [];
  const navRe = /<nav[\s>]([\s\S]*?)<\/nav>/gi;
  let navMatch;

  while ((navMatch = navRe.exec(html)) !== null) {
    const navContent = navMatch[1];
    const hrefRe = /href=["']([^"'#]+\.html?)["']/gi;
    let hrefMatch;
    while ((hrefMatch = hrefRe.exec(navContent)) !== null) {
      // Normalize: strip leading ./ or /
      const target = hrefMatch[1].replace(/^\.?\//, '');
      if (target && !links.includes(target)) links.push(target);
    }
  }

  return links;
}

interface SectionEntry {
  selector: string;
  summary: string;
  navLinks?: string[];
}

/**
 * Extract structural sections (nav, header, section, footer, aside, main)
 * with their IDs/classes and a short content summary.
 */
export function extractSections(html: string): SectionEntry[] {
  const sections: SectionEntry[] = [];
  const tagRe = /<(nav|header|section|footer|aside|main)(\s[^>]*)?>([\s\S]*?)(?=<\/\1>)/gi;
  let match;

  while ((match = tagRe.exec(html)) !== null) {
    const tag = match[1].toLowerCase();
    const attrs = match[2] || '';
    const inner = match[3];

    // Build CSS selector from tag + id/class
    let selector = tag;
    const idMatch = attrs.match(/id=["']([^"']+)["']/);
    if (idMatch) selector += `#${idMatch[1]}`;
    const classMatch = attrs.match(/class=["']([^"']+)["']/);
    if (classMatch) {
      // Pick first 2 meaningful classes (skip Tailwind utilities)
      const meaningful = classMatch[1]
        .split(/\s+/)
        .filter((c) => !isTailwindUtility(c))
        .slice(0, 2);
      if (meaningful.length > 0) selector += `.${meaningful.join('.')}`;
    }

    const summary = summarizeContent(inner);
    const entry: SectionEntry = { selector, summary };

    // For nav elements, extract link targets
    if (tag === 'nav') {
      const navLinks = extractNavLinks(`<nav>${inner}</nav>`);
      if (navLinks.length > 0) entry.navLinks = navLinks;
    }

    sections.push(entry);
  }

  return sections;
}

/** Heuristic: Tailwind utilities are short and contain colons, brackets, or common prefixes. */
function isTailwindUtility(cls: string): boolean {
  if (cls.includes(':') || cls.includes('[') || cls.includes('/')) return true;
  const prefixes = [
    'flex', 'grid', 'hidden', 'block', 'inline', 'relative', 'absolute', 'fixed', 'sticky',
    'w-', 'h-', 'p-', 'px-', 'py-', 'pt-', 'pb-', 'pl-', 'pr-', 'm-', 'mx-', 'my-',
    'mt-', 'mb-', 'ml-', 'mr-', 'text-', 'font-', 'bg-', 'border', 'rounded', 'shadow',
    'gap-', 'space-', 'max-', 'min-', 'overflow', 'z-', 'opacity', 'transition', 'duration',
    'transform', 'translate', 'rotate', 'scale', 'cursor', 'select-', 'items-', 'justify-',
    'self-', 'col-', 'row-', 'order-', 'grow', 'shrink', 'basis-', 'top-', 'right-',
    'bottom-', 'left-', 'inset-', 'object-', 'aspect-',
  ];
  return prefixes.some((p) => cls.startsWith(p));
}

/** Build a short summary: headings + paragraph preview + element counts. */
function summarizeContent(inner: string): string {
  const parts: string[] = [];

  // Extract up to 3 headings (h1-h6)
  const headingRe = /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi;
  let headingMatch;
  let headingCount = 0;
  while ((headingMatch = headingRe.exec(inner)) !== null && headingCount < 3) {
    const level = headingMatch[1];
    const text = headingMatch[2].replace(/<[^>]+>/g, '').trim();
    if (text) {
      parts.push(`h${level}: "${text.slice(0, 60)}"`);
      headingCount++;
    }
  }

  // First paragraph preview
  const pMatch = inner.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
  if (pMatch) {
    const pText = pMatch[1].replace(/<[^>]+>/g, '').trim();
    if (pText && pText.length > 10) {
      parts.push(`p: "${pText.slice(0, 80)}${pText.length > 80 ? '...' : ''}"`);
    }
  }

  // Count notable child elements
  const counts: [string, RegExp][] = [
    ['nav links', /<a\s/gi],
    ['buttons', /<button[\s>]/gi],
    ['images', /<img[\s>]/gi],
    ['cards', /class="[^"]*card[^"]*"/gi],
    ['form fields', /<(?:input|textarea|select)[\s>]/gi],
  ];

  for (const [label, re] of counts) {
    const found = inner.match(re);
    if (found && found.length > 0) parts.push(`${found.length} ${label}`);
  }

  return parts.join(', ') || 'content block';
}

/**
 * Build a site-level overview block for multi-page sites.
 * Extracts design system from index.html, navigation map, and shared elements.
 */
export function extractSiteOverview(files: ProjectFiles): string {
  const fileNames = Object.keys(files);
  if (fileNames.length <= 1) return '';

  const indexHtml = files['index.html'] || '';
  const parts: string[] = [];

  // Design system from index.html
  const tokens = extractDesignTokens(indexHtml);
  const fonts = extractFonts(indexHtml);
  if (tokens.length > 0 || fonts.length > 0) {
    let ds = '<design_system>';
    if (tokens.length > 0) ds += `\n    Palette: ${tokens.slice(0, 7).join(', ')}`;
    if (fonts.length > 0) ds += `\n    Fonts: ${fonts.join(', ')}`;
    ds += '\n    CDN: Tailwind CSS';
    ds += '\n  </design_system>';
    parts.push(ds);
  }

  // Navigation map: union of all nav links across files
  const allNavLinks = new Set<string>();
  for (const content of Object.values(files)) {
    for (const link of extractNavLinks(content)) {
      allNavLinks.add(link);
    }
  }
  if (allNavLinks.size > 0) {
    parts.push(`<navigation>\n    ${[...allNavLinks].join(' ↔ ')}\n  </navigation>`);
  }

  // Shared elements: detect nav/footer that appear in multiple files
  const sharedParts: string[] = [];
  let navCount = 0;
  let footerCount = 0;
  for (const content of Object.values(files)) {
    if (/<nav[\s>]/i.test(content)) navCount++;
    if (/<footer[\s>]/i.test(content)) footerCount++;
  }
  if (navCount > 1) sharedParts.push(`nav (on ${navCount}/${fileNames.length} pages)`);
  if (footerCount > 1) sharedParts.push(`footer (on ${footerCount}/${fileNames.length} pages)`);
  if (sharedParts.length > 0) {
    parts.push(`<shared_elements>\n    All pages share: ${sharedParts.join(', ')}\n  </shared_elements>`);
  }

  if (parts.length === 0) return '';

  return `<site_overview>\n  ${parts.join('\n  ')}\n</site_overview>`;
}

/**
 * Generate a structural manifest for the system prompt.
 * Small files are included in full; larger files get a structural summary.
 * For multi-page sites, includes a site-level overview.
 */
export function generateManifest(files: ProjectFiles): { perFile: string; siteOverview: string } {
  const entries: string[] = [];

  for (const [filename, content] of Object.entries(files)) {
    if (content.length <= SMALL_FILE_THRESHOLD) {
      entries.push(`<file name="${filename}" size="${content.length}">\n${content}\n</file>`);
      continue;
    }

    const tokens = extractDesignTokens(content);
    const fonts = extractFonts(content);
    const sections = extractSections(content);

    let manifest = `<file name="${filename}" size="${content.length}">`;

    if (tokens.length > 0) {
      manifest += `\n  <design_tokens>\n${tokens.map((t) => `    ${t}`).join('\n')}\n  </design_tokens>`;
    }

    if (fonts.length > 0) {
      manifest += `\n  <fonts>${fonts.join(', ')}</fonts>`;
    }

    if (sections.length > 0) {
      manifest += `\n  <sections>\n${sections.map((s) => {
        let line = `    ${s.selector} — ${s.summary}`;
        if (s.navLinks && s.navLinks.length > 0) line += ` → [${s.navLinks.join(', ')}]`;
        return line;
      }).join('\n')}\n  </sections>`;
    }

    manifest += '\n</file>';
    entries.push(manifest);
  }

  return {
    perFile: entries.join('\n\n'),
    siteOverview: extractSiteOverview(files),
  };
}
