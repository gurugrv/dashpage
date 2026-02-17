import type { ToolSet } from 'ai';
import type { ProjectFiles } from '@/types';
import { createFileTools } from './file-tools';
import { createBlockTools } from './block-tools';
import { createImageTools } from './image-tools';
import { createIconTools } from './icon-tools';
import { createWebTools } from './web-tools';
import { createSearchTools } from './search-tools';

export function createWebsiteTools(currentFiles: ProjectFiles): { tools: ToolSet; workingFiles: ProjectFiles } {
  // Mutable working copy accumulates changes across multi-step tool calls
  const workingFiles: ProjectFiles = { ...currentFiles };
  // Last-known-good snapshot per file — used to rollback on total edit failure
  const fileSnapshots: ProjectFiles = { ...currentFiles };

  return {
    tools: {
      ...createFileTools(workingFiles, fileSnapshots),
      ...createBlockTools(workingFiles, fileSnapshots),
      ...createImageTools(),
      ...createIconTools(),
      ...createWebTools(),
      ...createSearchTools(),
    },
    workingFiles,
  };
}
