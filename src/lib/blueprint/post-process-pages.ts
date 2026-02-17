import * as cheerio from 'cheerio';
import type { ProjectFiles } from '@/types';

/**
 * Post-process generated pages to remove duplication.
 * Runs server-side after all pages complete.
 * Mutates `files` in place.
 */
export function postProcessPages(files: ProjectFiles, headTags?: string): void {
  const htmlFiles = Object.keys(files).filter(
    f => f.endsWith('.html') && !f.startsWith('_components/'),
  );
  if (htmlFiles.length === 0) return;

  if (headTags) injectMissingHeadTags(files, htmlFiles, headTags);
  stripDuplicateHeadResources(files, htmlFiles);
  extractSharedStyles(files, htmlFiles);
  consolidateInlineStyles(files, htmlFiles);
  deduplicateScripts(files, htmlFiles);
}

/**
 * Pass 0: Inject missing head tags from shared headTags.
 * AI models sometimes omit the Google Fonts stylesheet link even when told
 * to include shared_head tags verbatim. This pass checks each page for
 * missing essential tags and injects them.
 */
function injectMissingHeadTags(files: ProjectFiles, htmlFiles: string[], headTags: string): void {
  // Parse individual tags from headTags string
  const tagEntries: { tag: string; detect: (html: string) => boolean }[] = [];

  // Google Fonts stylesheet link
  const fontsMatch = headTags.match(/<link[^>]*fonts\.googleapis\.com\/css2[^>]*>/);
  if (fontsMatch) {
    tagEntries.push({
      tag: fontsMatch[0],
      detect: (html) => html.includes('fonts.googleapis.com/css2'),
    });
  }

  // Preconnect to fonts.googleapis.com
  const preconnectGoogleMatch = headTags.match(/<link[^>]*preconnect[^>]*fonts\.googleapis\.com[^>]*>/);
  if (preconnectGoogleMatch) {
    tagEntries.push({
      tag: preconnectGoogleMatch[0],
      detect: (html) => /preconnect[^>]*fonts\.googleapis\.com/.test(html),
    });
  }

  // Preconnect to fonts.gstatic.com
  const preconnectGstaticMatch = headTags.match(/<link[^>]*preconnect[^>]*fonts\.gstatic\.com[^>]*>/);
  if (preconnectGstaticMatch) {
    tagEntries.push({
      tag: preconnectGstaticMatch[0],
      detect: (html) => /preconnect[^>]*fonts\.gstatic\.com/.test(html),
    });
  }

  // styles.css link
  const stylesCssMatch = headTags.match(/<link[^>]*href="styles\.css"[^>]*>/);
  if (stylesCssMatch) {
    tagEntries.push({
      tag: stylesCssMatch[0],
      detect: (html) => /href=["']styles\.css["']/.test(html),
    });
  }

  if (tagEntries.length === 0) return;

  for (const filename of htmlFiles) {
    const html = files[filename];
    const missingTags = tagEntries
      .filter(entry => !entry.detect(html))
      .map(entry => entry.tag);

    if (missingTags.length === 0) continue;

    // Insert missing tags after the last existing <link> or <meta> in <head>,
    // or right before </head> if nothing found
    const injection = '\n' + missingTags.join('\n');
    const headCloseIdx = html.indexOf('</head>');
    if (headCloseIdx !== -1) {
      files[filename] = html.slice(0, headCloseIdx) + injection + '\n' + html.slice(headCloseIdx);
    }
  }
}

/**
 * Pass 1: Strip duplicated head resources.
 * Removes duplicate Tailwind CDN scripts, Google Fonts links,
 * and <style> blocks containing :root variable redefinitions
 * (these are already in styles.css).
 */
function stripDuplicateHeadResources(files: ProjectFiles, htmlFiles: string[]): void {
  for (const filename of htmlFiles) {
    const $ = cheerio.load(files[filename]);

    // Remove duplicate Tailwind CDN scripts (keep the first one from headTags)
    const tailwindScripts = $('script[src*="tailwindcss"]');
    if (tailwindScripts.length > 1) {
      tailwindScripts.slice(1).remove();
    }

    // Remove duplicate Google Fonts links (keep the first one)
    const fontLinks = $('link[href*="fonts.googleapis.com"]');
    if (fontLinks.length > 1) {
      fontLinks.slice(1).remove();
    }

    // Remove duplicate preconnect links
    const preconnects = $('link[rel="preconnect"][href*="fonts"]');
    if (preconnects.length > 1) {
      const seen = new Set<string>();
      preconnects.each((_, el) => {
        const href = $(el).attr('href') ?? '';
        if (seen.has(href)) {
          $(el).remove();
        } else {
          seen.add(href);
        }
      });
    }

    // Remove <style> blocks that only contain :root variable redefinitions
    $('style').each((_, el) => {
      const css = $(el).text().trim();
      // If the style block is primarily :root { ... } with our variables, remove it
      const stripped = css
        .replace(/\/\*[\s\S]*?\*\//g, '') // remove comments
        .replace(/:root\s*\{[^}]*\}/g, '') // remove :root blocks
        .replace(/body\s*\{[^}]*font-family[^}]*\}/g, '') // remove body font reset
        .replace(/h[1-6]\s*(?:,\s*h[1-6])*\s*\{[^}]*font-family[^}]*\}/g, '') // remove heading font reset
        .trim();
      if (!stripped) {
        $(el).remove();
      }
    });

    // Remove duplicate tailwind.config scripts (keep the first one)
    const configScripts: ReturnType<typeof $>[] = [];
    $('script:not([src])').each((_, el) => {
      const text = $(el).text();
      if (text.includes('tailwind.config')) {
        configScripts.push($(el));
      }
    });
    if (configScripts.length > 1) {
      for (let i = 1; i < configScripts.length; i++) {
        configScripts[i].remove();
      }
    }

    // @ts-expect-error -- decodeEntities is a dom-serializer option
    files[filename] = $.html({ decodeEntities: false });
  }
}

