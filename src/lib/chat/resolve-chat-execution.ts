import { getSystemPromptParts, type SystemPromptParts } from '@/lib/prompts/system-prompt';
import { buildTemporalContext, resolvePreferredTimeZone } from '@/lib/prompts/temporal-context';
import { resolveApiKey } from '@/lib/keys/key-manager';
import { PROVIDERS } from '@/lib/providers/registry';
import { resolveMaxOutputTokens as resolveMaxTokens, MAX_OUTPUT_SAFETY_CEILING } from '@/lib/chat/constants';
import { ChatRequestError } from '@/lib/chat/errors';

interface ResolveChatExecutionInput {
  provider: string;
  model: string;
  clientMaxTokens?: number;
  savedTimeZone?: string | null;
  browserTimeZone?: string;
  currentFiles?: Record<string, string>;
  userPrompt?: string;
}

interface ResolvedChatExecution {
  modelInstance: ReturnType<(typeof PROVIDERS)[keyof typeof PROVIDERS]['createModel']>;
  maxOutputTokens: number;
  systemPromptParts: SystemPromptParts;
  systemPrompt: string;
  provider: string;
}

export async function resolveChatExecution({
  provider,
  model,
  clientMaxTokens,
  savedTimeZone,
  browserTimeZone,
  currentFiles,
  userPrompt,
}: ResolveChatExecutionInput): Promise<ResolvedChatExecution> {
  const apiKey = await resolveApiKey(provider);
  if (!apiKey) {
    throw new ChatRequestError(`No API key for ${provider}`);
  }

  const providerConfig = PROVIDERS[provider];
  if (!providerConfig) {
    throw new ChatRequestError(`Unknown provider: ${provider}`);
  }

  const resolvedMax = resolveMaxTokens(providerConfig, model);
  const maxOutputTokens = Math.min(clientMaxTokens || resolvedMax, MAX_OUTPUT_SAFETY_CEILING);

  const preferredTimeZone = resolvePreferredTimeZone(savedTimeZone, browserTimeZone);
  const temporalContext = buildTemporalContext(preferredTimeZone);
  const systemPromptParts = getSystemPromptParts(currentFiles, temporalContext, userPrompt);
  const systemPrompt = systemPromptParts.stable + '\n' + systemPromptParts.dynamic;
  const modelInstance = providerConfig.createModel(apiKey, model);

  return { modelInstance, maxOutputTokens, systemPromptParts, systemPrompt, provider };
}
