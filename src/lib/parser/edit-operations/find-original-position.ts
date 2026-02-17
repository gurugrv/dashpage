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
