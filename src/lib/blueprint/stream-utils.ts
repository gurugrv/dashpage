export const TOOL_LABELS: Record<string, string> = {
  searchImages: 'Adding images',
  searchIcons: 'Adding icons',
  fetchUrl: 'Loading content',
  webSearch: 'Researching content',
  writeFiles: 'Writing page',
  editDOM: 'Fixing issues',
  editFiles: 'Fixing issues',
  readFile: 'Reading file',
};

export function summarizeToolInput(toolName: string, input: unknown): string | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const inp = input as Record<string, unknown>;
  switch (toolName) {
    case 'searchImages': {
      const queries = inp.queries as Array<{ query?: string }> | undefined;
      if (queries) return queries.map(q => q.query).filter(Boolean).join(', ');
      return typeof inp.query === 'string' ? inp.query : undefined;
    }
    case 'searchIcons':
    case 'webSearch':
      return typeof inp.query === 'string' ? inp.query : undefined;
    case 'fetchUrl':
      return typeof inp.url === 'string' ? inp.url : undefined;
    case 'writeFiles': {
      const files = inp.files as Record<string, unknown> | undefined;
      return files ? Object.keys(files).join(', ') : undefined;
    }
    case 'editDOM':
    case 'readFile':
    default:
      return undefined;
  }
}

export function summarizeToolOutput(toolName: string, output: unknown): string | undefined {
  if (!output || typeof output !== 'object') return undefined;
  const out = output as Record<string, unknown>;
  if (out.success === false) {
    return typeof out.error === 'string' ? out.error.slice(0, 80) : 'Failed';
  }
  switch (toolName) {
    case 'searchImages': {
      const total = out.totalImages as number | undefined;
      if (total != null) return `${total} image${total !== 1 ? 's' : ''} found`;
      const images = out.images as unknown[] | undefined;
      return images ? `${images.length} image${images.length !== 1 ? 's' : ''} found` : undefined;
    }
    case 'searchIcons': {
      const icons = out.icons as unknown[] | undefined;
      return icons ? `${icons.length} icon${icons.length !== 1 ? 's' : ''} found` : undefined;
    }
    case 'webSearch': {
      const results = out.results as unknown[] | undefined;
      return results ? `${results.length} result${results.length !== 1 ? 's' : ''} found` : undefined;
    }
    case 'fetchUrl':
      return out.truncated ? 'Content fetched (truncated)' : 'Content fetched';
    case 'writeFiles': {
      const fileNames = out.fileNames as string[] | undefined;
      return fileNames ? `Wrote ${fileNames.join(', ')}` : 'Files written';
    }
    case 'editDOM':
      return out.success === true ? 'Edits applied' : out.success === 'partial' ? 'Partial edits applied' : undefined;
    case 'editFiles': {
      const results = out.results as Array<Record<string, unknown>> | undefined;
      if (results) {
        const ok = results.filter(r => r.success !== false).length;
        return `${ok}/${results.length} file${results.length !== 1 ? 's' : ''} edited`;
      }
      return 'Edits applied';
    }
    case 'readFile':
      return 'File read';
    default:
      return undefined;
  }
}
