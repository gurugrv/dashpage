import { getSystemPrompt } from '@/lib/prompts/system-prompt';
import { buildTemporalContext, resolvePreferredTimeZone } from '@/lib/prompts/temporal-context';
import { resolveApiKey } from '@/lib/keys/key-manager';
import { PROVIDERS } from '@/lib/providers/registry';
import { MAX_OUTPUT_CAP } from '@/lib/chat/constants';
import { ChatRequestError } from '@/lib/chat/errors';

interface ResolveChatExecutionInput {
  provider: string;
  model: string;
  clientMaxTokens?: number;
  savedTimeZone?: string | null;
  browserTimeZone?: string;
  currentFiles?: Record<string, string>;
  appUrl: string;
}

interface ResolvedChatExecution {
  modelInstance: ReturnType<(typeof PROVIDERS)[keyof typeof PROVIDERS]['createModel']>;
  maxOutputTokens: number;
  systemPrompt: string;
}

export async function resolveChatExecution({
  provider,
  model,
  clientMaxTokens,
  savedTimeZone,
  browserTimeZone,
  currentFiles,
  appUrl,
}: ResolveChatExecutionInput): Promise<ResolvedChatExecution> {
  const apiKey = await resolveApiKey(provider);
  if (!apiKey) {
    throw new ChatRequestError(`No API key for ${provider}`);
  }

  const providerConfig = PROVIDERS[provider];
  if (!providerConfig) {
    throw new ChatRequestError(`Unknown provider: ${provider}`);
  }

  const modelConfig = providerConfig.staticModels.find((item) => item.id === model);
  const rawMax = clientMaxTokens ?? modelConfig?.maxOutputTokens ?? 16_384;
  const maxOutputTokens = Math.min(rawMax, MAX_OUTPUT_CAP);

  const preferredTimeZone = resolvePreferredTimeZone(savedTimeZone, browserTimeZone);
  const temporalContext = buildTemporalContext(preferredTimeZone);
  const systemPrompt = getSystemPrompt(appUrl, currentFiles, temporalContext);
  const modelInstance = providerConfig.createModel(apiKey, model);

  return { modelInstance, maxOutputTokens, systemPrompt };
}
