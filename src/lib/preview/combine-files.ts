import type { ProjectFiles } from '@/types';
import { sanitizeFontsInHtml } from '@/lib/fonts';

/**
 * Returns sorted list of HTML page filenames from a ProjectFiles map.
 * index.html always comes first.
 */
export function getHtmlPages(files: ProjectFiles): string[] {
  const pages = Object.keys(files).filter(f => f.endsWith('.html') && !f.startsWith('_components/'));
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
  let raw = files[activePage];
  if (!raw) return '';

  // Inject shared components: replace <!-- @component:X --> with _components/X.html content
  // Multi-pass: components may contain nested placeholders (e.g. header containing nav placeholder)
  for (let pass = 0; pass < 3; pass++) {
    let replaced = false;
    for (const [filename, content] of Object.entries(files)) {
      if (!filename.startsWith('_components/')) continue;
      const componentName = filename.replace('_components/', '').replace('.html', '');
      const placeholder = `<!-- @component:${componentName} -->`;
      if (raw.includes(placeholder)) {
        raw = raw.replace(placeholder, content);
        replaced = true;
      }
    }
    if (!replaced) break;
  }

  // Validate font names against the full Google Fonts catalog before rendering
  const html = sanitizeFontsInHtml(raw);

  // Collect asset files
  const cssFiles = Object.keys(files).filter(f => f.endsWith('.css')).sort();
  const jsFiles = Object.keys(files).filter(f => f.endsWith('.js')).sort();

  // Link interception script for navigation inside srcdoc iframe
  // Handles: #hash (scroll within page), page.html (multi-page nav),
  // page.html#hash (nav + scroll), external (open in new tab)
  const linkInterceptScript = `<script>
document.addEventListener('click', function(e) {
  var anchor = e.target.closest('a');
  if (!anchor) return;
  var href = anchor.getAttribute('href');
  if (!href || href.startsWith('mailto:') || href.startsWith('tel:')) return;
  // External links: open in new tab to avoid navigating the iframe away
  if (href.startsWith('http') || href.startsWith('//')) {
    e.preventDefault();
    window.open(anchor.href, '_blank', 'noopener');
    return;
  }
  // Hash-only links: scroll within the current page (srcdoc breaks native # behavior)
  if (href.startsWith('#')) {
    e.preventDefault();
    var id = href.slice(1);
    var target = id ? document.getElementById(id) : null;
    if (target) target.scrollIntoView({ behavior: 'smooth' });
    else if (!id) window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  // Multi-page links: page.html or page.html#hash
  var hashIdx = href.indexOf('#');
  var page = hashIdx !== -1 ? href.slice(0, hashIdx) : href;
  var hash = hashIdx !== -1 ? href.slice(hashIdx) : '';
  if (page.endsWith('.html')) {
    e.preventDefault();
    parent.postMessage({ type: 'page-navigate', page: page, hash: hash }, '*');
  }
});
</script>`;

  // CSP: sandbox uses allow-same-origin for reliable external resource loading (fonts, CDNs).
  // This meta CSP mitigates the security impact by restricting connect-src (fetch/XHR) to
  // HTTPS only — blocking same-origin HTTP requests to the parent's API routes (e.g. /api/keys).
  const cspMeta = `<meta http-equiv="Content-Security-Policy" content="connect-src https: data: blob:;">`;

  // FOUT prevention: hide body via <head> style, reveal once fonts loaded (injected into <head>)
  // CSS-only fallback animation reveals body after 500ms even if JS reveal script fails
  // (e.g. truncated HTML where </body> is missing and scripts get swallowed by open elements)
  const fontReadyHeadStyle = `${cspMeta}\n<style>body{opacity:0}body.__fonts-ready{opacity:1;transition:opacity .1s ease-in}@keyframes __fout-fb{to{opacity:1}}body:not(.__fonts-ready){animation:__fout-fb .1s ease-in .5s both}</style>`;
  // Reveal script (injected before </body>)
  const fontReadyRevealScript = `<script>(function(){function show(){document.body.classList.add('__fonts-ready')}document.fonts.ready.then(show);setTimeout(show,500)})()</script>`;

  // Section highlight script - listens for build-phase messages and pulses the relevant section
  const sectionHighlightScript = `<style>
@keyframes __build-glow{
  0%,100%{outline-color:rgba(59,130,246,.7);box-shadow:0 0 0 3px rgba(59,130,246,.12),0 0 12px rgba(59,130,246,.18)}
  50%{outline-color:rgba(59,130,246,.25);box-shadow:0 0 0 5px rgba(59,130,246,.2),0 0 24px rgba(59,130,246,.3)}
}
.__build-hl{outline:2.5px solid rgba(59,130,246,.7);outline-offset:4px;animation:__build-glow 1.5s ease-in-out infinite;border-radius:inherit;position:relative;z-index:1}
</style>
<script>
(function(){
  var map={
    navigation:'nav,header',
    footer:'footer',
    content:'main,[role=main],section:last-of-type',
    'body-started':'body>:first-child',
    scripts:'body',
    'edit-applying':'main,body>:first-child',
    'edit-started':'main,body>:first-child'
  };
  window.addEventListener('message',function(e){
    if(!e.data||e.data.type!=='build-phase')return;
    document.querySelectorAll('.__build-hl').forEach(function(el){el.classList.remove('__build-hl')});
    var sel=map[e.data.phase];
    if(sel){try{document.querySelectorAll(sel).forEach(function(el){el.classList.add('__build-hl')})}catch(x){}}
  });
})();
</script>`;

  const helperScripts = fontReadyRevealScript + '\n' + sectionHighlightScript + '\n' + linkInterceptScript;

  if (cssFiles.length === 0 && jsFiles.length === 0) {
    let single = html;
    // Inject FOUT-prevention style into <head>
    const headClose = single.lastIndexOf('</head>');
    if (headClose !== -1) {
      single = `${single.slice(0, headClose)}${fontReadyHeadStyle}\n${single.slice(headClose)}`;
    } else {
      single = `${fontReadyHeadStyle}\n${single}`;
    }
    const bodyClose = single.lastIndexOf('</body>');
    if (bodyClose !== -1) {
      return `${single.slice(0, bodyClose)}${helperScripts}\n${single.slice(bodyClose)}`;
    }
    return `${single}${helperScripts}`;
  }

  let result = html;

  // Strip <link> and <script src> tags for files we're about to inline
  // (prevents 404s in srcdoc iframe where these files don't exist as URLs)
  const inlinedFiles = new Set([...cssFiles, ...jsFiles]);
  for (const f of inlinedFiles) {
    if (f.endsWith('.css')) {
      result = result.replace(new RegExp(`<link[^>]*href=["']${f}["'][^>]*/?>\\s*`, 'g'), '');
    } else if (f.endsWith('.js')) {
      result = result.replace(new RegExp(`<script[^>]*src=["']${f}["'][^>]*>\\s*</script>\\s*`, 'g'), '');
    }
  }

  // Inject FOUT-prevention style + inline CSS files into <head>
  {
    const cssBlock = cssFiles.length > 0
      ? `<style>\n${cssFiles.map(f => `/* ${f} */\n${files[f]}`).join('\n\n')}\n</style>\n`
      : '';
    const headClose = result.lastIndexOf('</head>');
    if (headClose !== -1) {
      result = `${result.slice(0, headClose)}${fontReadyHeadStyle}\n${cssBlock}${result.slice(headClose)}`;
    } else {
      result = `${fontReadyHeadStyle}\n${cssBlock}${result}`;
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

  // Inject helper scripts (section highlights + link interception)
  const bodyClose = result.lastIndexOf('</body>');
  if (bodyClose !== -1) {
    result = `${result.slice(0, bodyClose)}${helperScripts}\n${result.slice(bodyClose)}`;
  } else {
    result = `${result}${helperScripts}`;
  }

  return result;
}
