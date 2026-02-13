import { getIconData, iconToSVG, iconToHTML, replaceIDs } from '@iconify/utils';
import type { IconifyJSON, IconifyIcon } from '@iconify/types';

// --- Icon set loading (module-level, loaded once per process) ---

import { icons as lucideIcons } from '@iconify-json/lucide';
import { icons as heroiconsIcons } from '@iconify-json/heroicons';
import { icons as tablerIcons } from '@iconify-json/tabler';
import { icons as phIcons } from '@iconify-json/ph';

// Lucide tags for enriched keyword search
// eslint-disable-next-line @typescript-eslint/no-require-imports
const lucideTags: Record<string, string[]> = require('lucide-static/tags.json');

type IconStyle = 'outline' | 'solid';

interface IconSetConfig {
  data: IconifyJSON;
  priority: number; // lower = higher priority in results
  /** Determine the style of an icon by its name within this set */
  getStyle: (iconName: string) => IconStyle;
  /** Map a requested style to the icon name variant, or null if not available */
  resolveVariant: (iconName: string, style: IconStyle) => string | null;
}

const ICON_SETS: Record<string, IconSetConfig> = {
  lucide: {
    data: lucideIcons,
    priority: 1,
    // Lucide is all outline/stroke-based
    getStyle: () => 'outline',
    resolveVariant: (name) => name, // always available
  },
  heroicons: {
    data: heroiconsIcons,
    priority: 2,
    getStyle: (name) => (name.endsWith('-solid') || name.startsWith('solid-') ? 'solid' : 'outline'),
    resolveVariant: (name, style) => {
      // Heroicons in Iconify use suffixed naming for variants
      const baseName = name.replace(/-solid$/, '').replace(/-20-solid$/, '');
      if (style === 'solid') {
        // Check if a solid variant exists
        const solidName = `${baseName}-solid`;
        if (getIconData(heroiconsIcons, solidName)) return solidName;
        const solid20 = `${baseName}-20-solid`;
        if (getIconData(heroiconsIcons, solid20)) return solid20;
        return null;
      }
      // Outline: try base name
      if (getIconData(heroiconsIcons, baseName)) return baseName;
      return name;
    },
  },
  tabler: {
    data: tablerIcons,
    priority: 3,
    getStyle: (name) => (name.endsWith('-filled') ? 'solid' : 'outline'),
    resolveVariant: (name, style) => {
      const baseName = name.replace(/-filled$/, '');
      if (style === 'solid') {
        const filledName = `${baseName}-filled`;
        if (getIconData(tablerIcons, filledName)) return filledName;
        return null;
      }
      if (getIconData(tablerIcons, baseName)) return baseName;
      return name;
    },
  },
  ph: {
    data: phIcons,
    priority: 4,
    getStyle: (name) => {
      if (name.endsWith('-fill') || name.endsWith('-bold')) return 'solid';
      return 'outline';
    },
    resolveVariant: (name, style) => {
      // Phosphor: strip known suffixes to get base
      const baseName = name
        .replace(/-fill$/, '')
        .replace(/-bold$/, '')
        .replace(/-thin$/, '')
        .replace(/-light$/, '')
        .replace(/-duotone$/, '');
      if (style === 'solid') {
        const fillName = `${baseName}-fill`;
        if (getIconData(phIcons, fillName)) return fillName;
        return null;
      }
      // Outline: try base name (regular weight)
      if (getIconData(phIcons, baseName)) return baseName;
      return name;
    },
  },
};

// --- Search index (lazy singleton) ---

interface IndexEntry {
  setName: string;
  iconName: string;
  /** All searchable terms: name words + tags + categories */
  terms: string[];
}

let searchIndex: IndexEntry[] | null = null;
/** Inverted index: term -> array of indices into searchIndex */
let termIndex: Map<string, number[]> | null = null;

