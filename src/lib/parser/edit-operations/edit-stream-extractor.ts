import type { EditOperation, EditParseResult } from '@/lib/parser/edit-operations/types';

const TAG_OPEN = '<editOperations>';
const TAG_CLOSE = '</editOperations>';
const EDIT_OPEN = '<edit>';
const EDIT_CLOSE = '</edit>';
const SEARCH_OPEN = '<search>';
const SEARCH_CLOSE = '</search>';
const REPLACE_OPEN = '<replace>';
const REPLACE_CLOSE = '</replace>';

export class EditStreamExtractor {
  private buffer = '';
  private insideEdits = false;
  private explanation = '';

  parse(chunk: string): EditParseResult {
    this.buffer += chunk;

    if (!this.insideEdits) {
      const openIndex = this.buffer.indexOf(TAG_OPEN);
      if (openIndex === -1) {
        return { operations: [], explanation: this.buffer, isComplete: false, hasEditTag: false };
      }

      this.explanation = this.buffer.slice(0, openIndex).trim();
      this.insideEdits = true;
      this.buffer = this.buffer.slice(openIndex + TAG_OPEN.length);
    }

    const isComplete = this.buffer.includes(TAG_CLOSE);
    const content = isComplete
      ? this.buffer.slice(0, this.buffer.indexOf(TAG_CLOSE))
      : this.buffer;

    return {
      operations: this.extractOperations(content),
      explanation: this.explanation,
      isComplete,
      hasEditTag: true,
    };
  }

  reset() {
    this.buffer = '';
    this.insideEdits = false;
    this.explanation = '';
  }

  private extractOperations(content: string): EditOperation[] {
    const operations: EditOperation[] = [];
    let position = 0;

    while (position < content.length) {
      const editStart = content.indexOf(EDIT_OPEN, position);
      if (editStart === -1) break;

      const editEnd = content.indexOf(EDIT_CLOSE, editStart);
      if (editEnd === -1) break;

      const editContent = content.slice(editStart + EDIT_OPEN.length, editEnd);
      const searchStart = editContent.indexOf(SEARCH_OPEN);
      const searchEnd = editContent.indexOf(SEARCH_CLOSE);
      const replaceStart = editContent.indexOf(REPLACE_OPEN);
      const replaceEnd = editContent.indexOf(REPLACE_CLOSE);

      if (searchStart !== -1 && searchEnd !== -1 && replaceStart !== -1 && replaceEnd !== -1) {
        operations.push({
          search: editContent.slice(searchStart + SEARCH_OPEN.length, searchEnd),
          replace: editContent.slice(replaceStart + REPLACE_OPEN.length, replaceEnd),
        });
      }

      position = editEnd + EDIT_CLOSE.length;
    }

    return operations;
  }
}
