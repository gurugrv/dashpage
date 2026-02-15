import search from 'approx-string-match';
import { findOriginalPosition } from '@/lib/parser/edit-operations/find-original-position';
import type {
  ApplyResult,
  EditOperation,
  MatchTier,
  BestMatch,
  FailedOperation,
} from '@/lib/parser/edit-operations/types';

const FUZZY_THRESHOLD = 0.85;
const AUTO_CORRECT_THRESHOLD = 0.75;

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
 * Tier 4/5: Fuzzy match using Myers' bit-parallel algorithm.
 * Finds approximate substring matches in O((k/w)*n) time.
 */
function tryFuzzyMatch(
  source: string,
  searchStr: string,
  threshold: number,
): { index: number; length: number; similarity: number } | null {
  const searchLen = searchStr.length;
  if (searchLen === 0 || source.length === 0) return null;

  const maxErrors = Math.max(1, Math.floor(searchLen * (1 - threshold)));
  const matches = search(source, searchStr, maxErrors);
  if (matches.length === 0) return null;

  // Pick the best match (lowest error count)
  let best = matches[0];
  for (let i = 1; i < matches.length; i++) {
    if (matches[i].errors < best.errors) {
      best = matches[i];
    }
  }

  const matchLength = best.end - best.start;
  const maxLen = Math.max(matchLength, searchLen);
  const similarity = 1 - best.errors / maxLen;

  return { index: best.start, length: matchLength, similarity };
}

/**
 * Find the best approximate match for error reporting, regardless of threshold.
 * Uses a generous maxErrors (70% of search length) to find any plausible match.
 */
function findBestMatchForError(source: string, searchStr: string): BestMatch | null {
  if (!searchStr.trim() || !source) return null;

  const searchLen = searchStr.length;
  const maxErrors = Math.max(1, Math.floor(searchLen * 0.7));
  const matches = search(source, searchStr, maxErrors);
  if (matches.length === 0) return null;

  // Pick the best match (lowest error count)
  let best = matches[0];
  for (let i = 1; i < matches.length; i++) {
    if (matches[i].errors < best.errors) {
      best = matches[i];
    }
  }

  const matchLength = best.end - best.start;
  const maxLen = Math.max(matchLength, searchLen);
  const similarity = 1 - best.errors / maxLen;

  if (similarity < 0.3) return null;

  const matchText = source.slice(best.start, best.end).split('\n').slice(0, 3).join('\n');
  // Include surrounding lines for context so the AI can construct accurate search strings on retry
  const lineStart = lineNumberAt(source, best.start);
  const contextStart = source.lastIndexOf('\n', Math.max(0, best.start - 1));
  const contextEnd = source.indexOf('\n', best.end);
  const surroundingStart = Math.max(0, contextStart === -1 ? 0 : contextStart + 1);
  const surroundingEnd = contextEnd === -1 ? source.length : contextEnd;
  const surrounding = source.slice(surroundingStart, surroundingEnd).split('\n').slice(0, 5).join('\n');
  return {
    text: matchText.length > 150 ? matchText.slice(0, 150) + '...' : matchText,
    surrounding: surrounding.length > 300 ? surrounding.slice(0, 300) + '...' : surrounding,
    similarity: Math.round(similarity * 100) / 100,
    line: lineStart,
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
 * Apply a sequence of edit operations with 5-tier matching.
 * Continues through ALL operations even when some fail, maximizing applied changes.
 */
export function applyEditOperations(html: string, operations: EditOperation[]): ApplyResult {
  let result = html;
  const matchTiers: MatchTier[] = [];
  const failedOps: FailedOperation[] = [];

  for (let index = 0; index < operations.length; index++) {
    const { search, replace, expectedReplacements } = operations[index];
    const expected = expectedReplacements ?? 1;

    if (!search) {
      failedOps.push({
        index,
        error: `Operation ${index + 1}/${operations.length} failed: empty search string`,
        bestMatch: null,
      });
      continue;
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

    // Tier 4+5: Fuzzy Levenshtein — single scan, two thresholds
    if (expected === 1) {
      const fuzzyResult = tryFuzzyMatch(result, search, AUTO_CORRECT_THRESHOLD);
      if (fuzzyResult) {
        result = result.slice(0, fuzzyResult.index) + replace + result.slice(fuzzyResult.index + fuzzyResult.length);
        matchTiers.push(fuzzyResult.similarity >= FUZZY_THRESHOLD ? 'fuzzy' : 'auto-correct');
        continue;
      }
    }

    // All tiers failed — record failure and continue with remaining operations
    const bestMatch = findBestMatchForError(result, search);
    const similarity = bestMatch ? ` (best match: ${Math.round(bestMatch.similarity * 100)}% similar at line ${bestMatch.line})` : '';
    failedOps.push({
      index,
      error: `Operation ${index + 1}/${operations.length} failed: search text not found${similarity}`,
      bestMatch,
    });
  }

  if (failedOps.length === 0) {
    return { success: true, html: result, matchTiers };
  }

  const appliedCount = operations.length - failedOps.length;
  const errorSummary = failedOps.map((f) => f.error).join('; ');

  if (appliedCount === 0) {
    return {
      success: false,
      html: result,
      error: errorSummary,
      bestMatch: failedOps[0].bestMatch,
    };
  }

  return {
    success: 'partial',
    html: result,
    appliedCount,
    failedCount: failedOps.length,
    failedOperations: failedOps,
    error: errorSummary,
    bestMatch: failedOps[0].bestMatch,
    matchTiers,
  };
}
