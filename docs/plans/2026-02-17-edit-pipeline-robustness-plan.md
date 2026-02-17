# Edit Pipeline Robustness Fixes — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix 4 bugs in the edit/component pipeline that cause silent file corruption, manifest-DOM mismatch, wrong replacement positions, and missed component extraction.

**Architecture:** Four independent fixes touching 5 files. No shared dependencies between fixes — can be implemented in any order. All changes are internal to the edit/manifest/component pipeline; no API or UI changes.

**Tech Stack:** TypeScript, Cheerio (already a dependency), `approx-string-match` (already a dependency)

---

### Task 1: Merge fuzzy tiers to single 85% threshold

**Files:**
- Modify: `src/lib/parser/edit-operations/types.ts:9`
- Modify: `src/lib/parser/edit-operations/apply-edit-operations.ts:11-12,262-265`
- Modify: `src/lib/chat/tools/file-tools.ts:196`

**Step 1: Update MatchTier type**

In `src/lib/parser/edit-operations/types.ts`, line 9, change:
```typescript
export type MatchTier = 'exact' | 'whitespace' | 'token' | 'fuzzy' | 'auto-correct';
```
to:
```typescript
export type MatchTier = 'exact' | 'whitespace' | 'token' | 'fuzzy';
```

**Step 2: Remove AUTO_CORRECT_THRESHOLD and simplify fuzzy tier**

In `src/lib/parser/edit-operations/apply-edit-operations.ts`:

Remove line 12 (`const AUTO_CORRECT_THRESHOLD = 0.75;`).

Replace lines 260-267:
```typescript
    // Tier 4+5: Fuzzy Levenshtein — single scan, two thresholds
    if (expected === 1) {
      const fuzzyResult = tryFuzzyMatch(result, search, AUTO_CORRECT_THRESHOLD);
      if (fuzzyResult) {
        result = result.slice(0, fuzzyResult.index) + replace + result.slice(fuzzyResult.index + fuzzyResult.length);
        matchTiers.push(fuzzyResult.similarity >= FUZZY_THRESHOLD ? 'fuzzy' : 'auto-correct');
        continue;
      }
    }
```
with:
```typescript
    // Tier 4: Fuzzy Levenshtein (≥85% similarity)
    if (expected === 1) {
      const fuzzyResult = tryFuzzyMatch(result, search, FUZZY_THRESHOLD);
      if (fuzzyResult) {
        result = result.slice(0, fuzzyResult.index) + replace + result.slice(fuzzyResult.index + fuzzyResult.length);
        matchTiers.push('fuzzy');
        continue;
      }
    }
```

**Step 3: Update tool description**

In `src/lib/chat/tools/file-tools.ts`, line 196, change the description from:
```
'Edit one or more files using search/replace operations. Uses 5-tier matching: exact → whitespace-tolerant → token-based → fuzzy (≥85%) → auto-correct (≥75%). All operations are attempted even if some fail — successful edits are kept. Per-file atomicity: a failed file does not block successful ones. After 2 consecutive failures on the same file, consider using writeFiles instead.'
```
to:
```
'Edit one or more files using search/replace operations. Uses 4-tier matching: exact → whitespace-tolerant → token-based → fuzzy (≥85%). All operations are attempted even if some fail — successful edits are kept. Per-file atomicity: a failed file does not block successful ones. After 2 consecutive failures on the same file, consider using writeFiles instead.'
```

**Step 4: Verify build**

Run: `npm run build`
Expected: No type errors, clean build.

**Step 5: Commit**

```bash
git add src/lib/parser/edit-operations/types.ts src/lib/parser/edit-operations/apply-edit-operations.ts src/lib/chat/tools/file-tools.ts
git commit -m "fix: merge fuzzy tiers to single 85% threshold

Remove auto-correct tier (75%) that could silently corrupt files.
Now uses only fuzzy at 85% — bad matches fail with error context
for AI retry instead of silent wrong replacement."
```

---

### Task 2: Switch manifest block extraction to Cheerio

**Files:**
- Modify: `src/lib/prompts/manifest/generate-manifest.ts:82-130`

**Step 1: Add Cheerio import**

At the top of `generate-manifest.ts`, add:
```typescript
import * as cheerio from 'cheerio';
```

