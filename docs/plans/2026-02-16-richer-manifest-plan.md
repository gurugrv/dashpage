# Richer Manifest Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enrich the system prompt manifest with fonts, nav links, site-level overview, and better section summaries to improve AI edit accuracy.

**Architecture:** Extend `generate-manifest.ts` with new extraction functions (fonts, nav links, site overview), enrich `summarizeContent()` for better section descriptions, and update `context-blocks.ts` with the new manifest format and context-aware edit guidance.

**Tech Stack:** TypeScript, regex-based HTML parsing (no new dependencies)

---

### Task 1: Add `extractFonts()` to generate-manifest.ts

**Files:**
- Modify: `src/lib/prompts/manifest/generate-manifest.ts:1-24`

**Step 1: Add the `extractFonts` function after `extractDesignTokens`**

Add this function after line 24 in `generate-manifest.ts`:

```typescript
/**
 * Extract Google Fonts family names from <link> tags.
 * Handles both fonts.googleapis.com and fonts.bunny.net URLs.
 */
export function extractFonts(html: string): string[] {
  const fonts: string[] = [];
  const linkRe = /<link[^>]+href=["']([^"']*(?:fonts\.googleapis\.com|fonts\.bunny\.net)[^"']*)["'][^>]*>/gi;
  let match;

  while ((match = linkRe.exec(html)) !== null) {
    const url = match[1];
    // Parse family names from URL: ?family=Inter:wght@400;700&family=Playfair+Display
    const familyRe = /family=([^:&]+)/g;
    let familyMatch;
    while ((familyMatch = familyRe.exec(url)) !== null) {
      const name = decodeURIComponent(familyMatch[1].replace(/\+/g, ' ')).trim();
      if (name && !fonts.includes(name)) fonts.push(name);
    }
  }

  return fonts;
}
```

**Step 2: Verify build passes**

Run: `cd "/Volumes/Work/MAG Centre/AI Builder" && npm run build`
Expected: Build succeeds (function is exported but not yet called)

**Step 3: Commit**

```bash
git add src/lib/prompts/manifest/generate-manifest.ts
git commit -m "feat(manifest): add extractFonts for Google Fonts detection"
```

---

### Task 2: Add `extractNavLinks()` to generate-manifest.ts

**Files:**
- Modify: `src/lib/prompts/manifest/generate-manifest.ts`

**Step 1: Add the `extractNavLinks` function after `extractFonts`**

```typescript
/**
 * Extract internal link targets from <nav> elements.
 * Returns filenames like ["index.html", "about.html"].
 */
export function extractNavLinks(html: string): string[] {
  const links: string[] = [];
  const navRe = /<nav[\s>]([\s\S]*?)<\/nav>/gi;
  let navMatch;

  while ((navMatch = navRe.exec(html)) !== null) {
    const navContent = navMatch[1];
    const hrefRe = /href=["']([^"'#]+\.html?)["']/gi;
    let hrefMatch;
    while ((hrefMatch = hrefRe.exec(navContent)) !== null) {
      // Normalize: strip leading ./ or /
      const target = hrefMatch[1].replace(/^\.?\//, '');
      if (target && !links.includes(target)) links.push(target);
    }
  }

  return links;
}
```

**Step 2: Verify build passes**

Run: `cd "/Volumes/Work/MAG Centre/AI Builder" && npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/lib/prompts/manifest/generate-manifest.ts
git commit -m "feat(manifest): add extractNavLinks for internal link detection"
```

---

### Task 3: Enrich `summarizeContent()` with headings and paragraph preview

**Files:**
- Modify: `src/lib/prompts/manifest/generate-manifest.ts:82-107`

**Step 1: Replace the `summarizeContent` function**

Replace the entire `summarizeContent` function (lines 82-107) with:

