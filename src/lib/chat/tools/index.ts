import type { ToolSet } from 'ai';
import type { ProjectFiles } from '@/types';
import { createFileTools } from './file-tools';
import { createImageTools } from './image-tools';
import { createIconTools } from './icon-tools';
import { createWebTools } from './web-tools';
import { createSearchTools } from './search-tools';
import { createValidationTools } from './validation-tools';

export function createWebsiteTools(currentFiles: ProjectFiles): { tools: ToolSet; workingFiles: ProjectFiles } {
  // Mutable working copy accumulates changes across multi-step tool calls
  const workingFiles: ProjectFiles = { ...currentFiles };

  return {
    tools: {
      ...createFileTools(workingFiles),
      ...createImageTools(),
      ...createIconTools(),
      ...createWebTools(),
      ...createSearchTools(),
      ...createValidationTools(workingFiles),
    },
    workingFiles,
  };
}
