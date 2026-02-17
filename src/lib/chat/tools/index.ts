import type { ToolSet } from 'ai';
import type { ProjectFiles } from '@/types';
import { createFileTools } from './file-tools';
import { createBlockTools } from './block-tools';
import { createImageTools } from './image-tools';
import { createIconTools } from './icon-tools';
import { createWebTools } from './web-tools';
import { createSearchTools } from './search-tools';

interface WebsiteToolsOptions {
  /** Restrict to a subset of tool names. When set, only matching tools are included. */
  toolSubset?: Set<string>;
  imageProvider?: 'pexels' | 'together';
  imageModel?: string;
}

export function createWebsiteTools(currentFiles: ProjectFiles, options?: WebsiteToolsOptions): { tools: ToolSet; workingFiles: ProjectFiles } {
  // Mutable working copy accumulates changes across multi-step tool calls
  const workingFiles: ProjectFiles = { ...currentFiles };
  // Last-known-good snapshot per file — used to rollback on total edit failure
  const fileSnapshots: ProjectFiles = { ...currentFiles };

  const allTools: ToolSet = {
    ...createFileTools(workingFiles, fileSnapshots),
    ...createBlockTools(workingFiles, fileSnapshots),
    ...createImageTools({
      imageProvider: options?.imageProvider,
      imageModel: options?.imageModel,
    }),
    ...createIconTools(),
    ...createWebTools(),
    ...createSearchTools(),
  };

  if (options?.toolSubset) {
    const filtered: ToolSet = {};
    for (const [name, tool] of Object.entries(allTools)) {
      if (options.toolSubset.has(name)) {
        filtered[name] = tool;
      }
    }
    return { tools: filtered, workingFiles };
  }

  return { tools: allTools, workingFiles };
}
