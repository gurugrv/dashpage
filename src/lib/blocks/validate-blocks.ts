import * as cheerio from 'cheerio';
import type { ProjectFiles } from '@/types';

const SEMANTIC_TAGS = new Set(['nav', 'header', 'main', 'section', 'footer', 'aside']);

/**
 * Ensure all top-level semantic elements in HTML files have data-block attributes.
 * Auto-assigns IDs based on tag + position for elements that lack them.
 * Mutates the files in place.
 * Returns list of auto-assigned block IDs for logging.
 */
export function validateBlocks(files: ProjectFiles): string[] {
  const autoAssigned: string[] = [];

  for (const [filename, content] of Object.entries(files)) {
    if (!filename.endsWith('.html') || filename.startsWith('_components/')) continue;

    const $ = cheerio.load(content, { decodeEntities: false });
    const usedIds = new Set<string>();
    let fileChanged = false;

    // Collect existing block IDs
    $('[data-block]').each((_, el) => {
      usedIds.add($(el).attr('data-block')!);
    });

    // Find semantic elements without data-block
    const candidates = $('body').find(
      [...SEMANTIC_TAGS].join(','),
    );

    const tagCounters = new Map<string, number>();

    candidates.each((_, el) => {
      const $el = $(el);
      if ($el.attr('data-block')) return; // already has one

      const tag = el.tagName?.toLowerCase() ?? 'section';
      if (!SEMANTIC_TAGS.has(tag)) return;

      // Generate ID: tag name, or tag-N if tag already used
      const count = (tagCounters.get(tag) ?? 0) + 1;
      tagCounters.set(tag, count);

      let id = tag;
      if (usedIds.has(id)) {
        id = `${tag}-${count}`;
      }
      // Handle remaining collisions
      while (usedIds.has(id)) {
        id = `${tag}-${tagCounters.get(tag)! + 1}`;
        tagCounters.set(tag, tagCounters.get(tag)! + 1);
      }

      $el.attr('data-block', id);
      usedIds.add(id);
      autoAssigned.push(`${filename}: ${tag} -> ${id}`);
      fileChanged = true;
    });

    if (fileChanged) {
      files[filename] = $.html();
    }
  }

  return autoAssigned;
}
