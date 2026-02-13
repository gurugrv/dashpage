import type { ToolSet } from 'ai';
import type { ProjectFiles } from '@/types';
import { createFileTools } from './file-tools';
import { createImageTools } from './image-tools';
import { createWebTools } from './web-tools';
import { createValidationTools } from './validation-tools';

export function createWebsiteTools(currentFiles: ProjectFiles): ToolSet {
  // Mutable working copy accumulates changes across multi-step tool calls
  const workingFiles: ProjectFiles = { ...currentFiles };

  return {
    ...createFileTools(workingFiles),
    ...createImageTools(),
    ...createWebTools(),
    ...createValidationTools(workingFiles),
  };
}
