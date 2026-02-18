import { generateText, NoObjectGeneratedError, Output } from 'ai';
import { searchBrave } from '@/lib/search/brave';
import { searchTavily } from '@/lib/search/tavily';
import { siteFactsSchema, type SiteFacts } from '@/lib/blueprint/types';
import { repairAndParseJson } from '@/lib/blueprint/repair-json';
import type { SearchResult } from '@/lib/search/types';
import type { LanguageModel } from 'ai';
import { createDebugSession, isDebugEnabled, type DebugSession } from '@/lib/chat/stream-debug';

const MAX_SEARCH_RESULTS = 5;
const MAX_FETCH_URLS = 2;
const URL_FETCH_TIMEOUT_MS = 5_000;
const MAX_PAGE_CONTENT_LENGTH = 3_000;

/**
 * Ask the AI to generate an optimal search query from the site name + user prompt.
 * Falls back to just the site name if the AI call fails.
 */
async function generateSearchQuery(
  model: LanguageModel,
  siteName: string,
  userPrompt: string,
  debug?: DebugSession,
): Promise<string> {
  try {
    debug?.logToolStarting({ toolName: 'generateQuery', toolCallId: 'query-gen' });

    const result = await generateText({
      model,
      maxOutputTokens: 200,
      system: 'Output ONLY a web search query string. No explanation, no quotes, no markdown.',
      prompt: `We are building a website for a real business. We need to search the web to find their real details like address, phone number, hours, team members, services, and reviews.

Business name: "${siteName}"
User's request: ${userPrompt}

Build a search query that will find this business's actual online presence (Google listing, directory profiles, existing website, social media).

Rules:
- ALWAYS include the full business name "${siteName}"
- Include person names, locations, and industry keywords ONLY if explicitly mentioned by the user
- NEVER add locations, cities, or details the user did not mention — do not guess
- Add the business type/industry (e.g. "dentist", "restaurant") to help disambiguate
- If any location cue is present (city, state, country, neighborhood, landmark), append "address" to the query to help find the physical location
- Do NOT include design words (modern, premium, aesthetic, beautiful, etc.)
- Do NOT include website-building words (website, site, page, make, build, create, etc.)
- Keep under 120 characters

Examples:
- Business: "Sunrise Yoga" | Request: "make a site for Sunrise Yoga by Sarah Chen in Bali" → Sunrise Yoga Sarah Chen yoga studio Bali address
- Business: "Joe's Auto" | Request: "website for Joe's Auto, they do car repair in Phoenix" → Joe's Auto car repair Phoenix address
- Business: "Impressions Dental Centre" | Request: "make a website for Dr. Maninder Saluja, dentist, clinic is Impressions Dental Centre" → Impressions Dental Centre Dr. Maninder Saluja dentist
- Business: "Café Luna" | Request: "Café Luna in downtown Austin, TX" → Café Luna café Austin TX address`,
    });

    const raw = result.text.trim().replace(/^["']|["']$/g, '');
    // Ensure siteName is always present in the query
    const query = raw.toLowerCase().includes(siteName.toLowerCase().split(' ')[0].toLowerCase())
      ? raw
      : `${siteName} ${raw}`;
    debug?.logToolResult({ toolName: 'generateQuery', toolCallId: 'query-gen', output: { query } });

    return query.slice(0, 120).trimEnd() || siteName;
  } catch (err) {
    debug?.logToolResult({ toolName: 'generateQuery', toolCallId: 'query-gen', error: err instanceof Error ? err.message : 'Unknown error' });
    return siteName;
  }
}

/**
 * Run a search query against Brave (primary) with Tavily fallback.
 */
async function runSearch(
  query: string,
  count: number,
  debug?: DebugSession,
  idSuffix = '',
): Promise<SearchResult[]> {
  const braveId = `brave-search${idSuffix}`;
  const tavilyId = `tavily-search${idSuffix}`;

  try {
    debug?.logToolStarting({ toolName: 'searchBrave', toolCallId: braveId });
    debug?.logToolCall({ toolName: 'searchBrave', toolCallId: braveId, input: { query, count } });
    const results = await searchBrave(query, count);
    debug?.logToolResult({ toolName: 'searchBrave', toolCallId: braveId, output: { resultCount: results.length, titles: results.map((r) => r.title) } });
    if (results.length > 0) return results;
  } catch (err) {
    debug?.logToolResult({ toolName: 'searchBrave', toolCallId: braveId, error: err instanceof Error ? err.message : 'Unknown error' });
  }

  try {
    debug?.logToolStarting({ toolName: 'searchTavily', toolCallId: tavilyId });
    debug?.logToolCall({ toolName: 'searchTavily', toolCallId: tavilyId, input: { query, count } });
    const results = await searchTavily(query, count);
    debug?.logToolResult({ toolName: 'searchTavily', toolCallId: tavilyId, output: { resultCount: results.length, titles: results.map((r) => r.title) } });
    if (results.length > 0) return results;
  } catch (err) {
    debug?.logToolResult({ toolName: 'searchTavily', toolCallId: tavilyId, error: err instanceof Error ? err.message : 'Unknown error' });
  }

  return [];
}

/**
 * Check if search results are relevant to the business by seeing if the site name
 * or key terms appear in at least some result titles/snippets.
 */
function resultsLookRelevant(results: SearchResult[], siteName: string): boolean {
  const nameWords = siteName.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  let matchCount = 0;

  for (const r of results) {
    const text = `${r.title} ${r.snippet}`.toLowerCase();
    const hasMatch = nameWords.some((w) => text.includes(w));
    if (hasMatch) matchCount++;
  }

  // At least 40% of results should mention the business
  return matchCount >= Math.ceil(results.length * 0.4);
}

/**
 * Search for business details with AI-generated query and multi-query fallback.
 * If the first query returns irrelevant results, tries a refined second query.
 */
async function searchForBusiness(
  model: LanguageModel,
  siteName: string,
  userPrompt: string,
  debug?: DebugSession,
): Promise<SearchResult[]> {
  // Primary query: AI-generated
  const query = await generateSearchQuery(model, siteName, userPrompt, debug);
  const results = await runSearch(query, MAX_SEARCH_RESULTS, debug);

  if (results.length > 0 && resultsLookRelevant(results, siteName)) {
    return results;
  }

  // Fallback query: more specific with address/phone/hours to target directory listings
  if (results.length === 0 || !resultsLookRelevant(results, siteName)) {
    const fallbackQuery = `"${siteName}" address phone hours`;
    debug?.logToolStarting({ toolName: 'fallbackQuery', toolCallId: 'fallback-query' });
    debug?.logToolResult({ toolName: 'fallbackQuery', toolCallId: 'fallback-query', output: { reason: 'primary results irrelevant', fallbackQuery } });

    const fallbackResults = await runSearch(fallbackQuery, MAX_SEARCH_RESULTS, debug, '-fallback');
    if (fallbackResults.length > 0 && resultsLookRelevant(fallbackResults, siteName)) {
      return fallbackResults;
    }

    // If fallback also failed but we had some primary results, use those anyway
    if (results.length > 0) return results;
    if (fallbackResults.length > 0) return fallbackResults;
  }

  return results;
}

/**
 * Fetch page content from the top search result URLs for richer extraction.
 * Returns truncated text content, skipping failed fetches.
 */
async function fetchTopUrls(
  results: SearchResult[],
  debug?: DebugSession,
): Promise<string> {
  // Pick the top URLs, preferring the business's own website over directories
  const urlsToFetch = results
    .slice(0, MAX_FETCH_URLS)
    .map((r) => r.url);

  if (urlsToFetch.length === 0) return '';

  debug?.logToolStarting({ toolName: 'fetchUrls', toolCallId: 'url-fetch' });

  const fetchResults = await Promise.allSettled(
    urlsToFetch.map(async (url) => {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(URL_FETCH_TIMEOUT_MS),
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AIBuilder/1.0)' },
      });
      if (!response.ok) return null;
      const html = await response.text();
      const text = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, MAX_PAGE_CONTENT_LENGTH);
      return text.length > 100 ? `[Page content from ${url}]\n${text}` : null;
    }),
  );

  const fetched = fetchResults
    .filter((r): r is PromiseFulfilledResult<string | null> => r.status === 'fulfilled')
    .map((r) => r.value)
    .filter((v): v is string => v !== null);

  debug?.logToolResult({
    toolName: 'fetchUrls',
    toolCallId: 'url-fetch',
    output: { attempted: urlsToFetch.length, fetched: fetched.length },
  });

  return fetched.join('\n\n');
}

