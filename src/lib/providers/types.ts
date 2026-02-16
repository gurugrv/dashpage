import type { LanguageModel } from 'ai';

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  maxOutputTokens: number;
}

export interface ProviderConfig {
  name: string;
  envKey: string;
  createModel: (apiKey: string, modelId: string) => LanguageModel;
  staticModels: ModelInfo[];
  fetchModels?: (apiKey: string) => Promise<ModelInfo[]>;
  /** Set to false if the provider rejects JSON Schema constraints like minItems/minLength (default: true) */
  supportsStructuredOutput?: boolean;
}

export interface OpenRouterModelResponse {
  data: Array<{
    id: string;
    name: string;
    context_length?: number;
    top_provider?: { max_completion_tokens?: number };
  }>;
}

export interface AnthropicModelResponse {
  data: Array<{
    id: string;
    display_name?: string;
  }>;
}

export interface GoogleModelResponse {
  models: Array<{
    name: string;
    displayName: string;
    supportedGenerationMethods?: string[];
    outputTokenLimit?: number;
  }>;
}

export interface OpenAIModelResponse {
  data: Array<{
    id: string;
  }>;
}
