import * as cheerio from 'cheerio';
import type { DomOperation, DomOpResult } from '@/lib/parser/edit-operations/types';

/**
 * Apply an array of DOM operations to HTML using Cheerio.
 * Returns the modified HTML and per-operation results.
 * Applies all successful operations even if some fail (partial success).
 */
export function applyDomOperations(
  html: string,
  operations: DomOperation[],
): { html: string; results: DomOpResult[] } {
  const $ = cheerio.load(html);
  const results: DomOpResult[] = [];

  for (let i = 0; i < operations.length; i++) {
    const op = operations[i];
    try {
      const $el = $(op.selector);

      if ($el.length === 0) {
        // Provide helpful suggestions for failed selectors
        const tagName = op.selector.match(/^(\w+)/)?.[1];
        const similar = tagName
          ? $(tagName).toArray().map((el) => {
              const id = $(el).attr('id') ? `#${$(el).attr('id')}` : '';
              const cls = $(el).attr('class')
                ? `.${$(el).attr('class')!.split(/\s+/).slice(0, 2).join('.')}`
                : '';
              return `${tagName}${id}${cls}`;
            }).slice(0, 5)
          : [];
        const suggestion = similar.length > 0
          ? ` Similar elements: ${similar.join(', ')}`
          : '';
        results.push({
          index: i,
          success: false,
          error: `Selector "${op.selector}" matched 0 elements.${suggestion}`,
        });
        continue;
      }

      // For most actions, warn if selector matches multiple elements unexpectedly
      if ($el.length > 1 && op.action !== 'addClass' && op.action !== 'removeClass' && op.action !== 'replaceClass') {
        results.push({
          index: i,
          success: false,
          error: `Selector "${op.selector}" matched ${$el.length} elements. Use a more specific selector (add ID, class, or nth-child).`,
        });
        continue;
      }

      switch (op.action) {
        case 'setAttribute':
          if (!op.attr || op.value === undefined) {
            results.push({ index: i, success: false, error: 'setAttribute requires attr and value' });
            continue;
          }
          $el.attr(op.attr, op.value);
          break;

        case 'setText':
          if (op.value === undefined) {
            results.push({ index: i, success: false, error: 'setText requires value' });
            continue;
          }
          $el.text(op.value);
          break;

        case 'setHTML':
          if (op.value === undefined) {
            results.push({ index: i, success: false, error: 'setHTML requires value' });
            continue;
          }
          $el.html(op.value);
          break;

        case 'addClass':
          if (!op.value) {
            results.push({ index: i, success: false, error: 'addClass requires value' });
            continue;
          }
          $el.addClass(op.value);
          break;

        case 'removeClass':
          if (!op.value) {
            results.push({ index: i, success: false, error: 'removeClass requires value' });
            continue;
          }
          $el.removeClass(op.value);
          break;

        case 'replaceClass':
          if (!op.oldClass || !op.newClass) {
            results.push({ index: i, success: false, error: 'replaceClass requires oldClass and newClass' });
            continue;
          }
          $el.removeClass(op.oldClass).addClass(op.newClass);
          break;

        case 'remove':
          $el.remove();
          break;

        case 'insertAdjacentHTML':
          if (!op.position || op.value === undefined) {
            results.push({ index: i, success: false, error: 'insertAdjacentHTML requires position and value' });
            continue;
          }
          switch (op.position) {
            case 'beforebegin': $el.before(op.value); break;
            case 'afterbegin': $el.prepend(op.value); break;
            case 'beforeend': $el.append(op.value); break;
            case 'afterend': $el.after(op.value); break;
          }
          break;

        default:
          results.push({ index: i, success: false, error: `Unknown action: ${op.action}` });
          continue;
      }

      results.push({ index: i, success: true });
    } catch (err) {
      results.push({
        index: i,
        success: false,
        error: `Operation failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  return { html: $.html(), results };
}
