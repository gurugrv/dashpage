import { distance } from 'fastest-levenshtein';
import { findOriginalPosition } from '@/lib/parser/edit-operations/find-original-position';
import type {
  ApplyResult,
  EditOperation,
  MatchTier,
  BestMatch,
} from '@/lib/parser/edit-operations/types';

const FUZZY_THRESHOLD = 0.85;

/**
 * Find the line number (1-indexed) for a character position in a string.
 */
function lineNumberAt(text: string, charIndex: number): number {
  let line = 1;
  for (let i = 0; i < charIndex && i < text.length; i++) {
    if (text[i] === '\n') line++;
  }
  return line;
}

/**
 * Tier 1: Exact substring match.
 */
function tryExactMatch(
  source: string,
  search: string,
  expectedCount: number,
): { index: number; length: number } | null {
  const firstIndex = source.indexOf(search);
  if (firstIndex === -1) return null;

  if (expectedCount === 1) {
    return { index: firstIndex, length: search.length };
  }

  // Count occurrences for expectedReplacements
  let count = 0;
  let pos = 0;
  while ((pos = source.indexOf(search, pos)) !== -1) {
    count++;
    pos += search.length;
  }
  if (count !== expectedCount) return null;
  return { index: firstIndex, length: search.length };
}

/**
 * Tier 2: Whitespace-tolerant match.
 * Collapses runs of whitespace in both source and search to single spaces.
 */
function tryWhitespaceMatch(
  source: string,
  search: string,
): { index: number; length: number } | null {
  const trimmed = search.trim();
  if (!trimmed) return null;

  const normalizedSource = source.replace(/\s+/g, ' ');
  const normalizedSearch = trimmed.replace(/\s+/g, ' ');
  const normalizedIndex = normalizedSource.indexOf(normalizedSearch);
  if (normalizedIndex === -1) return null;

  const actualStart = findOriginalPosition(source, normalizedIndex);
  const actualEnd = findOriginalPosition(source, normalizedIndex + normalizedSearch.length);
  if (actualStart === -1 || actualEnd === -1) return null;

  return { index: actualStart, length: actualEnd - actualStart };
}

/**
 * Tier 3: Token-based match.
 * Extracts word tokens (ignoring all whitespace), matches token sequences.
 */
function tryTokenMatch(
  source: string,
  search: string,
): { index: number; length: number } | null {
  const searchTokens = search.match(/\S+/g);
  if (!searchTokens || searchTokens.length === 0) return null;

  // Build a regex that matches the token sequence with flexible whitespace
  const escapedTokens = searchTokens.map((t) =>
    t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
  );
  const pattern = escapedTokens.join('\\s+');
  const regex = new RegExp(pattern);
  const match = regex.exec(source);
  if (!match) return null;

  return { index: match.index, length: match[0].length };
}

/**
 * Tier 4: Fuzzy Levenshtein sliding window match.
 * Slides a window across the source, scores each position by similarity.
 */
function tryFuzzyMatch(
  source: string,
  search: string,
): { index: number; length: number; similarity: number } | null {
  const searchLen = search.length;
  if (searchLen === 0 || source.length === 0) return null;

  // Use a window with some tolerance for length differences
  const minWindow = Math.floor(searchLen * 0.8);
  const maxWindow = Math.ceil(searchLen * 1.2);

  let bestScore = 0;
  let bestIndex = -1;
  let bestLength = 0;

  for (let windowSize = minWindow; windowSize <= maxWindow; windowSize++) {
    for (let i = 0; i <= source.length - windowSize; i++) {
      const candidate = source.slice(i, i + windowSize);
      const maxLen = Math.max(candidate.length, search.length);
      if (maxLen === 0) continue;
      const similarity = 1 - distance(candidate, search) / maxLen;
      if (similarity > bestScore) {
        bestScore = similarity;
        bestIndex = i;
        bestLength = windowSize;
      }
    }
  }

  if (bestScore >= FUZZY_THRESHOLD) {
    return { index: bestIndex, length: bestLength, similarity: bestScore };
  }
  return null;
}

/**
 * Find the best approximate match for error reporting, regardless of threshold.
 */
