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
        const similar: string[] = [];
        if (tagName) {
          $(tagName).toArray().slice(0, 8).forEach((el) => {
            const id = $(el).attr('id') ? `#${$(el).attr('id')}` : '';
            const cls = $(el).attr('class')
              ? `.${$(el).attr('class')!.split(/\s+/).slice(0, 3).join('.')}`
              : '';
            similar.push(`${tagName}${id}${cls}`);
          });
        }
        // If selector has a class/id, also try broader search
        if (similar.length === 0) {
          const idMatch = op.selector.match(/#([\w-]+)/);
          const classMatch = op.selector.match(/\.([\w-]+)/);
          if (idMatch) {
            $(`[id*="${idMatch[1]}"]`).toArray().slice(0, 5).forEach((el) => {
              similar.push(`${el.tagName}#${$(el).attr('id')}`);
            });
          }
          if (classMatch) {
            $(`[class*="${classMatch[1]}"]`).toArray().slice(0, 5).forEach((el) => {
              const cls = $(el).attr('class')!.split(/\s+/).slice(0, 3).join('.');
              similar.push(`${el.tagName}.${cls}`);
            });
          }
        }
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

      // For content-replacement actions (setText, setHTML, insertAdjacentHTML), require single-element match
      // to avoid accidentally overwriting multiple elements. Attribute/class/remove operations are safe on multiple.
      const singleTargetActions = new Set(['setText', 'setHTML', 'insertAdjacentHTML']);
      if ($el.length > 1 && singleTargetActions.has(op.action)) {
        results.push({
          index: i,
          success: false,
          error: `Selector "${op.selector}" matched ${$el.length} elements. Use a more specific selector (add ID, class, or nth-child) for ${op.action}.`,
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
