import type { ToolSet } from 'ai';
import type { ProjectFiles } from '@/types';
import { createEditDomTool, createFileTools } from './file-tools';
import { createImageTools } from './image-tools';
import { createIconTools } from './icon-tools';
import { createWebTools } from './web-tools';
import { createSearchTools } from './search-tools';

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
    },
    workingFiles,
  };
}

/**
 * Minimal tool set for single-page generation.
 * HTML is output as text (not via writeFiles). Only editDOM for targeted edits.
 */
export function createSinglePageTools(currentFiles: ProjectFiles): { tools: ToolSet; workingFiles: ProjectFiles } {
  const workingFiles: ProjectFiles = { ...currentFiles };

  return {
    tools: {
      ...createEditDomTool(workingFiles),
      ...createImageTools(),
      ...createIconTools(),
      ...createWebTools(),
      ...createSearchTools(),
    },
    workingFiles,
  };
}