function buildSearchIndex(): void {
  const entries: IndexEntry[] = [];
  const invertedIndex = new Map<string, number[]>();

  function addTerm(term: string, entryIdx: number) {
    const lower = term.toLowerCase();
    if (!invertedIndex.has(lower)) {
      invertedIndex.set(lower, []);
    }
    invertedIndex.get(lower)!.push(entryIdx);
  }

  for (const [setName, config] of Object.entries(ICON_SETS)) {
    const iconNames = Object.keys(config.data.icons);

    // Also include aliases
    const aliasNames = config.data.aliases ? Object.keys(config.data.aliases) : [];
    const allNames = [...iconNames, ...aliasNames];

    for (const iconName of allNames) {
      const terms: string[] = [];

      // Name words (split kebab-case)
      const nameWords = iconName.split('-').filter((w) => w.length > 0);
      terms.push(...nameWords);
      // Full name as a term too
      terms.push(iconName);

      // Lucide tags (synonym enrichment)
      if (setName === 'lucide' && lucideTags[iconName]) {
        for (const tag of lucideTags[iconName]) {
          // Tags can be multi-word like "magnifying glass"
          terms.push(...tag.toLowerCase().split(/\s+/));
          if (tag.includes(' ')) terms.push(tag.toLowerCase());
        }
      }

      const entryIdx = entries.length;
      entries.push({ setName, iconName, terms });

      // Index each unique term
      const uniqueTerms = new Set(terms.map((t) => t.toLowerCase()));
      for (const term of uniqueTerms) {
        addTerm(term, entryIdx);
      }
    }
  }

  // Also build category-based terms if metadata is available
  // Categories are broad — we index them as lower-priority terms
  for (const [setName, config] of Object.entries(ICON_SETS)) {
    try {
      // metadata.json may include categories: { "Category": ["icon1", "icon2"] }
      // @iconify-json packages may or may not include this
      // We'll try to access it but gracefully skip if unavailable
      const metadataPath = `@iconify-json/${setName === 'ph' ? 'ph' : setName}/metadata.json`;
      // Dynamic require for optional metadata
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const metadata = require(metadataPath) as { categories?: Record<string, string[]> };
      if (metadata.categories) {
        for (const [category, icons] of Object.entries(metadata.categories)) {
          const categoryTerms = category.toLowerCase().split(/[\s/&]+/);
          for (const iconName of icons) {
            const idx = entries.findIndex((e) => e.setName === setName && e.iconName === iconName);
            if (idx >= 0) {
              for (const ct of categoryTerms) {
                entries[idx].terms.push(ct);
                addTerm(ct, idx);
              }
            }
          }
        }
      }
    } catch {
      // metadata.json not available for this set — skip silently
    }
  }

  searchIndex = entries;
  termIndex = invertedIndex;
}

function ensureIndex() {
  if (!searchIndex || !termIndex) {
    buildSearchIndex();
  }
}

// --- Search ---

interface SearchResult {
  setName: string;
  iconName: string;
  score: number;
}