function findBestMatchForError(source: string, search: string): BestMatch | null {
  if (!search.trim() || !source) return null;

  const searchLen = search.length;
  const minWindow = Math.floor(searchLen * 0.8);
  const maxWindow = Math.ceil(searchLen * 1.2);

  let bestScore = 0;
  let bestIndex = -1;

  // Sample positions to avoid O(n*m) on huge files
  const step = Math.max(1, Math.floor(source.length / 500));
  for (let i = 0; i <= source.length - minWindow; i += step) {
    const candidate = source.slice(i, i + Math.min(maxWindow, source.length - i));
    const maxLen = Math.max(candidate.length, search.length);
    if (maxLen === 0) continue;
    const similarity = 1 - distance(candidate, search) / maxLen;
    if (similarity > bestScore) {
      bestScore = similarity;
      bestIndex = i;
    }
  }

  if (bestIndex === -1 || bestScore < 0.3) return null;

  const matchText = source.slice(bestIndex, bestIndex + maxWindow).split('\n').slice(0, 3).join('\n');
  return {
    text: matchText.length > 150 ? matchText.slice(0, 150) + '...' : matchText,
    similarity: Math.round(bestScore * 100) / 100,
    line: lineNumberAt(source, bestIndex),
  };
}

/**
 * Apply a single replacement handling expectedReplacements > 1.
 */
function applyReplacement(
  source: string,
  search: string,
  replace: string,
  matchResult: { index: number; length: number },
  expectedCount: number,
): string {
  if (expectedCount <= 1) {
    return source.slice(0, matchResult.index) + replace + source.slice(matchResult.index + matchResult.length);
  }

  // Replace all occurrences for expectedCount > 1
  // For exact matches, use split/join for simplicity
  return source.split(search).join(replace);
}

/**
 * Apply a sequence of edit operations with 4-tier matching and partial success.
 */
export function applyEditOperations(html: string, operations: EditOperation[]): ApplyResult {
  let result = html;
  const matchTiers: MatchTier[] = [];

  for (let index = 0; index < operations.length; index++) {
    const { search, replace, expectedReplacements } = operations[index];
    const expected = expectedReplacements ?? 1;

    if (!search) {
      if (index === 0) {
        return {
          success: false,
          html: result,
          error: `Operation ${index + 1}/${operations.length} failed: empty search string`,
          bestMatch: null,
        };
      }
      return {
        success: 'partial',
        html: result,
        appliedCount: index,
        failedIndex: index,
        error: `Operation ${index + 1}/${operations.length} failed: empty search string`,
        bestMatch: null,
        matchTiers,
      };
    }

    // Tier 1: Exact match
    const exactResult = tryExactMatch(result, search, expected);
    if (exactResult) {
      result = applyReplacement(result, search, replace, exactResult, expected);
      matchTiers.push('exact');
      continue;
    }

    // Tier 2: Whitespace-tolerant
    if (expected === 1) {
      const wsResult = tryWhitespaceMatch(result, search);
      if (wsResult) {
        result = result.slice(0, wsResult.index) + replace + result.slice(wsResult.index + wsResult.length);
        matchTiers.push('whitespace');
        continue;
      }
    }

    // Tier 3: Token-based
    if (expected === 1) {
      const tokenResult = tryTokenMatch(result, search);
      if (tokenResult) {
        result = result.slice(0, tokenResult.index) + replace + result.slice(tokenResult.index + tokenResult.length);
        matchTiers.push('token');
        continue;
      }
    }

    // Tier 4: Fuzzy Levenshtein
    if (expected === 1) {
      const fuzzyResult = tryFuzzyMatch(result, search);
      if (fuzzyResult) {
        result = result.slice(0, fuzzyResult.index) + replace + result.slice(fuzzyResult.index + fuzzyResult.length);
        matchTiers.push('fuzzy');
        continue;
      }
    }

    // All tiers failed
    const bestMatch = findBestMatchForError(result, search);
    const similarity = bestMatch ? ` (best match: ${Math.round(bestMatch.similarity * 100)}% similar at line ${bestMatch.line})` : '';

    if (index === 0) {
      return {
        success: false,
        html: result,
        error: `Operation ${index + 1}/${operations.length} failed: search text not found${similarity}`,
        bestMatch,
      };
    }

    return {
      success: 'partial',
      html: result,
      appliedCount: index,
      failedIndex: index,
      error: `Operation ${index + 1}/${operations.length} failed: search text not found${similarity}`,
      bestMatch,
      matchTiers,
    };
  }

  return { success: true, html: result, matchTiers };
}
