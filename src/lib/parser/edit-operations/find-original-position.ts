export function findOriginalPosition(original: string, normalizedPos: number): number {
  let normCount = 0;
  let inWhitespace = false;

  for (let i = 0; i < original.length; i++) {
    if (normCount === normalizedPos) return i;

    const isWhitespace = /\s/.test(original[i]);
    if (isWhitespace) {
      if (!inWhitespace) {
        normCount++;
        inWhitespace = true;
      }
    } else {
      normCount++;
      inWhitespace = false;
    }
  }

  if (normCount === normalizedPos) return original.length;
  return -1;
}
