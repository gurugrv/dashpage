import * as cheerio from 'cheerio';
import type { ProjectFiles } from '@/types';

/** Max file size (chars) to include in full instead of generating a manifest. */
const SMALL_FILE_THRESHOLD = 4000;
/** Higher threshold for edit mode — AI already has context, include more detail. */
const EDIT_MODE_THRESHOLD = 12000;

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

interface BlockEntry {
  id: string;        // data-block value
  tag: string;       // nav, section, footer, etc.
  component?: string; // component name if this is a placeholder
  summary: string;
  snippet?: string;  // first ~200 chars of inner HTML (trimmed)
}

/**
 * Extract blocks from HTML: elements with data-block attributes and component placeholders.
 */
export function extractBlocks(html: string, componentNames: Set<string>): BlockEntry[] {
  const blocks: BlockEntry[] = [];

  // Check for component placeholders: <!-- @component:X -->
  const placeholderRe = /<!-- @component:(\S+) -->/g;
  let placeholderMatch;
  while ((placeholderMatch = placeholderRe.exec(html)) !== null) {
    const compName = placeholderMatch[1];
    blocks.push({
      id: compName,
      tag: 'component',
      component: compName,
      summary: `(shared component — edit _components/${compName}.html)`,
    });
  }

  // Extract data-block elements using Cheerio (handles nesting correctly)
  const $ = cheerio.load(html);
  $('nav, header, section, footer, aside, main').each((_i, el) => {
    const $el = $(el);
    const tag = (el as unknown as { tagName: string }).tagName.toLowerCase();
    const blockId = $el.attr('data-block');
    if (!blockId) return; // skip elements without data-block

    // Skip if this block is a component (already listed as placeholder)
    if (componentNames.has(blockId)) return;

    const inner = $el.html() || '';
    const summary = summarizeContent(inner);
    const trimmedInner = inner.trim();
    const snippet = trimmedInner.length > 200 ? trimmedInner.slice(0, 200) + '...' : trimmedInner;

    // For nav elements, extract link targets
    if (tag === 'nav') {
      const navLinks = extractNavLinks(`<nav>${inner}</nav>`);
      if (navLinks.length > 0) {
        blocks.push({ id: blockId, tag, summary: `${summary} -> [${navLinks.join(', ')}]`, snippet });
        return;
      }
    }

    blocks.push({ id: blockId, tag, summary, snippet });
  });

  return blocks;
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
export function generateManifest(files: ProjectFiles, options?: { editMode?: boolean }): { perFile: string; siteOverview: string } {
  const entries: string[] = [];
  const threshold = options?.editMode ? EDIT_MODE_THRESHOLD : SMALL_FILE_THRESHOLD;

  // Collect component names for block extraction
  const componentNames = new Set<string>();
  for (const filename of Object.keys(files)) {
    if (filename.startsWith('_components/')) {
      componentNames.add(filename.replace('_components/', '').replace('.html', ''));
    }
  }

  for (const [filename, content] of Object.entries(files)) {
    if (content.length <= threshold) {
      entries.push(`<file name="${filename}" size="${content.length}">\n${content}\n</file>`);
      continue;
    }

    const tokens = extractDesignTokens(content);
    const fonts = extractFonts(content);
    const blocks = extractBlocks(content, componentNames);

    let manifest = `<file name="${filename}" size="${content.length}">`;

    // For large files over threshold in edit mode, include <style> and <head> content
    // so the AI has design tokens and Tailwind config without needing readFile
    if (options?.editMode) {
      const headMatch = content.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
      if (headMatch) {
        manifest += `\n  <head_content>\n${headMatch[1].trim()}\n  </head_content>`;
      }
    }

    if (tokens.length > 0) {
      manifest += `\n  <design_tokens>\n${tokens.map((t) => `    ${t}`).join('\n')}\n  </design_tokens>`;
    }

    if (fonts.length > 0) {
      manifest += `\n  <fonts>${fonts.join(', ')}</fonts>`;
    }

    if (blocks.length > 0) {
      manifest += `\n  <blocks>\n${blocks.map((b) => {
        let line = `    ${b.id}`;
        if (b.component) line += ` (component:${b.component})`;
        line += ` — ${b.summary}`;
        if (b.snippet) line += `\n      preview: ${b.snippet}`;
        return line;
      }).join('\n')}\n  </blocks>`;
    }

    manifest += '\n</file>';
    entries.push(manifest);
  }

  return {
    perFile: entries.join('\n\n'),
    siteOverview: extractSiteOverview(files),
  };
}
