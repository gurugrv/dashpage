const STRUCTURED_TAGS = ['editOperations', 'htmlOutput'] as const;
const STRUCTURED_TAG_OPENERS = STRUCTURED_TAGS.map((tag) => `<${tag}>`);
const STRUCTURED_TAG_CLOSERS = STRUCTURED_TAGS.map((tag) => `</${tag}>`);

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

function findLastStructuredCloseIndex(content: string): number {
  const lower = content.toLowerCase();
  let lastCloseEnd = -1;

  for (const closer of STRUCTURED_TAG_CLOSERS) {
    const index = lower.lastIndexOf(closer.toLowerCase());
    if (index !== -1) {
      const closeEnd = index + closer.length;
      if (closeEnd > lastCloseEnd) {
        lastCloseEnd = closeEnd;
      }
    }
  }

  return lastCloseEnd;
}

function hasPostArtifactSummary(content: string): boolean {
  const lastCloseEnd = findLastStructuredCloseIndex(content);
  if (lastCloseEnd === -1) return false;
  return content.slice(lastCloseEnd).trim().length > 0;
}

export function sanitizeAssistantMessageWithFallback(content: string, hasHtmlArtifact = false): string {
  const sanitized = sanitizeAssistantMessage(content);
  if (sanitized) return sanitized;

  if (hasHtmlArtifact || hasStructuredArtifactOutput(content)) {
    return ARTIFACT_COMPLETION_MESSAGE;
  }

  return '';
}

export function ensureArtifactCompletionMessage(
  visibleContent: string,
  sourceContent: string,
  hasHtmlArtifact = false,
): string {
  const cleaned = visibleContent.trim();
  const hasArtifact = hasHtmlArtifact || hasStructuredArtifactOutput(sourceContent);

  if (!hasArtifact) return cleaned;
  if (!cleaned) return ARTIFACT_COMPLETION_MESSAGE;
  if (hasPostArtifactSummary(sourceContent)) return cleaned;
  return cleaned;
}
