import * as cheerio from 'cheerio';
import type { ProjectFiles } from '@/types';

interface ExtractedComponent {
  blockId: string;
  filename: string; // e.g. "_components/main-nav.html"
  content: string;
}

/**
 * Extract structural skeleton: tag names + structural attributes only.
 * Strips text nodes and non-structural attribute values so that two
 * navs with different link text but identical structure score high.
 */
function structuralSkeleton(html: string): string {
  return html
    // Remove comments
    .replace(/<!--[\s\S]*?-->/g, '')
    // Remove text between tags (keep only tags)
    .replace(/>[^<]+</g, '><')
    // Strip all attributes except class, id, data-block
    .replace(/<(\w+)(\s[^>]*)?>/g, (_match, tag, attrs) => {
      if (!attrs) return `<${tag}>`;
      const kept: string[] = [];
      const classMatch = attrs.match(/\bclass="([^"]*)"/);
      if (classMatch) kept.push(`class="${classMatch[1]}"`);
      const idMatch = attrs.match(/\bid="([^"]*)"/);
      if (idMatch) kept.push(`id="${idMatch[1]}"`);
      const blockMatch = attrs.match(/\bdata-block="([^"]*)"/);
      if (blockMatch) kept.push(`data-block="${blockMatch[1]}"`);
      return kept.length > 0 ? `<${tag} ${kept.join(' ')}>` : `<${tag}>`;
    })
    // Collapse whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calculate structural similarity between two HTML strings (0-1).
 * Compares tag skeletons so identical structures with different
 * text content (link labels, phone numbers, etc.) still match.
 */
function similarity(a: string, b: string): number {
  const skelA = structuralSkeleton(a);
  const skelB = structuralSkeleton(b);
  if (skelA === skelB) return 1;

  const maxLen = Math.max(skelA.length, skelB.length);
  if (maxLen === 0) return 1;

  let matches = 0;
  const minLen = Math.min(skelA.length, skelB.length);
  for (let i = 0; i < minLen; i++) {
    if (skelA[i] === skelB[i]) matches++;
  }
  return matches / maxLen;
}

/**
 * Detect duplicate nav/footer blocks across pages and extract to _components/.
 * Only runs when: 2+ pages, no _components/ files exist yet.
 * Mutates files in place: adds _components/ entries, replaces inline content with placeholders.
 * Returns list of extracted components.
 */
export function extractComponents(files: ProjectFiles): ExtractedComponent[] {
  const pageFiles = Object.keys(files).filter(
    f => f.endsWith('.html') && !f.startsWith('_components/'),
  );

  // Need at least 2 pages for component extraction
  if (pageFiles.length < 2) return [];

  const existingComponents = new Set(
    Object.keys(files).filter(f => f.startsWith('_components/')),
  );

  const extracted: ExtractedComponent[] = [];

  // Candidate tags for component extraction
  // Process outer elements first (header/footer) before inner ones (nav) to avoid
  // nested placeholders (e.g. nav extracted first leaves <!-- @component:nav --> inside header)
  const componentTags = ['header', 'footer', 'nav'];

  for (const tag of componentTags) {
    // Collect the outerHTML of this tag from each page, keyed by data-block ID
    const blocksByPage: Array<{ page: string; blockId: string; outerHtml: string }> = [];

    for (const page of pageFiles) {
      const $ = cheerio.load(files[page]);
      const el = $(tag).first();
      if (el.length === 0) continue;

      const blockId = el.attr('data-block');
      if (!blockId) continue; // validateBlocks should have assigned one

      // @ts-expect-error -- decodeEntities is a dom-serializer option not in CheerioOptions
      const outerHtml: string = $.html(el, { decodeEntities: false });
      blocksByPage.push({
        page,
        blockId,
        outerHtml,
      });
    }

    if (blocksByPage.length < 2) continue;

    // Check if a component already exists for this tag's blockId
    const existingBlockId = blocksByPage[0].blockId;
    const existingComponentFile = `_components/${existingBlockId}.html`;

    if (existingComponents.has(existingComponentFile)) {
      // Component already exists — inject placeholders into any new pages that have
      // a structurally similar element but haven't been componentized yet
      const canonicalHtml = files[existingComponentFile];
      for (const entry of blocksByPage) {
        // Skip pages that already have the placeholder
        if (files[entry.page].includes(`<!-- @component:${existingBlockId} -->`)) continue;

        // Check structural similarity against the canonical component
        if (similarity(canonicalHtml, entry.outerHtml) >= 0.9) {
          const $ = cheerio.load(files[entry.page]);
          const el = $(`[data-block="${entry.blockId}"]`);
          if (el.length > 0) {
            el.replaceWith(`<!-- @component:${existingBlockId} -->`);
            // @ts-expect-error -- decodeEntities is a dom-serializer option not in CheerioOptions
            files[entry.page] = $.html({ decodeEntities: false });
          }
        }
      }
      continue;
    }

    // No existing component — run full extraction logic
    const reference = blocksByPage[0];
    const allSimilar = blocksByPage.every(
      b => similarity(reference.outerHtml, b.outerHtml) >= 0.9,
    );

    if (!allSimilar) continue;

    // All pages have similar content for this tag — extract it
    const blockId = reference.blockId;
    const componentFilename = `_components/${blockId}.html`;

    // Use the first page's version as the canonical component
    extracted.push({
      blockId,
      filename: componentFilename,
      content: reference.outerHtml,
    });

    // Add component file
    files[componentFilename] = reference.outerHtml;

    // Replace inline content with placeholder in each page
    for (const entry of blocksByPage) {
      const $ = cheerio.load(files[entry.page]);
      const el = $(`[data-block="${entry.blockId}"]`);
      if (el.length > 0) {
        el.replaceWith(`<!-- @component:${blockId} -->`);
        // @ts-expect-error -- decodeEntities is a dom-serializer option not in CheerioOptions
        files[entry.page] = $.html({ decodeEntities: false });
      }
    }
  }

  return extracted;
}
