import { resolveApiKey } from '@/lib/keys/key-manager';
import { PROVIDERS } from '@/lib/providers/registry';
import { buildTemporalContext, resolvePreferredTimeZone } from '@/lib/prompts/temporal-context';
import { ChatRequestError } from '@/lib/chat/errors';
import { getBlueprintSystemPrompt } from '@/lib/blueprint/prompts/blueprint-system-prompt';
import { getPageSystemPrompt } from '@/lib/blueprint/prompts/page-system-prompt';
import type { Blueprint, BlueprintPage } from '@/lib/blueprint/types';

interface ResolveBlueprintExecutionInput {
  provider: string;
  model: string;
  savedTimeZone?: string | null;
  browserTimeZone?: string;
}

interface ResolvedBlueprintExecution {
  modelInstance: ReturnType<(typeof PROVIDERS)[keyof typeof PROVIDERS]['createModel']>;
  systemPrompt: string;
}

export async function resolveBlueprintExecution({
  provider,
  model,
  savedTimeZone,
  browserTimeZone,
}: ResolveBlueprintExecutionInput): Promise<ResolvedBlueprintExecution> {
  const apiKey = await resolveApiKey(provider);
  if (!apiKey) {
    throw new ChatRequestError(`No API key for ${provider}`);
  }

  const providerConfig = PROVIDERS[provider];
  if (!providerConfig) {
    throw new ChatRequestError(`Unknown provider: ${provider}`);
  }

  const preferredTimeZone = resolvePreferredTimeZone(savedTimeZone, browserTimeZone);
  const temporalContext = buildTemporalContext(preferredTimeZone);
  const systemPrompt = getBlueprintSystemPrompt(temporalContext);
  const modelInstance = providerConfig.createModel(apiKey, model);

  return { modelInstance, systemPrompt };
}

interface ResolvedPageExecution {
  modelInstance: ReturnType<(typeof PROVIDERS)[keyof typeof PROVIDERS]['createModel']>;
  systemPrompt: string;
}

export async function resolvePageExecution({
  provider,
  model,
  blueprint,
  page,
}: ResolveBlueprintExecutionInput & { blueprint: Blueprint; page: BlueprintPage }): Promise<ResolvedPageExecution> {
  const apiKey = await resolveApiKey(provider);
  if (!apiKey) {
    throw new ChatRequestError(`No API key for ${provider}`);
  }

  const providerConfig = PROVIDERS[provider];
  if (!providerConfig) {
    throw new ChatRequestError(`Unknown provider: ${provider}`);
  }

  const systemPrompt = getPageSystemPrompt(blueprint, page);
  const modelInstance = providerConfig.createModel(apiKey, model);

  return { modelInstance, systemPrompt };
}