```typescript
/** Build a short summary: headings + paragraph preview + element counts. */
function summarizeContent(inner: string): string {
  const parts: string[] = [];

  // Extract up to 3 headings (h1-h6)
  const headingRe = /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi;
  let headingMatch;
  let headingCount = 0;
  while ((headingMatch = headingRe.exec(inner)) !== null && headingCount < 3) {
    const level = headingMatch[1];
    const text = headingMatch[2].replace(/<[^>]+>/g, '').trim();
    if (text) {
      parts.push(`h${level}: "${text.slice(0, 60)}"`);
      headingCount++;
    }
  }

  // First paragraph preview
  const pMatch = inner.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
  if (pMatch) {
    const pText = pMatch[1].replace(/<[^>]+>/g, '').trim();
    if (pText && pText.length > 10) {
      parts.push(`p: "${pText.slice(0, 80)}${pText.length > 80 ? '...' : ''}"`);
    }
  }

  // Count notable child elements
  const counts: [string, RegExp][] = [
    ['nav links', /<a\s/gi],
    ['buttons', /<button[\s>]/gi],
    ['images', /<img[\s>]/gi],
    ['cards', /class="[^"]*card[^"]*"/gi],
    ['form fields', /<(?:input|textarea|select)[\s>]/gi],
  ];

  for (const [label, re] of counts) {
    const found = inner.match(re);
    if (found && found.length > 0) parts.push(`${found.length} ${label}`);
  }

  return parts.join(', ') || 'content block';
}
```

**Step 2: Verify build passes**

Run: `cd "/Volumes/Work/MAG Centre/AI Builder" && npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/lib/prompts/manifest/generate-manifest.ts
git commit -m "feat(manifest): enrich section summaries with headings and paragraph preview"
```

---

### Task 4: Update `extractSections()` to include nav link targets

**Files:**
- Modify: `src/lib/prompts/manifest/generate-manifest.ts:35-63`

**Step 1: Update the `SectionEntry` interface and `extractSections`**

Replace the `SectionEntry` interface (line 26-29) with:

```typescript
interface SectionEntry {
  selector: string;
  summary: string;
  navLinks?: string[];
}
```

In `extractSections`, after building the summary (line 59), add nav link extraction for nav elements. Replace lines 59-60 with:

```typescript
    const summary = summarizeContent(inner);
    const entry: SectionEntry = { selector, summary };

    // For nav elements, extract link targets
    if (tag === 'nav') {
      const navLinks = extractNavLinks(`<nav>${inner}</nav>`);
      if (navLinks.length > 0) entry.navLinks = navLinks;
    }

    sections.push(entry);
```

**Step 2: Update the manifest section formatting in `generateManifest`**

In `generateManifest`, replace the sections formatting line (line 132):

```typescript
      manifest += `\n  <sections>\n${sections.map((s) => {
        let line = `    ${s.selector} — ${s.summary}`;
        if (s.navLinks && s.navLinks.length > 0) line += ` → [${s.navLinks.join(', ')}]`;
        return line;
      }).join('\n')}\n  </sections>`;
```

**Step 3: Verify build passes**

Run: `cd "/Volumes/Work/MAG Centre/AI Builder" && npm run build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/lib/prompts/manifest/generate-manifest.ts
git commit -m "feat(manifest): add nav link targets to section entries"
```

---

### Task 5: Add fonts to per-file manifest output

**Files:**
- Modify: `src/lib/prompts/manifest/generate-manifest.ts:113-140`

**Step 1: Add fonts extraction to `generateManifest`**

In the `generateManifest` function, after line 122 (`const tokens = extractDesignTokens(content);`), add:

```typescript
    const fonts = extractFonts(content);
```

After the design_tokens block (after line 129), add:

```typescript
    if (fonts.length > 0) {
      manifest += `\n  <fonts>${fonts.join(', ')}</fonts>`;
    }
```

**Step 2: Verify build passes**

Run: `cd "/Volumes/Work/MAG Centre/AI Builder" && npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/lib/prompts/manifest/generate-manifest.ts
git commit -m "feat(manifest): include fonts in per-file manifest output"
```

---

### Task 6: Add `extractSiteOverview()` function

**Files:**
- Modify: `src/lib/prompts/manifest/generate-manifest.ts`

**Step 1: Add the `extractSiteOverview` function before `generateManifest`**

