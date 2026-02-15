import * as cheerio from 'cheerio';
import type { ProjectFiles } from '@/types';

interface ExtractedComponent {
  blockId: string;
  filename: string; // e.g. "_components/main-nav.html"
  content: string;
}

/**
 * Normalize HTML for similarity comparison: collapse whitespace, remove comments.
 */
function normalizeForComparison(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calculate similarity between two strings (0-1).
 * Character-level comparison for reasonable-length strings.
 */
function similarity(a: string, b: string): number {
  if (a === b) return 1;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;

  let matches = 0;
  const minLen = Math.min(a.length, b.length);
  for (let i = 0; i < minLen; i++) {
    if (a[i] === b[i]) matches++;
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

  // Only extract when 2+ pages and no components yet
  if (pageFiles.length < 2) return [];
  if (Object.keys(files).some(f => f.startsWith('_components/'))) return [];

  const extracted: ExtractedComponent[] = [];

  // Candidate tags for component extraction
  const componentTags = ['nav', 'footer'];

  for (const tag of componentTags) {
    // Collect the outerHTML of this tag from each page, keyed by data-block ID
    const blocksByPage: Array<{ page: string; blockId: string; outerHtml: string; normalized: string }> = [];

    for (const page of pageFiles) {
      const $ = cheerio.load(files[page]);
      const el = $(tag).first();
      if (el.length === 0) continue;

      const blockId = el.attr('data-block');
      if (!blockId) continue; // validateBlocks should have assigned one

      const outerHtml = $.html(el);
      blocksByPage.push({
        page,
        blockId,
        outerHtml,
        normalized: normalizeForComparison(outerHtml),
      });
    }

    // Need the element on all (or most) pages to qualify as shared
    if (blocksByPage.length < 2) continue;

    // Check similarity: compare all against the first page's version
    const reference = blocksByPage[0];
    const allSimilar = blocksByPage.every(
      b => similarity(reference.normalized, b.normalized) >= 0.9,
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
        files[entry.page] = $.html();
      }
    }
  }

  return extracted;
}
