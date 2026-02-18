/**
 * Server-side abort registry for in-flight generations.
 *
 * When a user starts a new generation on the same conversation, the previous
 * one is automatically aborted to avoid wasted API spend. Uses the same
 * globalThis singleton pattern as prisma.ts to survive HMR.
 */

const globalForRegistry = globalThis as unknown as {
  __generationRegistry: Map<string, AbortController> | undefined;
};

const registry: Map<string, AbortController> =
  globalForRegistry.__generationRegistry ?? new Map();

if (process.env.NODE_ENV !== 'production') {
  globalForRegistry.__generationRegistry = registry;
}

/**
 * Register a new generation for a conversation.
 * If a generation is already in-flight for this conversation, it is aborted
 * with reason "superseded" before the new one is registered.
 */
export function registerGeneration(conversationId: string, controller: AbortController): void {
  const existing = registry.get(conversationId);
  if (existing) {
    existing.abort('superseded');
    registry.delete(conversationId);
  }
  registry.set(conversationId, controller);
}

/**
 * Remove a generation from the registry (called on completion/abort).
 */
export function unregisterGeneration(conversationId: string): void {
  registry.delete(conversationId);
}

/**
 * Abort a generation for a conversation if one is in-flight.
 */
export function abortGeneration(conversationId: string): boolean {
  const existing = registry.get(conversationId);
  if (existing) {
    existing.abort('superseded');
    registry.delete(conversationId);
    return true;
  }
  return false;
}