/**
 * Extract structured site facts from search results + page content using an AI model.
 */
async function extractFacts(
  model: LanguageModel,
  siteName: string,
  userPrompt: string,
  searchResults: SearchResult[],
  pageContent: string,
  debug?: DebugSession,
): Promise<SiteFacts | null> {
  const snippets = searchResults
    .map((r) => `[${r.title}](${r.url})\n${r.snippet}`)
    .join('\n\n');

  const pageSection = pageContent
    ? `\n\nAdditional page content fetched from top results:\n${pageContent}`
    : '';

  const prompt = `You are extracting verified business details for "${siteName}" from web search results.

The user asked: "${userPrompt}"

RELEVANCE CHECK: First, determine if these search results are actually about "${siteName}". If the results are about a DIFFERENT business or unrelated topics, return ALL empty fields — do NOT extract details from unrelated results.

SEARCH RESULTS:
${snippets}${pageSection}

EXTRACTION RULES:
1. Source priority: Official website > Google/Maps listing > Business directories (Practo, Yelp, Sehat) > Review sites > Social media
2. Only include facts you are CONFIDENT about — prefer empty string over guessed data
3. If multiple sources conflict, prefer the official website or most recent source
4. For "services": extract specific service names, not generic categories. If the business type is clear (e.g. "dentist") but no specific services are listed, infer common services for that industry (e.g. ["Root Canal", "Teeth Whitening", "Dental Implants", "Orthodontics", "General Checkups"])
5. For "address": include full address with city/state/zip if available
7. For "hours": use a consistent format like "Mon-Fri: 9am-5pm, Sat: 10am-2pm"
8. For "socialMedia": format as "Platform: URL" pairs separated by commas
9. Use empty string "" for unknown text fields and empty array [] for unknown list fields`;

  try {
    debug?.logPrompt({
      systemPrompt: '(structured object extraction)',
      messages: [{ role: 'user', content: prompt }],
      maxOutputTokens: 4096,
    });

    const result = await generateText({
      model,
      output: Output.object({ schema: siteFactsSchema }),
      maxOutputTokens: 4096,
      prompt,
    });

    // Try structured output first, fall back to repair
    let facts: SiteFacts | undefined;
    try {
      facts = result.output ?? undefined;
    } catch {
      // fall through to repair
    }

    if (!facts && result.text) {
      const repaired = repairAndParseJson(result.text, siteFactsSchema);
      if (repaired) {
        console.info('[blueprint-research] Site facts JSON repair succeeded');
        facts = repaired;
      }
    }

    if (!facts) {
      debug?.logResponse({
        response: '(failed to parse site facts)',
        status: 'error',
      });
      return null;
    }

    // Check if we got anything useful (at least one non-empty field)
    const hasContent = Object.values(facts).some((v) =>
      v !== undefined && v !== null && v !== '' &&
      !(Array.isArray(v) && v.length === 0)
    );

    const finalResult = hasContent ? facts : null;
    debug?.logResponse({
      response: finalResult ? JSON.stringify(finalResult, null, 2) : '(no useful facts extracted)',
      status: 'complete',
    });

    return finalResult;
  } catch (err) {
    // Handle NoObjectGeneratedError with repair fallback
    if (NoObjectGeneratedError.isInstance(err) && err.text) {
      const repaired = repairAndParseJson(err.text, siteFactsSchema);
      if (repaired) {
        console.info('[blueprint-research] Site facts JSON repair succeeded (from error)');
        debug?.logResponse({
          response: JSON.stringify(repaired, null, 2),
          status: 'complete',
        });
        return repaired;
      }
    }

    debug?.logResponse({
      response: err instanceof Error ? err.message : 'Unknown error',
      status: 'error',
    });
    console.warn('[blueprint-research] Fact extraction failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Research site facts for a blueprint. Searches the web, fetches top pages,
 * and extracts structured business details.
 * Returns null if search finds nothing or extraction fails.
 */
export async function researchSiteFacts(
  model: LanguageModel,
  siteName: string,
  userPrompt: string,
  params?: { conversationId?: string; provider?: string; model?: string; businessWebsite?: string },
): Promise<SiteFacts | null> {
  const debug = isDebugEnabled()
    ? createDebugSession({
        scope: 'site-research',
        model: params?.model,
        provider: params?.provider,
        conversationId: params?.conversationId,
      })
    : undefined;

  debug?.logPrompt({
    systemPrompt: `Researching site facts for: "${siteName}"`,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const searchResults = await searchForBusiness(model, siteName, userPrompt, debug);

  if (searchResults.length === 0 && !params?.businessWebsite) {
    debug?.logResponse({ response: 'No search results found', status: 'complete' });
    debug?.finish('complete');
    debug?.logGenerationSummary?.({
      finishReason: 'no-results',
      hasFileOutput: false,
      toolCallCount: 0,
      structuredOutput: true,
      rawTextLength: 0,
    });
    return null;
  }

  // Fetch top URLs for richer content + direct website fetch if provided by discovery
  const fetchPromises: Promise<string>[] = [fetchTopUrls(searchResults, debug)];

  if (params?.businessWebsite) {
    fetchPromises.push(
      (async () => {
        try {
          debug?.logToolStarting({ toolName: 'fetchBusinessWebsite', toolCallId: 'biz-website' });
          const response = await fetch(params.businessWebsite!, {
            signal: AbortSignal.timeout(URL_FETCH_TIMEOUT_MS),
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AIBuilder/1.0)' },
          });
          if (!response.ok) return '';
          const html = await response.text();
          const text = html
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, MAX_PAGE_CONTENT_LENGTH);
          debug?.logToolResult({ toolName: 'fetchBusinessWebsite', toolCallId: 'biz-website', output: { length: text.length } });
          return text.length > 100 ? `[Business website: ${params.businessWebsite}]\n${text}` : '';
        } catch {
          debug?.logToolResult({ toolName: 'fetchBusinessWebsite', toolCallId: 'biz-website', error: 'fetch failed' });
          return '';
        }
      })(),
    );
  }

  const [searchPageContent, websiteContent] = await Promise.all(fetchPromises);
  const pageContent = [searchPageContent, websiteContent].filter(Boolean).join('\n\n');

  const facts = await extractFacts(model, siteName, userPrompt, searchResults, pageContent, debug);

  debug?.finish('complete');
  debug?.logGenerationSummary?.({
    finishReason: facts ? 'complete' : 'no-facts',
    hasFileOutput: false,
    toolCallCount: searchResults.length > 0 ? 1 : 0,
    structuredOutput: true,
    rawTextLength: facts ? JSON.stringify(facts).length : 0,
  });

  return facts;
}
