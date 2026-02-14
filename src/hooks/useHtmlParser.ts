'use client';
import { useState, useCallback, useRef } from 'react';
import { isPersistableArtifact } from '@/lib/parser/validate-artifact';
import type { ProjectFiles } from '@/types';
import type { UIMessage } from '@ai-sdk/react';

interface ToolPart {
  type: string;
  toolName?: string;
  state?: string;
  input?: unknown;
  output?: unknown;
}

function isToolPart(part: unknown): part is ToolPart {
  if (typeof part !== 'object' || part === null || !('type' in part)) return false;
  const p = part as { type: string };
  return p.type.startsWith('tool-');
}

/**
 * Strip AI preamble text that appears before the actual HTML document.
 * Some models include conversational text like "I'll generate the HTML now..."
 * inside the file content, which renders as visible text above the site headers.
 */
function stripHtmlPreamble(content: string): string {
  // Find the start of actual HTML (<!DOCTYPE or <html)
  const doctypeIdx = content.search(/<!doctype\s/i);
  const htmlIdx = content.search(/<html[\s>]/i);

  let startIdx = -1;
  if (doctypeIdx !== -1 && htmlIdx !== -1) {
    startIdx = Math.min(doctypeIdx, htmlIdx);
  } else if (doctypeIdx !== -1) {
    startIdx = doctypeIdx;
  } else if (htmlIdx !== -1) {
    startIdx = htmlIdx;
  }

  if (startIdx > 0) {
    return content.slice(startIdx);
  }
  return content;
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

    // Skip complete failures (no content to extract)
    if (output.success === false) continue;

    if (!files) files = { ...baseFiles };

    // writeFiles: read file content from tool input (lean output only has fileNames)
    // Normalize keys: AI may send "index_html" or bare "index" instead of "index.html"
    const input = part.input as Record<string, unknown> | undefined;
    if (input && 'files' in input && typeof input.files === 'object' && input.files !== null) {
      const rawFiles = input.files as Record<string, string>;
      for (const [key, value] of Object.entries(rawFiles)) {
        let normalizedKey = key;
        if (!key.includes('.')) {
          const underscored = key.replace(/_([a-z]+)$/, '.$1');
          normalizedKey = underscored !== key ? underscored : `${key}.html`;
        }
        // Strip AI preamble from HTML files
        files[normalizedKey] = normalizedKey.endsWith('.html') ? stripHtmlPreamble(value) : value;
      }
    }
    // editFile/editDOM output: { success: true|"partial", file: string, content: string }
    else if ('file' in output && 'content' in output) {
      const fileName = output.file as string;
      const content = output.content as string;
      files[fileName] = fileName.endsWith('.html') ? stripHtmlPreamble(content) : content;
    }
    // editFiles output: { success: true|"partial", results: [{ file, success, content }] }
    else if ('results' in output && Array.isArray(output.results)) {
      for (const result of output.results as Array<Record<string, unknown>>) {
        if (result.success !== false && result.content && result.file) {
          const fileName = result.file as string;
          const content = result.content as string;
          files[fileName] = fileName.endsWith('.html') ? stripHtmlPreamble(content) : content;
        }
      }
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