**Step 2: Rewrite extractBlocks to use Cheerio**

Replace the `extractBlocks` function (lines 82-130) with:

```typescript
export function extractBlocks(html: string, componentNames: Set<string>): BlockEntry[] {
  const blocks: BlockEntry[] = [];

  // Check for component placeholders: <!-- @component:X -->
  const placeholderRe = /<!-- @component:(\S+) -->/g;
  let placeholderMatch;
  while ((placeholderMatch = placeholderRe.exec(html)) !== null) {
    const compName = placeholderMatch[1];
    blocks.push({
      id: compName,
      tag: 'component',
      component: compName,
      summary: `(shared component — edit _components/${compName}.html)`,
    });
  }

  // Extract data-block elements using Cheerio (handles nesting correctly)
  const $ = cheerio.load(html);
  $('nav, header, section, footer, aside, main').each((_i, el) => {
    const $el = $(el);
    const tag = (el as cheerio.Element).tagName.toLowerCase();
    const blockId = $el.attr('data-block');
    if (!blockId) return; // skip elements without data-block

    // Skip if this block is a component (already listed as placeholder)
    if (componentNames.has(blockId)) return;

    const inner = $el.html() || '';
    const summary = summarizeContent(inner);

    // For nav elements, extract link targets
    if (tag === 'nav') {
      const navLinks = extractNavLinks(`<nav>${inner}</nav>`);
      if (navLinks.length > 0) {
        blocks.push({ id: blockId, tag, summary: `${summary} -> [${navLinks.join(', ')}]` });
        return;
      }
    }

    blocks.push({ id: blockId, tag, summary });
  });

  return blocks;
}
```

Key difference: `$('nav, header, section, footer, aside, main').each(...)` correctly handles nested same-type elements (e.g. `<section>` inside `<section>`) — each element is visited once with its correct boundaries.

**Step 3: Verify build**

Run: `npm run build`
Expected: Clean build, no type errors.

**Step 4: Commit**

```bash
git add src/lib/prompts/manifest/generate-manifest.ts
git commit -m "fix: use Cheerio for manifest block extraction

Replace regex-based extraction that misparses nested same-type
elements with Cheerio DOM queries. Now manifest matches editBlock's
view of the DOM."
```

---

### Task 3: Script/style-aware findOriginalPosition

**Files:**
- Modify: `src/lib/parser/edit-operations/find-original-position.ts`

**Step 1: Rewrite findOriginalPosition**

Replace the entire file content with:

```typescript
interface BlockRange {
  start: number;
  end: number;
}

/**
 * Find byte ranges of <script>...</script> and <style>...</style> blocks.
 */
function findPreservedBlocks(text: string): BlockRange[] {
  const ranges: BlockRange[] = [];
  const re = /<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi;
  let match;
  while ((match = re.exec(text)) !== null) {
    // The preserved content is between the opening tag's > and closing tag's <
    const openTagEnd = text.indexOf('>', match.index) + 1;
    const closeTagStart = match.index + match[0].lastIndexOf('</');
    if (openTagEnd < closeTagStart) {
      ranges.push({ start: openTagEnd, end: closeTagStart });
    }
  }
  return ranges;
}

/**
 * Check if a position falls inside any preserved block.
 */
function isInPreservedBlock(pos: number, blocks: BlockRange[]): boolean {
  for (const block of blocks) {
    if (pos >= block.start && pos < block.end) return true;
    if (block.start > pos) break; // ranges are sorted, no need to check further
  }
  return false;
}

/**
 * Map a position in whitespace-normalized text back to the original text.
 *
 * normalizeHtmlWhitespace() collapses whitespace runs to single spaces
 * in HTML markup but preserves content inside <script> and <style> blocks
 * verbatim. This function mirrors that behavior: inside preserved blocks
 * every character counts 1:1, outside them whitespace runs count as 1.
 */
export function findOriginalPosition(original: string, normalizedPos: number): number {
  const preservedBlocks = findPreservedBlocks(original);
  let normCount = 0;
  let inWhitespace = false;

  for (let i = 0; i < original.length; i++) {
    if (normCount === normalizedPos) return i;

    if (isInPreservedBlock(i, preservedBlocks)) {
      // Inside script/style: every char counts 1:1 (no collapsing)
      normCount++;
      inWhitespace = false;
    } else {
      const isWs = /\s/.test(original[i]);
      if (isWs) {
        if (!inWhitespace) {
          normCount++;
          inWhitespace = true;
        }
      } else {
        normCount++;
        inWhitespace = false;
      }
    }
  }

  if (normCount === normalizedPos) return original.length;
  return -1;
}
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Clean build. The function signature is unchanged so all callers work.

**Step 3: Commit**

```bash
git add src/lib/parser/edit-operations/find-original-position.ts
git commit -m "fix: make findOriginalPosition script/style-aware

