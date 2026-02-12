import { findOriginalPosition } from '@/lib/parser/edit-operations/find-original-position';
import type { ApplyResult, EditOperation } from '@/lib/parser/edit-operations/types';

export function applyEditOperations(html: string, operations: EditOperation[]): ApplyResult {
  let result = html;

  for (let index = 0; index < operations.length; index++) {
    const { search, replace } = operations[index];
    if (!search) {
      return { success: false, html: result, failedIndex: index };
    }

    const exactIndex = result.indexOf(search);
    if (exactIndex !== -1) {
      result = result.slice(0, exactIndex) + replace + result.slice(exactIndex + search.length);
      continue;
    }

    const trimmedSearch = search.trim();
    if (!trimmedSearch) {
      return { success: false, html: result, failedIndex: index };
    }

    const normalizedResult = result.replace(/\s+/g, ' ');
    const normalizedSearch = trimmedSearch.replace(/\s+/g, ' ');
    const normalizedIndex = normalizedResult.indexOf(normalizedSearch);

    if (normalizedIndex === -1) {
      return { success: false, html: result, failedIndex: index };
    }

    const actualStart = findOriginalPosition(result, normalizedIndex);
    const actualEnd = findOriginalPosition(result, normalizedIndex + normalizedSearch.length);
    if (actualStart === -1 || actualEnd === -1) {
      return { success: false, html: result, failedIndex: index };
    }

    result = result.slice(0, actualStart) + replace + result.slice(actualEnd);
  }

  return { success: true, html: result };
}
