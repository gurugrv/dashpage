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

interface SectionEntry {
  selector: string;
  summary: string;
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
    sections.push({ selector, summary });
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

/** Build a short summary: first heading text + element counts. */
function summarizeContent(inner: string): string {
  const parts: string[] = [];

  // First heading
  const headingMatch = inner.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i);
  if (headingMatch) {
    const text = headingMatch[1].replace(/<[^>]+>/g, '').trim();
    if (text) parts.push(`"${text.slice(0, 60)}"`);
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
 * Generate a lightweight structural manifest for the system prompt.
 * Small files are included in full; larger files get a structural summary.
 */
export function generateManifest(files: ProjectFiles): string {
  const entries: string[] = [];

  for (const [filename, content] of Object.entries(files)) {
    if (content.length <= SMALL_FILE_THRESHOLD) {
      entries.push(`<file name="${filename}" size="${content.length}">\n${content}\n</file>`);
      continue;
    }

    const tokens = extractDesignTokens(content);
    const sections = extractSections(content);

    let manifest = `<file name="${filename}" size="${content.length}">`;

    if (tokens.length > 0) {
      manifest += `\n  <design_tokens>\n${tokens.map((t) => `    ${t}`).join('\n')}\n  </design_tokens>`;
    }

    if (sections.length > 0) {
      manifest += `\n  <sections>\n${sections.map((s) => `    ${s.selector} — ${s.summary}`).join('\n')}\n  </sections>`;
    }

    manifest += '\n</file>';
    entries.push(manifest);
  }

  return entries.join('\n\n');
}
