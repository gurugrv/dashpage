export interface PexelsPhoto {
  id: number;
  width: number;
  height: number;
  alt: string;
  photographer: string;
  src: {
    original: string;
    large2x: string;
    large: string;
    medium: string;
    small: string;
    landscape: string;
  };
}

interface PexelsSearchResponse {
  photos: PexelsPhoto[];
  total_results: number;
}

interface SearchOptions {
  orientation?: 'landscape' | 'portrait' | 'square';
  size?: 'large' | 'medium' | 'small';
  perPage?: number;
}

interface CacheEntry {
  photos: PexelsPhoto[];
  timestamp: number;
}

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_CACHE_ENTRIES = 200;

const cache = new Map<string, CacheEntry>();

function evictStaleEntries() {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (now - entry.timestamp > CACHE_TTL_MS) {
      cache.delete(key);
    }
  }
  // LRU eviction: remove oldest entries if over limit
  if (cache.size > MAX_CACHE_ENTRIES) {
    const entries = [...cache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp);
    const toRemove = cache.size - MAX_CACHE_ENTRIES;
    for (let i = 0; i < toRemove; i++) {
      cache.delete(entries[i][0]);
    }
  }
}

function buildCacheKey(query: string, options: SearchOptions): string {
  const normalized = query.toLowerCase().trim();
  return `${normalized}|${options.orientation ?? ''}|${options.size ?? ''}|${options.perPage ?? 15}`;
}

export async function searchPhotos(
  query: string,
  options: SearchOptions = {},
): Promise<PexelsPhoto[]> {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) {
    throw new Error('PEXELS_API_KEY environment variable is not set');
  }

  const cacheKey = buildCacheKey(query, options);
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    // Refresh timestamp for LRU
    cached.timestamp = Date.now();
    return cached.photos;
  }

  const params = new URLSearchParams({
    query,
    per_page: String(options.perPage ?? 15),
  });
  if (options.orientation) params.set('orientation', options.orientation);
  if (options.size) params.set('size', options.size);

  const response = await fetch(`https://api.pexels.com/v1/search?${params}`, {
    headers: { Authorization: apiKey },
  });

  if (!response.ok) {
    throw new Error(`Pexels API error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as PexelsSearchResponse;

  evictStaleEntries();
  cache.set(cacheKey, { photos: data.photos, timestamp: Date.now() });

  return data.photos;
}
