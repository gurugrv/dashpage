export const ARTIFACT_COMPLETION_MESSAGE = 'Generation complete. Preview updated.';

/**
 * Sanitize assistant message text for persistence/display.
 * With tool calling, text parts are clean (no embedded XML artifact tags),
 * so this simply trims the input.
 */
export function sanitizeAssistantMessage(content: string): string {
  return content.trim();
}

/**
 * Sanitize with fallback to a default completion message when text is empty
 * but an artifact was generated.
 */
export function sanitizeAssistantMessageWithFallback(content: string, hasHtmlArtifact = false): string {
  const sanitized = content.trim();
  if (sanitized) return sanitized;
  if (hasHtmlArtifact) return ARTIFACT_COMPLETION_MESSAGE;
  return '';
}

/**
 * Ensure there's a visible completion message when an artifact was produced.
 */
export function ensureArtifactCompletionMessage(
  visibleContent: string,
  _sourceContent: string,
  hasHtmlArtifact = false,
): string {
  const cleaned = visibleContent.trim();
  if (cleaned) return cleaned;
  if (hasHtmlArtifact) return ARTIFACT_COMPLETION_MESSAGE;
  return '';
}
