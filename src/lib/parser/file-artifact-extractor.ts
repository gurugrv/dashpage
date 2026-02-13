import type { ProjectFiles } from '@/types';

/** Strip markdown code fences (```html ... ```) that LLMs sometimes wrap around file content. */
function stripCodeFences(text: string): string {
  // Match opening ```lang at the start and closing ``` at the end
  return text.replace(/^\s*```\w*\n?/, '').replace(/\n?```\s*$/, '');
}

const TAG_OPEN = '<fileArtifact>';
const TAG_CLOSE = '</fileArtifact>';
const FILE_OPEN_REGEX = /<file\s+path="([^"]+)">/;
const FILE_CLOSE = '</file>';

interface FileArtifactParseResult {
  files: ProjectFiles;
  explanation: string;
  isComplete: boolean;
  hasFileArtifactTag: boolean;
}

export class FileArtifactExtractor {
  private buffer = '';
  private insideArtifact = false;
  private explanation = '';

  parse(chunk: string): FileArtifactParseResult {
    this.buffer += chunk;

    if (!this.insideArtifact) {
      const openIndex = this.buffer.indexOf(TAG_OPEN);
      if (openIndex === -1) {
        return { files: {}, explanation: this.buffer, isComplete: false, hasFileArtifactTag: false };
      }

      this.explanation = this.buffer.slice(0, openIndex).trim();
      this.insideArtifact = true;
      this.buffer = this.buffer.slice(openIndex + TAG_OPEN.length);
    }

    const isComplete = this.buffer.includes(TAG_CLOSE);
    const content = isComplete
      ? this.buffer.slice(0, this.buffer.indexOf(TAG_CLOSE))
      : this.buffer;

    return {
      files: this.extractFiles(content),
      explanation: this.explanation,
      isComplete,
      hasFileArtifactTag: true,
    };
  }

  reset() {
    this.buffer = '';
    this.insideArtifact = false;
    this.explanation = '';
  }

  private extractFiles(content: string): ProjectFiles {
    const files: ProjectFiles = {};
    let position = 0;

    while (position < content.length) {
      const remaining = content.slice(position);
      const openMatch = FILE_OPEN_REGEX.exec(remaining);
      if (!openMatch) break;

      const path = openMatch[1];
      const contentStart = position + openMatch.index + openMatch[0].length;
      const closeIndex = content.indexOf(FILE_CLOSE, contentStart);
      if (closeIndex === -1) {
        // Incomplete file block during streaming - capture what we have
        if (path && path.trim()) {
          files[path] = stripCodeFences(content.slice(contentStart));
        }
        break;
      }

      if (path && path.trim()) {
        files[path] = stripCodeFences(content.slice(contentStart, closeIndex));
      }

      position = closeIndex + FILE_CLOSE.length;
    }

    return files;
  }
}
