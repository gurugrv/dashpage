const LITELLM_PRICING_URL =
  'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json';

interface ModelPricing {
  inputCostPerToken: number;
  outputCostPerToken: number;
}

interface LiteLLMEntry {
  input_cost_per_token?: number;
  output_cost_per_token?: number;
}

let cachedPrices: Record<string, LiteLLMEntry> | null = null;
let fetchPromise: Promise<Record<string, LiteLLMEntry>> | null = null;

async function loadPrices(): Promise<Record<string, LiteLLMEntry>> {
  if (cachedPrices) return cachedPrices;
  if (fetchPromise) return fetchPromise;

  fetchPromise = fetch(LITELLM_PRICING_URL)
    .then((res) => {
      if (!res.ok) throw new Error(`Failed to fetch pricing: ${res.status}`);
      return res.json() as Promise<Record<string, LiteLLMEntry>>;
    })
    .then((data) => {
      cachedPrices = data;
      fetchPromise = null;
      return data;
    })
    .catch((err) => {
      fetchPromise = null;
      console.warn('[model-pricing] Failed to load LiteLLM pricing:', err.message);
      return {} as Record<string, LiteLLMEntry>;
    });

  return fetchPromise;
}

function extractPricing(entry: LiteLLMEntry | undefined): ModelPricing | null {
  if (!entry) return null;
  const input = entry.input_cost_per_token;
  const output = entry.output_cost_per_token;
  if (input == null || output == null) return null;
  return { inputCostPerToken: input, outputCostPerToken: output };
}

/**
 * Look up per-token pricing for a model using LiteLLM's pricing database.
 *
 * Fallback chain:
 * 1. Exact match on modelId
 * 2. Provider-prefixed: `{provider}/{modelId}`
 * 3. Base name: strip our provider prefix (e.g. `google/gemini-2.0-flash` -> `gemini-2.0-flash`)
 * 4. With `-preview` suffix appended
 * 5. Return null (caller uses hardcoded estimate)
 */
export async function getModelPricing(
  modelId: string,
  provider?: string,
): Promise<ModelPricing | null> {
  const prices = await loadPrices();
  if (!prices || Object.keys(prices).length === 0) return null;

  // 1. Exact match
  const exact = extractPricing(prices[modelId]);
  if (exact) return exact;

  // 2. Provider-prefixed
  if (provider) {
    const prefixed = extractPricing(prices[`${provider}/${modelId}`]);
    if (prefixed) return prefixed;
  }

  // 3. Base name — strip provider prefix from modelId (e.g. "google/gemini-2.0-flash" -> "gemini-2.0-flash")
  if (modelId.includes('/')) {
    const baseName = modelId.split('/').pop()!;
    const base = extractPricing(prices[baseName]);
    if (base) return base;
  }

  // 4. With -preview suffix
  const preview = extractPricing(prices[`${modelId}-preview`]);
  if (preview) return preview;

  return null;
}
