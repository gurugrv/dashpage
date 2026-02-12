const TAG_OPEN = '<htmlOutput>';
const TAG_CLOSE = '</htmlOutput>';

export class HtmlStreamExtractor {
  private buffer = '';
  private insideHtml = false;
  private htmlContent = '';
  private explanation = '';

  parse(chunk: string): { html: string; explanation: string; isComplete: boolean } {
    this.buffer += chunk;

    if (!this.insideHtml) {
      const idx = this.buffer.indexOf(TAG_OPEN);
      if (idx !== -1) {
        this.explanation = this.buffer.slice(0, idx).trim();
        this.insideHtml = true;
        this.buffer = this.buffer.slice(idx + TAG_OPEN.length);
      }
    }

    if (this.insideHtml) {
      const closeIdx = this.buffer.indexOf(TAG_CLOSE);
      if (closeIdx !== -1) {
        this.htmlContent = this.buffer.slice(0, closeIdx);
        return { html: this.htmlContent, explanation: this.explanation, isComplete: true };
      }
      this.htmlContent = this.buffer;
      return { html: this.htmlContent, explanation: this.explanation, isComplete: false };
    }

    return { html: '', explanation: this.buffer, isComplete: false };
  }

  reset() {
    this.buffer = '';
    this.insideHtml = false;
    this.htmlContent = '';
    this.explanation = '';
  }
}
