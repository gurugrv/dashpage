type StructuredTag = {
  open: string;
  close: string;
};

const STRUCTURED_TAGS: StructuredTag[] = [
  { open: '<editOperations', close: '</editOperations>' },
  { open: '<htmlOutput>', close: '</htmlOutput>' },
  { open: '<fileArtifact>', close: '</fileArtifact>' },
];

function startsWithIgnoreCase(input: string, search: string, position: number): boolean {
  return input.slice(position, position + search.length).toLowerCase() === search.toLowerCase();
}

function indexOfIgnoreCase(input: string, search: string, fromIndex: number): number {
  return input.toLowerCase().indexOf(search.toLowerCase(), fromIndex);
}

function isPotentialStructuredTagPrefix(input: string, index: number): boolean {
  const lowerTail = input.slice(index).toLowerCase();
  return STRUCTURED_TAGS.some((tag) => tag.open.toLowerCase().startsWith(lowerTail));
}

export function parseAssistantForChat(input: string): string {
  let i = 0;
  let output = '';
  let insideTag: StructuredTag | undefined;
  let consumedStructuredArtifact = false;

  while (i < input.length) {
    if (insideTag) {
      const closeIndex = indexOfIgnoreCase(input, insideTag.close, i);
      if (closeIndex === -1) break;
      i = closeIndex + insideTag.close.length;
      insideTag = undefined;
      consumedStructuredArtifact = true;
      continue;
    }

    if (consumedStructuredArtifact) {
      break;
    }

    const closeTag = STRUCTURED_TAGS.find((tag) => startsWithIgnoreCase(input, tag.close, i));
    if (closeTag) {
      i += closeTag.close.length;
      continue;
    }

    const openTag = STRUCTURED_TAGS.find((tag) => startsWithIgnoreCase(input, tag.open, i));
    if (openTag) {
      insideTag = openTag;
      // Advance past the full opening tag including attributes and closing >
      const closingBracket = input.indexOf('>', i + openTag.open.length);
      i = closingBracket !== -1 ? closingBracket + 1 : i + openTag.open.length;
      continue;
    }

    if (input[i] === '<' && isPotentialStructuredTagPrefix(input, i)) {
      break;
    }

    output += input[i];
    i++;
  }

  return output.trim();
}

export function extractPostArtifactSummary(input: string): string {
  const lower = input.toLowerCase();
  let lastCloseEnd = -1;

  for (const tag of STRUCTURED_TAGS) {
    const close = tag.close.toLowerCase();
    const index = lower.lastIndexOf(close);
    if (index !== -1) {
      const closeEnd = index + tag.close.length;
      if (closeEnd > lastCloseEnd) {
        lastCloseEnd = closeEnd;
      }
    }
  }

  if (lastCloseEnd === -1) return '';
  return input.slice(lastCloseEnd).trim();
}
