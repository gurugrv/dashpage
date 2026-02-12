const STRUCTURED_TAGS = ['editOperations', 'htmlOutput'] as const;
const STRUCTURED_TAG_OPENERS = STRUCTURED_TAGS.map((tag) => `<${tag}>`);

export const ARTIFACT_COMPLETION_MESSAGE = 'Generation complete. Preview updated.';

function stripStructuredBlock(input: string, tag: (typeof STRUCTURED_TAGS)[number]): string {
  const completeBlock = new RegExp(`<${tag}>[\\s\\S]*?<\\/${tag}>`, 'gi');
  const trailingBlock = new RegExp(`<${tag}>[\\s\\S]*$`, 'i');
  return input.replace(completeBlock, '').replace(trailingBlock, '');
}

export function sanitizeAssistantMessage(content: string): string {
  let cleaned = content;

  for (const tag of STRUCTURED_TAGS) {
    cleaned = stripStructuredBlock(cleaned, tag);
  }

  return cleaned.trim();
}

export function hasStructuredArtifactOutput(content: string): boolean {
  const lower = content.toLowerCase();
  return STRUCTURED_TAG_OPENERS.some((opener) => lower.includes(opener));
}

export function sanitizeAssistantMessageWithFallback(content: string, hasHtmlArtifact = false): string {
  const sanitized = sanitizeAssistantMessage(content);
  if (sanitized) return sanitized;

  if (hasHtmlArtifact || hasStructuredArtifactOutput(content)) {
    return ARTIFACT_COMPLETION_MESSAGE;
  }

  return '';
}