/**
 * Pass 2: Extract duplicate <style> rules across pages.
 * CSS rules appearing in 2+ pages are moved to styles.css.
 */
function extractSharedStyles(files: ProjectFiles, htmlFiles: string[]): void {
  if (!files['styles.css']) return;

  // Collect all CSS rules from <style> blocks across pages
  const rulesByPage = new Map<string, Map<string, string>>(); // filename -> (normalized rule -> original rule)
  const ruleOccurrences = new Map<string, number>(); // normalized rule -> count of pages

  for (const filename of htmlFiles) {
    const $ = cheerio.load(files[filename]);
    const pageRules = new Map<string, string>();

    $('style').each((_, el) => {
      const css = $(el).text();
      const rules = extractCssRules(css);
      for (const rule of rules) {
        const normalized = normalizeCssRule(rule);
        if (!normalized) continue;
        pageRules.set(normalized, rule);
      }
    });

    rulesByPage.set(filename, pageRules);

    for (const normalized of pageRules.keys()) {
      ruleOccurrences.set(normalized, (ruleOccurrences.get(normalized) ?? 0) + 1);
    }
  }

  // Find rules that appear in 2+ pages
  const sharedRules: string[] = [];
  const sharedNormalized = new Set<string>();

  for (const [normalized, count] of ruleOccurrences) {
    if (count >= 2) {
      sharedNormalized.add(normalized);
      // Use the original rule from the first page that has it
      for (const [, pageRules] of rulesByPage) {
        if (pageRules.has(normalized)) {
          sharedRules.push(pageRules.get(normalized)!);
          break;
        }
      }
    }
  }

  if (sharedRules.length === 0) return;

  // Append shared rules to styles.css
  files['styles.css'] += '\n\n/* Shared page styles (extracted from duplicate <style> blocks) */\n' + sharedRules.join('\n\n');

  // Remove shared rules from individual page <style> blocks
  for (const filename of htmlFiles) {
    const $ = cheerio.load(files[filename]);

    $('style').each((_, el) => {
      const css = $(el).text();
      const rules = extractCssRules(css);
      const remaining = rules.filter(rule => {
        const normalized = normalizeCssRule(rule);
        return normalized && !sharedNormalized.has(normalized);
      });

      if (remaining.length === 0) {
        $(el).remove();
      } else {
        $(el).text(remaining.join('\n\n'));
      }
    });

    // @ts-expect-error -- decodeEntities
    files[filename] = $.html({ decodeEntities: false });
  }
}

/**
 * Pass 3: Convert repeated inline style="" patterns to CSS classes.
 * Detects patterns appearing 3+ times across all pages,
 * generates CSS classes, adds them to styles.css, and replaces inline styles.
 */
function consolidateInlineStyles(files: ProjectFiles, htmlFiles: string[]): void {
  if (!files['styles.css']) return;

  // Count inline style occurrences across all pages
  const styleOccurrences = new Map<string, number>();

  for (const filename of htmlFiles) {
    const $ = cheerio.load(files[filename]);
    $('[style]').each((_, el) => {
      const style = $(el).attr('style')?.trim();
      if (!style) return;
      const normalized = normalizeInlineStyle(style);
      styleOccurrences.set(normalized, (styleOccurrences.get(normalized) ?? 0) + 1);
    });
  }

  // Generate classes for patterns appearing 3+ times
  const styleToClass = new Map<string, string>();
  const generatedClasses: string[] = [];
  let classIndex = 0;

  for (const [normalized, count] of styleOccurrences) {
    if (count < 3) continue;

    const className = generateClassName(normalized, classIndex++);
    styleToClass.set(normalized, className);
    generatedClasses.push(`.${className} { ${denormalize(normalized)} }`);
  }

  if (generatedClasses.length === 0) return;

  // Add generated classes to styles.css
  files['styles.css'] += '\n\n/* Utility classes (extracted from repeated inline styles) */\n' + generatedClasses.join('\n');

  // Replace inline styles with class references
  for (const filename of htmlFiles) {
    const $ = cheerio.load(files[filename]);

    $('[style]').each((_, el) => {
      const style = $(el).attr('style')?.trim();
      if (!style) return;
      const normalized = normalizeInlineStyle(style);
      const className = styleToClass.get(normalized);
      if (!className) return;

      // Add class and remove inline style
      const existing = $(el).attr('class') ?? '';
      $(el).attr('class', (existing + ' ' + className).trim());
      $(el).removeAttr('style');
    });

    // @ts-expect-error -- decodeEntities
    files[filename] = $.html({ decodeEntities: false });
  }
}