function searchIconIndex(query: string, style: IconStyle, count: number): SearchResult[] {
  ensureIndex();

  const queryWords = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 0);

  if (queryWords.length === 0) return [];

  // Score each entry
  const scores = new Map<number, number>();

  for (const word of queryWords) {
    // Exact term match in inverted index
    const exactMatches = termIndex!.get(word);
    if (exactMatches) {
      for (const idx of exactMatches) {
        const entry = searchIndex![idx];
        const currentScore = scores.get(idx) ?? 0;

        // Exact icon name match: highest score
        if (entry.iconName === word) {
          scores.set(idx, currentScore + 100);
        }
        // Lucide tag match: high score
        else if (entry.setName === 'lucide' && lucideTags[entry.iconName]?.some((t) => t.toLowerCase() === word)) {
          scores.set(idx, currentScore + 60);
        }
        // Full word in name: medium score
        else if (entry.iconName.split('-').includes(word)) {
          scores.set(idx, currentScore + 40);
        }
        // Category or other term match: lower
        else {
          scores.set(idx, currentScore + 20);
        }
      }
    }

    // Partial/prefix match for terms not in the inverted index
    for (let idx = 0; idx < searchIndex!.length; idx++) {
      if (scores.has(idx)) continue; // already scored via exact match
      const entry = searchIndex![idx];
      const hasPartialMatch = entry.terms.some(
        (t) => t.startsWith(word) || word.startsWith(t),
      );
      if (hasPartialMatch) {
        scores.set(idx, (scores.get(idx) ?? 0) + 10);
      }
    }
  }

  // Convert to results, filter by style, apply set priority
  const results: SearchResult[] = [];

  for (const [idx, score] of scores) {
    const entry = searchIndex![idx];
    const config = ICON_SETS[entry.setName];

    // Check if this icon has the requested style variant
    const variantName = config.resolveVariant(entry.iconName, style);
    if (!variantName) continue;

    // Adjust score by set priority (lower priority number = small bonus)
    const priorityBonus = (5 - config.priority) * 2;

    results.push({
      setName: entry.setName,
      iconName: variantName,
      score: score + priorityBonus,
    });
  }

  // Sort by score descending, then by set priority
  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return ICON_SETS[a.setName].priority - ICON_SETS[b.setName].priority;
  });

  // Deduplicate: keep best result per concept per set
  // (avoid returning "home" from all 4 sets)
  const seen = new Set<string>();
  const deduped: SearchResult[] = [];
  for (const r of results) {
    // Normalize name for dedup (strip variant suffixes)
    const baseName = r.iconName
      .replace(/-solid$/, '')
      .replace(/-filled$/, '')
      .replace(/-fill$/, '')
      .replace(/-bold$/, '')
      .replace(/-20-solid$/, '');
    const key = `${r.setName}:${baseName}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(r);
    }
  }

  return deduped.slice(0, count);
}

// --- SVG Rendering ---

function renderIconSVG(setName: string, iconName: string): string | null {
  const config = ICON_SETS[setName];
  if (!config) return null;

  const iconData: IconifyIcon | null = getIconData(config.data, iconName);
  if (!iconData) return null;

  const renderData = iconToSVG(iconData, { height: 24 });
  const body = replaceIDs(renderData.body);
  return iconToHTML(body, renderData.attributes);
}

// --- Result cache (LRU) ---

interface CacheEntry {
  results: IconResult[];
}

const MAX_CACHE_ENTRIES = 500;
const cache = new Map<string, CacheEntry>();

function evictLRU() {
  if (cache.size <= MAX_CACHE_ENTRIES) return;
  // Map iteration order is insertion order — delete oldest
  const firstKey = cache.keys().next().value;
  if (firstKey !== undefined) cache.delete(firstKey);
}

function buildCacheKey(query: string, style: IconStyle, count: number): string {
  return `${query.toLowerCase().trim()}|${style}|${count}`;
}

// --- Public API ---

export interface IconResult {
  name: string;
  set: string;
  svg: string;
  style: IconStyle;
}

export function searchIcons(
  query: string,
  style: IconStyle = 'outline',
  count: number = 3,
): IconResult[] {
  const cacheKey = buildCacheKey(query, style, count);
  const cached = cache.get(cacheKey);
  if (cached) {
    // Move to end for LRU (delete + re-insert)
    cache.delete(cacheKey);
    cache.set(cacheKey, cached);
    return cached.results;
  }

  const searchResults = searchIconIndex(query, style, count);
  const results: IconResult[] = [];

  for (const r of searchResults) {
    const svg = renderIconSVG(r.setName, r.iconName);
    if (svg) {
      results.push({
        name: r.iconName,
        set: r.setName,
        svg,
        style,
      });
    }
  }

  cache.set(cacheKey, { results });
  evictLRU();

  return results;
}
