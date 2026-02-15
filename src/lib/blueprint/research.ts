import { generateObject } from 'ai';
import { searchBrave } from '@/lib/search/brave';
import { searchTavily } from '@/lib/search/tavily';
import { siteFactsSchema, type SiteFacts } from '@/lib/blueprint/types';
import type { SearchResult } from '@/lib/search/types';
import type { LanguageModel } from 'ai';

const MAX_SEARCH_RESULTS = 5;

/**
 * Search for business details using Brave (primary) with Tavily fallback.
 * Returns raw search results or empty array on failure.
 */
async function searchForBusiness(siteName: string, siteDescription: string): Promise<SearchResult[]> {
  const query = `${siteName} ${siteDescription}`;

  try {
    const results = await searchBrave(query, MAX_SEARCH_RESULTS);
    if (results.length > 0) return results;
  } catch {
    // Fall through to Tavily
  }

  try {
    const results = await searchTavily(query, MAX_SEARCH_RESULTS);
    if (results.length > 0) return results;
  } catch {
    // Both failed
  }

  return [];
}

/**
 * Extract structured site facts from raw search results using an AI model.
 */
async function extractFacts(
  model: LanguageModel,
  siteName: string,
  siteDescription: string,
  searchResults: SearchResult[],
): Promise<SiteFacts | null> {
  const snippets = searchResults
    .map((r) => `[${r.title}](${r.url})\n${r.snippet}`)
    .join('\n\n');

  try {
    const { object } = await generateObject({
      model,
      schema: siteFactsSchema,
      maxOutputTokens: 1024,
      prompt: `Extract verified business details for "${siteName}" (${siteDescription}) from these search results. Only include facts you are confident about from the search results. Leave fields empty/omitted if not found.

Search results:
${snippets}`,
    });

    // Check if we got anything useful (at least one non-empty field)
    const hasContent = Object.values(object).some((v) =>
      v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0) && !(typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0)
    );

    return hasContent ? object : null;
  } catch (err) {
    console.warn('[blueprint-research] Fact extraction failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Research site facts for a blueprint. Searches the web and extracts structured
 * business details. Returns null if search finds nothing or extraction fails.
 */
export async function researchSiteFacts(
  model: LanguageModel,
  siteName: string,
  siteDescription: string,
): Promise<SiteFacts | null> {
  const searchResults = await searchForBusiness(siteName, siteDescription);
  if (searchResults.length === 0) return null;

  return extractFacts(model, siteName, siteDescription, searchResults);
}
