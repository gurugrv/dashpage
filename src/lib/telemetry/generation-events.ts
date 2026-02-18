import { prisma } from '@/lib/db/prisma';
import { Prisma } from '@/generated/prisma/client';
import { getModelPricing } from '@/lib/chat/model-pricing';

export interface GenerationEventData {
  conversationId?: string;
  scope: string;
  provider: string;
  model: string;
  finishReason?: string;
  inputTokens?: number;
  outputTokens?: number;
  durationMs: number;
  toolCallCount?: number;
  hasFileOutput?: boolean;
  repairTriggered?: boolean;
  textFallback?: boolean;
  metadata?: Record<string, unknown>;
}

/**
 * Record a generation event to the database.
 * Fire-and-forget: never blocks the generation response.
 */
export function recordGenerationEvent(data: GenerationEventData): void {
  void (async () => {
    try {
      const inputTokens = data.inputTokens ?? 0;
      const outputTokens = data.outputTokens ?? 0;

      let costUsd: number | null = null;
      if (inputTokens > 0 || outputTokens > 0) {
        const pricing = await getModelPricing(data.model, data.provider);
        if (pricing) {
          costUsd = inputTokens * pricing.inputCostPerToken + outputTokens * pricing.outputCostPerToken;
        }
      }

      await prisma.generationEvent.create({
        data: {
          conversationId: data.conversationId ?? null,
          scope: data.scope,
          provider: data.provider,
          model: data.model,
          finishReason: data.finishReason ?? null,
          inputTokens,
          outputTokens,
          durationMs: data.durationMs,
          toolCallCount: data.toolCallCount ?? 0,
          hasFileOutput: data.hasFileOutput ?? false,
          repairTriggered: data.repairTriggered ?? false,
          textFallback: data.textFallback ?? false,
          costUsd,
          metadata: (data.metadata as Prisma.InputJsonValue) ?? undefined,
        },
      });
    } catch (err) {
      console.warn('[telemetry] Failed to record generation event:', err instanceof Error ? err.message : err);
    }
  })();
}
