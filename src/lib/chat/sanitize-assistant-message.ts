export const ARTIFACT_COMPLETION_MESSAGE = 'Generation complete. Preview updated.';

/** Strip reasoning/thinking tags emitted by some models (DeepSeek, QwQ, etc.) */
const THINKING_TAG_RE = /<think>[\s\S]*?<\/think>\s*/g;
/** Strip unclosed thinking tags (during streaming, closing tag hasn't arrived yet) */
const THINKING_TAG_UNCLOSED_RE = /<think>[\s\S]*$/;

/**
 * Sanitize assistant message text for persistence/display.
 * Strips model reasoning tags (<think>...</think>) and trims whitespace.
 */
export function sanitizeAssistantMessage(content: string): string {
  return content.replace(THINKING_TAG_RE, '').replace(THINKING_TAG_UNCLOSED_RE, '').trim();
}

/**
 * Sanitize with fallback to a default completion message when text is empty
 * but an artifact was generated.
 */
export function sanitizeAssistantMessageWithFallback(content: string, hasHtmlArtifact = false): string {
  const sanitized = content.replace(THINKING_TAG_RE, '').replace(THINKING_TAG_UNCLOSED_RE, '').trim();
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
