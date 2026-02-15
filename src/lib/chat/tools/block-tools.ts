import { tool } from 'ai';
import { z } from 'zod';
import * as cheerio from 'cheerio';
import type { ProjectFiles } from '@/types';

function availableFilesList(workingFiles: ProjectFiles): string {
  return Object.keys(workingFiles).join(', ') || 'none';
}

function availableBlocks($: cheerio.CheerioAPI): string {
  const blocks: string[] = [];
  $('[data-block]').each((_, el) => {
    blocks.push($(el).attr('data-block')!);
  });
  return blocks.length > 0 ? blocks.join(', ') : 'none (no data-block attributes found)';
}

// Check if a blockId matches a known component name
function isComponentBlock(blockId: string, workingFiles: ProjectFiles): string | null {
  for (const filename of Object.keys(workingFiles)) {
    if (!filename.startsWith('_components/')) continue;
    const componentName = filename.replace('_components/', '').replace('.html', '');
    if (componentName === blockId) return filename;
  }
  return null;
}

export function createBlockTools(workingFiles: ProjectFiles) {
  return {
    editBlock: tool({
      description:
        'Edit HTML by targeting a data-block ID (preferred) or CSS selector (fallback). ' +
        'Block IDs guarantee unique matches. For shared components (nav, footer), edit the file in _components/. ' +
        'Returns { success, file, content } on success.',
      inputSchema: z.object({
        file: z.string().describe('The filename to edit, e.g. "index.html" or "_components/main-nav.html"'),
        blockId: z.string().optional()
          .describe('Target a [data-block="X"] element. Mutually exclusive with selector.'),
        selector: z.string().optional()
          .describe('CSS selector for fine-grained targeting within a block. Mutually exclusive with blockId.'),
        action: z.enum([
          'replace', 'replaceInner', 'setText', 'setAttribute',
          'addClass', 'removeClass', 'remove',
          'insertBefore', 'insertAfter',
        ]).describe('The edit operation to perform'),
        content: z.string().optional()
          .describe('New HTML content (for replace, replaceInner, insertBefore, insertAfter)'),
        value: z.string().optional()
          .describe('New value (for setText, setAttribute)'),
        attr: z.string().optional()
          .describe('Attribute name (for setAttribute)'),
        className: z.string().optional()
          .describe('Class name (for addClass, removeClass)'),
      }),
      execute: async ({ file: rawFile, blockId, selector, action, content, value, attr, className }) => {
        const file = rawFile.replace(/^['"](.+)['"]$/, '$1');
        const source = workingFiles[file];

        if (!source) {
          // Check if targeting a component block in a page file
          if (blockId) {
            const componentFile = isComponentBlock(blockId, workingFiles);
            if (componentFile) {
              return {
                success: false as const,
                error: `Block "${blockId}" is a shared component. Edit "${componentFile}" instead — changes will apply to all pages.`,
              };
            }
          }
          return {
            success: false as const,
            error: `File "${file}" not found. Available files: ${availableFilesList(workingFiles)}`,
          };
        }

        // Validate: exactly one targeting mode
        if (blockId && selector) {
          return {
            success: false as const,
            error: 'Provide either blockId OR selector, not both.',
          };
        }
        if (!blockId && !selector) {
          return {
            success: false as const,
            error: 'Provide either blockId or selector to target an element.',
          };
        }

        const $ = cheerio.load(source, { decodeEntities: false });
        const cssSelector = blockId ? `[data-block="${blockId}"]` : selector!;
        const matched = $(cssSelector);

        if (matched.length === 0) {
          const blocks = availableBlocks($);
          // If blockId not found, check if it's a component
          if (blockId) {
            const componentFile = isComponentBlock(blockId, workingFiles);
            if (componentFile) {
              return {
                success: false as const,
                error: `Block "${blockId}" not found in "${file}". This is a shared component — edit "${componentFile}" instead.`,
              };
            }
          }
          return {
            success: false as const,
            error: `${blockId ? `Block "${blockId}"` : `Selector "${selector}"`} not found in "${file}". Available blocks: ${blocks}`,
          };
        }

        // Content-modifying actions require single element match (when using selector mode)
        const contentActions = ['replace', 'replaceInner', 'setText', 'insertBefore', 'insertAfter'];
        if (selector && contentActions.includes(action) && matched.length > 1) {
          return {
            success: false as const,
            error: `Selector "${selector}" matched ${matched.length} elements. ${action} requires exactly 1 match. Use a more specific selector.`,
          };
        }

        try {
          switch (action) {
            case 'replace': {
              if (!content) return { success: false as const, error: 'replace action requires "content" parameter.' };
              // If replacing a block, ensure data-block is preserved on new content
              if (blockId) {
                const $new = cheerio.load(content, { decodeEntities: false });
                const newRoot = $new('body').children().first();
                if (newRoot.length > 0 && !newRoot.attr('data-block')) {
                  newRoot.attr('data-block', blockId);
                  matched.replaceWith($new('body').html()!);
                } else {
                  matched.replaceWith(content);
                }
              } else {
                matched.replaceWith(content);
              }
              break;
            }
            case 'replaceInner':
              if (!content) return { success: false as const, error: 'replaceInner action requires "content" parameter.' };
              matched.html(content);
              break;
            case 'setText':
              if (value === undefined) return { success: false as const, error: 'setText action requires "value" parameter.' };
              matched.text(value);
              break;
            case 'setAttribute':
              if (!attr || value === undefined) return { success: false as const, error: 'setAttribute requires "attr" and "value" parameters.' };
              matched.attr(attr, value);
              break;
            case 'addClass':
              if (!className) return { success: false as const, error: 'addClass requires "className" parameter.' };
              matched.addClass(className);
              break;
            case 'removeClass':
              if (!className) return { success: false as const, error: 'removeClass requires "className" parameter.' };
              matched.removeClass(className);
              break;
            case 'remove':
              matched.remove();
              break;
            case 'insertBefore':
              if (!content) return { success: false as const, error: 'insertBefore requires "content" parameter.' };
              matched.before(content);
              break;
            case 'insertAfter':
              if (!content) return { success: false as const, error: 'insertAfter requires "content" parameter.' };
              matched.after(content);
              break;
          }

          const newHtml = $.html();
          workingFiles[file] = newHtml;
          return { success: true as const, file, content: newHtml };
        } catch (err) {
          return {
            success: false as const,
            error: `editBlock failed: ${err instanceof Error ? err.message : String(err)}`,
          };
        }
      },
    }),
  };
}