```typescript
/**
 * Build a site-level overview block for multi-page sites.
 * Extracts design system from index.html, navigation map, and shared elements.
 */
export function extractSiteOverview(files: ProjectFiles): string {
  const fileNames = Object.keys(files);
  if (fileNames.length <= 1) return '';

  const indexHtml = files['index.html'] || '';
  const parts: string[] = [];

  // Design system from index.html
  const tokens = extractDesignTokens(indexHtml);
  const fonts = extractFonts(indexHtml);
  if (tokens.length > 0 || fonts.length > 0) {
    let ds = '<design_system>';
    if (tokens.length > 0) ds += `\n    Palette: ${tokens.slice(0, 7).join(', ')}`;
    if (fonts.length > 0) ds += `\n    Fonts: ${fonts.join(', ')}`;
    ds += '\n    CDN: Tailwind CSS';
    ds += '\n  </design_system>';
    parts.push(ds);
  }

  // Navigation map: union of all nav links across files
  const allNavLinks = new Set<string>();
  for (const content of Object.values(files)) {
    for (const link of extractNavLinks(content)) {
      allNavLinks.add(link);
    }
  }
  if (allNavLinks.size > 0) {
    parts.push(`<navigation>\n    ${[...allNavLinks].join(' ↔ ')}\n  </navigation>`);
  }

  // Shared elements: detect nav/footer that appear in multiple files
  const sharedParts: string[] = [];
  let navCount = 0;
  let footerCount = 0;
  for (const content of Object.values(files)) {
    if (/<nav[\s>]/i.test(content)) navCount++;
    if (/<footer[\s>]/i.test(content)) footerCount++;
  }
  if (navCount > 1) sharedParts.push(`nav (on ${navCount}/${fileNames.length} pages)`);
  if (footerCount > 1) sharedParts.push(`footer (on ${footerCount}/${fileNames.length} pages)`);
  if (sharedParts.length > 0) {
    parts.push(`<shared_elements>\n    All pages share: ${sharedParts.join(', ')}\n  </shared_elements>`);
  }

  if (parts.length === 0) return '';

  return `<site_overview>\n  ${parts.join('\n  ')}\n</site_overview>`;
}
```

**Step 2: Verify build passes**

Run: `cd "/Volumes/Work/MAG Centre/AI Builder" && npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/lib/prompts/manifest/generate-manifest.ts
git commit -m "feat(manifest): add extractSiteOverview for cross-file summary"
```

---

### Task 7: Update `generateManifest()` to include site overview

**Files:**
- Modify: `src/lib/prompts/manifest/generate-manifest.ts:113-140`

**Step 1: Update `generateManifest` signature and add site overview**

Update the function to accept and return the site overview. Change the function (starting at line 113):

```typescript
/**
 * Generate a structural manifest for the system prompt.
 * Small files are included in full; larger files get a structural summary.
 * For multi-page sites, includes a site-level overview.
 */
export function generateManifest(files: ProjectFiles): { perFile: string; siteOverview: string } {
  const entries: string[] = [];

  for (const [filename, content] of Object.entries(files)) {
    if (content.length <= SMALL_FILE_THRESHOLD) {
      entries.push(`<file name="${filename}" size="${content.length}">\n${content}\n</file>`);
      continue;
    }

    const tokens = extractDesignTokens(content);
    const fonts = extractFonts(content);
    const sections = extractSections(content);

    let manifest = `<file name="${filename}" size="${content.length}">`;

    if (tokens.length > 0) {
      manifest += `\n  <design_tokens>\n${tokens.map((t) => `    ${t}`).join('\n')}\n  </design_tokens>`;
    }

    if (fonts.length > 0) {
      manifest += `\n  <fonts>${fonts.join(', ')}</fonts>`;
    }

    if (sections.length > 0) {
      manifest += `\n  <sections>\n${sections.map((s) => {
        let line = `    ${s.selector} — ${s.summary}`;
        if (s.navLinks && s.navLinks.length > 0) line += ` → [${s.navLinks.join(', ')}]`;
        return line;
      }).join('\n')}\n  </sections>`;
    }

    manifest += '\n</file>';
    entries.push(manifest);
  }

  return {
    perFile: entries.join('\n\n'),
    siteOverview: extractSiteOverview(files),
  };
}
```

**Step 2: Update caller in `context-blocks.ts`**

In `src/lib/prompts/sections/context-blocks.ts`, line 36, update the `generateManifest` call:

Replace lines 33-55 of `buildCurrentWebsiteBlock`:

