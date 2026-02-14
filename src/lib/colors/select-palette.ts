import { CURATED_PALETTES, type CuratedPalette } from './palettes';

export function selectPalettes(
  tags: string[],
  scheme: 'light' | 'dark' = 'light',
  count: number = 3,
): CuratedPalette[] {
  const normalizedTags = tags.map(t => t.toLowerCase().trim());
  const byScheme = CURATED_PALETTES.filter(p => p.scheme === scheme);

  if (byScheme.length === 0) return [];

  // Score by tag overlap count
  const scored = byScheme.map(palette => {
    const score = normalizedTags.reduce(
      (sum, tag) => sum + (palette.tags.includes(tag) ? 1 : 0),
      0,
    );
    return { palette, score };
  });

  scored.sort((a, b) => b.score - a.score);

  // If no tags match at all, return random palettes of correct scheme
  if (scored[0].score === 0) {
    const shuffled = [...byScheme].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  }

  return scored.slice(0, count).map(s => s.palette);
}