/**
 * Pass 4: Extract duplicate JavaScript across pages into scripts.js.
 * Uses text-based similarity on normalized function bodies.
 */
function deduplicateScripts(files: ProjectFiles, htmlFiles: string[]): void {
  if (!files['scripts.js']) return;

  // Collect <script> blocks (non-src, non-tailwind-config) from each page
  const scriptOccurrences = new Map<string, { count: number; original: string }>();

  for (const filename of htmlFiles) {
    const $ = cheerio.load(files[filename]);

    $('script:not([src])').each((_, el) => {
      const text = $(el).text().trim();
      if (!text) return;
      if (text.includes('tailwind.config')) return; // Skip Tailwind config
      const normalized = normalizeScript(text);
      const existing = scriptOccurrences.get(normalized);
      if (existing) {
        existing.count++;
      } else {
        scriptOccurrences.set(normalized, { count: 1, original: text });
      }
    });
  }

  // Extract scripts appearing in 2+ pages
  const sharedScripts: string[] = [];
  const sharedNormalized = new Set<string>();

  for (const [normalized, { count, original }] of scriptOccurrences) {
    if (count >= 2) {
      sharedScripts.push(original);
      sharedNormalized.add(normalized);
    }
  }

  if (sharedScripts.length === 0) return;

  // Append to scripts.js
  files['scripts.js'] += '\n\n/* Shared page scripts (extracted from duplicate <script> blocks) */\n' + sharedScripts.join('\n\n');

  // Remove shared scripts from individual pages
  for (const filename of htmlFiles) {
    const $ = cheerio.load(files[filename]);

    $('script:not([src])').each((_, el) => {
      const text = $(el).text().trim();
      if (!text || text.includes('tailwind.config')) return;
      const normalized = normalizeScript(text);
      if (sharedNormalized.has(normalized)) {
        $(el).remove();
      }
    });

    // @ts-expect-error -- decodeEntities
    files[filename] = $.html({ decodeEntities: false });
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract individual CSS rules from a stylesheet string */
function extractCssRules(css: string): string[] {
  const rules: string[] = [];
  let depth = 0;
  let current = '';

  for (const char of css) {
    current += char;
    if (char === '{') depth++;
    if (char === '}') {
      depth--;
      if (depth === 0) {
        const rule = current.trim();
        if (rule) rules.push(rule);
        current = '';
      }
    }
  }

  return rules;
}

/** Normalize a CSS rule for comparison (collapse whitespace, lowercase) */
function normalizeCssRule(rule: string): string {
  return rule
    .replace(/\/\*[\s\S]*?\*\//g, '') // strip comments
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeInlineStyle(style: string): string {
  return style
    .split(';')
    .map(s => s.trim())
    .filter(Boolean)
    .sort()
    .join('; ')
    .toLowerCase();
}

function denormalize(normalized: string): string {
  return normalized.split('; ').map(s => s.trim()).filter(Boolean).join('; ') + ';';
}

/** Generate a semantic class name from CSS properties */
function generateClassName(normalizedStyle: string, index: number): string {
  const props = normalizedStyle.split(';').map(s => s.trim()).filter(Boolean);
  const parts: string[] = [];

  for (const prop of props) {
    const [key, value] = prop.split(':').map(s => s.trim());
    if (key === 'color' && value?.includes('--color-text-muted')) parts.push('text-muted');
    else if (key === 'color' && value?.includes('--color-accent')) parts.push('text-accent');
    else if (key === 'color' && value?.includes('--color-primary')) parts.push('text-primary');
    else if (key === 'color' && value?.includes('--color-text')) parts.push('text-main');
    else if (key === 'color' && value?.includes('rgba')) parts.push('text-light');
    else if (key === 'background-color' && value?.includes('--color-primary')) parts.push('bg-primary');
    else if (key === 'background-color' && value?.includes('--color-surface')) parts.push('bg-surface');
    else if (key === 'font-family' && value?.includes('--font-heading')) parts.push('font-heading');
    else if (key === 'font-family' && value?.includes('--font-body')) parts.push('font-body');
  }

  if (parts.length > 0) {
    const name = 'u-' + parts.join('-');
    return index > 0 && parts.length < props.length ? `${name}-${index}` : name;
  }

  return `u-style-${index}`;
}

function normalizeScript(script: string): string {
  return script
    .replace(/\/\*[\s\S]*?\*\//g, '') // strip block comments
    .replace(/\/\/.*$/gm, '') // strip line comments
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
