import type { ProjectFiles } from '@/types';

/**
 * Returns sorted list of HTML page filenames from a ProjectFiles map.
 * index.html always comes first.
 */
export function getHtmlPages(files: ProjectFiles): string[] {
  const pages = Object.keys(files).filter(f => f.endsWith('.html'));
  pages.sort((a, b) => {
    if (a === 'index.html') return -1;
    if (b === 'index.html') return 1;
    return a.localeCompare(b);
  });
  return pages;
}

/**
 * Combines a multi-file project into a single HTML string for iframe preview.
 * - Uses `activePage` as the base HTML (defaults to 'index.html')
 * - Inlines all .css files as <style> before </head>
 * - Inlines all .js files as <script> before </body>
 * - Single-file projects pass through unchanged
 */
export function combineForPreview(files: ProjectFiles, activePage = 'index.html'): string {
  const html = files[activePage];
  if (!html) return '';

  // Collect asset files
  const cssFiles = Object.keys(files).filter(f => f.endsWith('.css')).sort();
  const jsFiles = Object.keys(files).filter(f => f.endsWith('.js')).sort();

  if (cssFiles.length === 0 && jsFiles.length === 0) return html;

  let result = html;

  // Inline all CSS files
  if (cssFiles.length > 0) {
    const cssBlock = cssFiles
      .map(f => `/* ${f} */\n${files[f]}`)
      .join('\n\n');
    const headClose = result.lastIndexOf('</head>');
    if (headClose !== -1) {
      result = `${result.slice(0, headClose)}<style>\n${cssBlock}\n</style>\n${result.slice(headClose)}`;
    } else {
      result = `<style>\n${cssBlock}\n</style>\n${result}`;
    }
  }

  // Inline all JS files
  if (jsFiles.length > 0) {
    const jsBlock = jsFiles
      .map(f => `// ${f}\n${files[f]}`)
      .join('\n\n');
    const bodyClose = result.lastIndexOf('</body>');
    if (bodyClose !== -1) {
      result = `${result.slice(0, bodyClose)}<script>\n${jsBlock}\n</script>\n${result.slice(bodyClose)}`;
    } else {
      result = `${result}\n<script>\n${jsBlock}\n</script>`;
    }
  }

  return result;
}
