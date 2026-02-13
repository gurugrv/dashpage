/**
 * Extract text content from assistant message for display.
 * With tool calling, text parts are clean (no embedded XML tags),
 * so this simply returns the trimmed input.
 */
export function parseAssistantForChat(input: string): string {
  return input.trim();
}

/**
 * Extract post-artifact summary text.
 * With tool calling, summaries come from text parts after tool results,
 * not from text after XML closing tags. Returns empty for backwards compat.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function extractPostArtifactSummary(_input: string): string {
  return '';
}