```typescript
export function buildCurrentWebsiteBlock(currentFiles?: ProjectFiles): string {
  if (!currentFiles?.['index.html']) return '';

  const { perFile, siteOverview } = generateManifest(currentFiles);
  const fileCount = Object.keys(currentFiles).length;
  const isMultiPage = fileCount > 1;

  const preamble = isMultiPage
    ? `The user has an existing multi-file website (${fileCount} files). Below is a structural manifest of each file.`
    : 'The user has an existing website. Below is a structural manifest of the page.';

  const instructions = isMultiPage
    ? 'Use readFile to inspect exact content before making editFiles changes.\nMaintain design consistency across ALL files.\nUnchanged files are preserved automatically — only include new or fully rewritten files in writeFiles.'
    : 'Use readFile to inspect exact content before making editFiles changes.\nWhen editing, consider the ENTIRE page context — maintain design consistency across all sections.';

  const overviewBlock = siteOverview ? `\n${siteOverview}\n` : '';

  return `\n<current_website>
${preamble}
${overviewBlock}
${perFile}

${instructions}
</current_website>`;
}
```

**Step 3: Verify build passes**

Run: `cd "/Volumes/Work/MAG Centre/AI Builder" && npm run build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/lib/prompts/manifest/generate-manifest.ts src/lib/prompts/sections/context-blocks.ts
git commit -m "feat(manifest): integrate site overview into manifest output"
```

---

### Task 8: Update `buildEditModeBlock()` with context-aware guidance

**Files:**
- Modify: `src/lib/prompts/sections/context-blocks.ts:5-31`

**Step 1: Replace `buildEditModeBlock` with context-aware version**

Replace the entire `buildEditModeBlock` function (lines 5-31) with:

```typescript
export function buildEditModeBlock(currentFiles?: ProjectFiles): string {
  if (!currentFiles?.['index.html']) return '';

  const isMultiPage = Object.keys(currentFiles).length > 1;

  const crossPageBlock = isMultiPage
    ? `\nCross-page awareness:
- Nav and footer appear on ALL pages. Changing them requires editing every file.
- New pages must use the same design_system tokens and font imports from site_overview.
- Use editFiles to batch cross-page changes in one call.
Only add new pages when the user explicitly asks for them.`
    : '';

  return `\n<edit_guidance>
Modify the existing HTML based on the user's request.
Build on the existing design — preserve what works, change what's requested.

BEFORE EDITING: Check the manifest above. It contains the site's design system, page structure, and CSS selectors. Use this context FIRST — do not call readFile unless you need exact content for editFiles search strings.

Tool selection:
- editDOM: text, images, colors, classes, attributes. Use CSS selectors from the manifest sections.
- editFiles: structural changes, new sections. MUST call readFile first for precise search string matches.
- writeFiles: new pages only, or full rewrites. Match the design system from the manifest.${crossPageBlock}

IMPORTANT: Before using editFiles, you MUST call readFile to inspect the exact file content. The manifest is a structural summary — editFiles needs precise text matches.
</edit_guidance>`;
}
```

**Step 2: Verify build passes**

Run: `cd "/Volumes/Work/MAG Centre/AI Builder" && npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/lib/prompts/sections/context-blocks.ts
git commit -m "feat(manifest): context-aware edit guidance with cross-page awareness"
```

---

### Task 9: Manual verification with dev server

**Step 1: Start dev server and generate a multi-page site**

Run: `cd "/Volumes/Work/MAG Centre/AI Builder" && npm run dev`

1. Open http://localhost:3000
2. Generate a multi-page site (e.g. "Create a restaurant website with home, about, and menu pages")
3. Wait for generation to complete

**Step 2: Check manifest output in debug logs**

Set `DEBUG_AI_STREAM_OUTPUT=true` in `.env.local`, then make an edit request (e.g. "Change the hero heading on the about page"). Check the debug log to verify:
- Site overview block appears with design_system, navigation, shared_elements
- Per-file manifests include fonts and nav link targets
- Section summaries show h1/h2/h3 headings and paragraph previews
- Edit guidance includes "Check the manifest above" instruction

**Step 3: Verify edit accuracy**

Make several edit requests to confirm:
- AI targets the correct file without unnecessary readFile calls
- AI maintains design consistency when editing
- Cross-page changes (like nav updates) are applied to all files

**Step 4: Final commit if any adjustments needed**

```bash
git add -A
git commit -m "fix(manifest): adjustments from manual testing"
```
