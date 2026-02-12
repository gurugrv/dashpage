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

  // Link interception script for multi-page navigation via postMessage
  const linkInterceptScript = `<script>
document.addEventListener('click', function(e) {
  var anchor = e.target.closest('a');
  if (!anchor) return;
  var href = anchor.getAttribute('href');
  if (!href || href.startsWith('#') || href.startsWith('http') || href.startsWith('//') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
  if (href.endsWith('.html')) {
    e.preventDefault();
    parent.postMessage({ type: 'page-navigate', page: href }, '*');
  }
});
</script>`;

  if (cssFiles.length === 0 && jsFiles.length === 0) {
    // Still need to inject link interception even without asset files
    const bodyClose = html.lastIndexOf('</body>');
    if (bodyClose !== -1) {
      return `${html.slice(0, bodyClose)}${linkInterceptScript}\n${html.slice(bodyClose)}`;
    }
    return `${html}${linkInterceptScript}`;
  }

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

  // Inject link interception for multi-page navigation
  const bodyClose = result.lastIndexOf('</body>');
  if (bodyClose !== -1) {
    result = `${result.slice(0, bodyClose)}${linkInterceptScript}\n${result.slice(bodyClose)}`;
  } else {
    result = `${result}${linkInterceptScript}`;
  }

  return result;
}