Position mapper now mirrors normalizeHtmlWhitespace behavior:
characters inside script/style blocks count 1:1, whitespace
collapsing only applies to HTML markup regions."
```

---

### Task 4: Structural similarity for component extraction

**Files:**
- Modify: `src/lib/blocks/extract-components.ts:13-35`

**Step 1: Replace similarity functions**

Replace `normalizeForComparison` (lines 13-18) and `similarity` (lines 24-35) with:

```typescript
/**
 * Extract structural skeleton: tag names + structural attributes only.
 * Strips text nodes and non-structural attribute values so that two
 * navs with different link text but identical structure score high.
 */
function structuralSkeleton(html: string): string {
  return html
    // Remove comments
    .replace(/<!--[\s\S]*?-->/g, '')
    // Remove text between tags (keep only tags)
    .replace(/>[^<]+</g, '><')
    // Strip all attributes except class, id, data-block
    .replace(/<(\w+)(\s[^>]*)?>/g, (_match, tag, attrs) => {
      if (!attrs) return `<${tag}>`;
      const kept: string[] = [];
      const classMatch = attrs.match(/\bclass="([^"]*)"/);
      if (classMatch) kept.push(`class="${classMatch[1]}"`);
      const idMatch = attrs.match(/\bid="([^"]*)"/);
      if (idMatch) kept.push(`id="${idMatch[1]}"`);
      const blockMatch = attrs.match(/\bdata-block="([^"]*)"/);
      if (blockMatch) kept.push(`data-block="${blockMatch[1]}"`);
      return kept.length > 0 ? `<${tag} ${kept.join(' ')}>` : `<${tag}>`;
    })
    // Collapse whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calculate structural similarity between two HTML strings (0-1).
 * Compares tag skeletons so identical structures with different
 * text content (link labels, phone numbers, etc.) still match.
 */
function similarity(a: string, b: string): number {
  const skelA = structuralSkeleton(a);
  const skelB = structuralSkeleton(b);
  if (skelA === skelB) return 1;

  const maxLen = Math.max(skelA.length, skelB.length);
  if (maxLen === 0) return 1;

  let matches = 0;
  const minLen = Math.min(skelA.length, skelB.length);
  for (let i = 0; i < minLen; i++) {
    if (skelA[i] === skelB[i]) matches++;
  }
  return matches / maxLen;
}
```

Also remove the now-unused `normalizeForComparison` function and update line 74 which calls it:

Change line 74 from:
```typescript
        normalized: normalizeForComparison(outerHtml),
```
to:
```typescript
        normalized: outerHtml,
```

And update line 84 to use the skeleton comparison directly:
```typescript
    const allSimilar = blocksByPage.every(
      b => similarity(reference.outerHtml, b.outerHtml) >= 0.9,
    );
```

(The `similarity` function now internally calls `structuralSkeleton`, so callers pass raw HTML.)

**Step 2: Verify build**

Run: `npm run build`
Expected: Clean build.

**Step 3: Commit**

```bash
git add src/lib/blocks/extract-components.ts
git commit -m "fix: use structural similarity for component extraction

Compare tag skeletons instead of raw character positions. Navs and
footers with identical structure but different text content (active
classes, link labels) now correctly detected as shared components."
```

---

### Task 5: Update CLAUDE.md references

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Update editFiles description**

In `CLAUDE.md`, find the line:
```
- `editFiles` - Search/replace operations with 5-tier matching (exact → whitespace-tolerant → token-based → fuzzy ≥85% → auto-correct ≥75%)
```
Change to:
```
- `editFiles` - Search/replace operations with 4-tier matching (exact → whitespace-tolerant → token-based → fuzzy ≥85%)
```

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for 4-tier edit matching"
```
