import type { ProjectFiles } from '@/types';

const ALLOWED_EXTENSIONS = new Set(['.html', '.css', '.js']);
const MAX_FILE_COUNT = 25;
const MAX_FILE_BYTES = 500_000; // 500KB per file

function getExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot === -1 ? '' : filename.slice(dot);
}

interface ValidationResult {
  valid: boolean;
  reason?: string;
}

export function validateArtifact(files: ProjectFiles): ValidationResult {
  const keys = Object.keys(files);

  if (!files['index.html'] || !files['index.html'].trim()) {
    return { valid: false, reason: 'Missing or empty index.html' };
  }

  if (keys.length > MAX_FILE_COUNT) {
    return { valid: false, reason: `Too many files (${keys.length}), max ${MAX_FILE_COUNT}` };
  }

  for (const key of keys) {
    if (!key || !key.trim()) {
      return { valid: false, reason: 'Empty or whitespace-only filename' };
    }

    // Allow _components/ prefix (one level deep), reject other nested paths
    if (key.includes('/') || key.includes('\\')) {
      const isComponentFile = key.startsWith('_components/') && !key.includes('..') && key.split('/').length === 2;
      if (!isComponentFile) {
        return { valid: false, reason: `Nested path "${key}" not allowed` };
      }
    }

    if (!ALLOWED_EXTENSIONS.has(getExtension(key))) {
      return { valid: false, reason: `File "${key}" has disallowed extension (only .html, .css, .js)` };
    }

    if (new Blob([files[key]]).size > MAX_FILE_BYTES) {
      return { valid: false, reason: `File "${key}" exceeds ${MAX_FILE_BYTES} bytes` };
    }
  }

  return { valid: true };
}

export function isPersistableArtifact(files: ProjectFiles): boolean {
  return validateArtifact(files).valid;
}
