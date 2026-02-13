'use client';
import { useState, useCallback, useRef } from 'react';
import { isPersistableArtifact } from '@/lib/parser/validate-artifact';
import type { ProjectFiles } from '@/types';
import type { UIMessage } from '@ai-sdk/react';

interface ToolPart {
  type: string;
  toolName?: string;
  state?: string;
  output?: unknown;
}

function isToolPart(part: unknown): part is ToolPart {
  if (typeof part !== 'object' || part === null || !('type' in part)) return false;
  const p = part as { type: string };
  return p.type.startsWith('tool-');
}

/**
 * Extract files from tool output parts in a message.
 * Returns merged files from all completed tool outputs, or null if no tool outputs found.
 *
 * AI SDK v6 tool part states: input-streaming, input-available, output-available, output-error
 */
function extractFilesFromToolParts(
  parts: UIMessage['parts'],
  baseFiles: ProjectFiles,
): { files: ProjectFiles | null; hasToolActivity: boolean } {
  let files: ProjectFiles | null = null;
  let hasToolActivity = false;

  for (const part of parts) {
    if (!isToolPart(part)) continue;

    hasToolActivity = true;

    // Only extract from completed tool outputs
    if (part.state !== 'output-available' || !part.output) continue;

    const output = part.output as Record<string, unknown>;
    if (!output.success) continue;

    if (!files) files = { ...baseFiles };

    // writeFiles output: { success: true, files: Record<string, string> }
    if ('files' in output && typeof output.files === 'object' && output.files !== null) {
      Object.assign(files, output.files as Record<string, string>);
    }
    // editFile output: { success: true, file: string, content: string }
    else if ('file' in output && 'content' in output) {
      files[output.file as string] = output.content as string;
    }
  }

  return { files, hasToolActivity };
}

export function useHtmlParser() {
  const [currentFiles, setCurrentFiles] = useState<ProjectFiles>({});
  const [lastValidFiles, setLastValidFiles] = useState<ProjectFiles>({});
  const [isGenerating, setIsGenerating] = useState(false);
  const lastValidFilesRef = useRef<ProjectFiles>({});

  const updateLastValid = useCallback((files: ProjectFiles) => {
    setLastValidFiles(files);
    lastValidFilesRef.current = files;
  }, []);

  const processMessages = useCallback((messages: UIMessage[], isLoading: boolean) => {
    setIsGenerating(isLoading);

    if (messages.length === 0) return;

    const lastMessage = messages[messages.length - 1];
    if (lastMessage.role !== 'assistant') return;

    // Extract files from tool result parts
    const { files: toolFiles, hasToolActivity } = extractFilesFromToolParts(
      lastMessage.parts,
      lastValidFilesRef.current,
    );

    if (hasToolActivity) {
      if (toolFiles !== null) {
        // Tool results available — update preview
        setCurrentFiles(toolFiles);
        if (!isLoading && isPersistableArtifact(toolFiles)) {
          updateLastValid(toolFiles);
        }
      }
      // If tool activity but no results yet (streaming/executing), don't update preview
      return;
    }

    // No tool activity — nothing to extract for preview
  }, [updateLastValid]);

  const setFiles = useCallback((files: ProjectFiles) => {
    setCurrentFiles(files);
    updateLastValid(files);
  }, [updateLastValid]);

  return { currentFiles, lastValidFiles, isGenerating, processMessages, setFiles };
}
