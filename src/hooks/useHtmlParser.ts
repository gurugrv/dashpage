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
 * Strip markdown code fences wrapping HTML content.
 * Models sometimes output ```html\n...\n``` around HTML.
 */
function stripCodeFences(content: string): string {
  const trimmed = content.trim();
  // Match ```html or ``` at start, ``` at end
  const fenceStart = /^```(?:html)?\s*\n/i;
  const fenceEnd = /\n```\s*$/;
  if (fenceStart.test(trimmed) && fenceEnd.test(trimmed)) {
    return trimmed.replace(fenceStart, '').replace(fenceEnd, '');
  }
  return content;
}

/**
 * Extract HTML from text parts of a message.
 * Returns the HTML string if found, or null.
 */
function extractHtmlFromTextParts(parts: UIMessage['parts']): string | null {
  let textContent = '';
  for (const part of parts) {
    if (typeof part === 'object' && part !== null && 'type' in part && part.type === 'text' && 'text' in part) {
      textContent += (part as { text: string }).text;
    }
  }
  if (!textContent) return null;

  // Strip code fences first
  const defenced = stripCodeFences(textContent);

  // Strip preamble text before HTML
  const stripped = stripHtmlPreamble(defenced);

  // Check if we actually have HTML content (need at least <html or <!doctype)
  if (/^<!doctype\s/i.test(stripped) || /^<html[\s>]/i.test(stripped)) {
    return stripped;
  }

  return null;
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
): { files: ProjectFiles | null; hasToolActivity: boolean; producedFiles: boolean } {
  let files: ProjectFiles | null = null;
  let hasToolActivity = false;
  let producedFiles = false;

  for (const part of parts) {
    if (!isToolPart(part)) continue;

    hasToolActivity = true;

    // Only extract from completed tool outputs
    if (part.state !== 'output-available' || !part.output) continue;

    const output = part.output as Record<string, unknown>;

    // Skip complete failures (no content to extract)
    if (output.success === false) continue;

    // writeFiles: read file content from tool input (lean output only has fileNames)
    // Normalize keys: AI may send "index_html" or bare "index" instead of "index.html"
    const input = part.input as Record<string, unknown> | undefined;
    if (input && 'files' in input && typeof input.files === 'object' && input.files !== null) {
      if (!files) files = { ...baseFiles };
      producedFiles = true;
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
    // editDOM output: { success: true|"partial", file: string, content: string }
    else if ('file' in output && 'content' in output) {
      if (!files) files = { ...baseFiles };
      producedFiles = true;
      const fileName = output.file as string;
      const content = output.content as string;
      files[fileName] = fileName.endsWith('.html') ? stripHtmlPreamble(content) : content;
    }
    // editFiles output: { success: true|"partial", results: [{ file, success, content }] }
    else if ('results' in output && Array.isArray(output.results)) {
      for (const result of output.results as Array<Record<string, unknown>>) {
        if (result.success !== false && result.content && result.file) {
          if (!files) files = { ...baseFiles };
          producedFiles = true;
          const fileName = result.file as string;
          const content = result.content as string;
          files[fileName] = fileName.endsWith('.html') ? stripHtmlPreamble(content) : content;
        }
      }
    }
  }

  return { files, hasToolActivity, producedFiles };
}

export function useHtmlParser() {
  const [currentFiles, setCurrentFiles] = useState<ProjectFiles>({});
  const [lastValidFiles, setLastValidFiles] = useState<ProjectFiles>({});
  const [isGenerating, setIsGenerating] = useState(false);
  const lastValidFilesRef = useRef<ProjectFiles>({});
  const lastProcessedRef = useRef<{ messageId: string; partsLength: number; isLoading: boolean } | null>(null);

  const updateLastValid = useCallback((files: ProjectFiles) => {
    setLastValidFiles(files);
    lastValidFilesRef.current = files;
  }, []);

  const processMessages = useCallback((messages: UIMessage[], isLoading: boolean) => {
    if (messages.length === 0) {
      setIsGenerating(isLoading);
      return;
    }

    const lastMessage = messages[messages.length - 1];
    if (lastMessage.role !== 'assistant') {
      setIsGenerating(isLoading);
      return;
    }

    // Skip if nothing changed since last call — parts only grow (new tool calls append),
    // so same length means no new tool output to extract
    const partsLength = lastMessage.parts.length;
    const cached = lastProcessedRef.current;
    if (cached && cached.messageId === lastMessage.id && cached.partsLength === partsLength && cached.isLoading === isLoading) {
      return;
    }
    lastProcessedRef.current = { messageId: lastMessage.id, partsLength, isLoading };

    setIsGenerating(isLoading);

    // Extract files from tool result parts
    const { files: toolFiles, hasToolActivity, producedFiles } = extractFilesFromToolParts(
      lastMessage.parts,
      lastValidFilesRef.current,
    );

    // If tools produced file content (writeFiles, editDOM, editFiles), use that
    if (toolFiles !== null && producedFiles) {
      setCurrentFiles(toolFiles);
      if (!isLoading && isPersistableArtifact(toolFiles)) {
        updateLastValid(toolFiles);
      }
      return;
    }

    // Text-based HTML extraction (single-page text output mode)
    // Only use when no tools were invoked — during streaming, tool parts may still be
    // pending (state !== 'output-available') so toolPartsProducedFiles returns false,
    // but text mentioning <!DOCTYPE html> would incorrectly overwrite the eventual tool output.
    const textHtml = extractHtmlFromTextParts(lastMessage.parts);
    if (textHtml && !hasToolActivity) {
      const baseFiles = toolFiles ?? lastValidFilesRef.current;
      const files = { ...baseFiles, 'index.html': textHtml };
      setCurrentFiles(files);
      if (!isLoading && isPersistableArtifact(files)) {
        updateLastValid(files);
      }
      return;
    }

    // Tool activity but no file output yet (streaming/executing) — don't update preview
    if (hasToolActivity) return;

    // No tool activity, no text HTML — nothing to extract for preview
  }, [updateLastValid]);

  const setFiles = useCallback((files: ProjectFiles) => {
    setCurrentFiles(files);
    updateLastValid(files);
  }, [updateLastValid]);

  return { currentFiles, lastValidFiles, isGenerating, processMessages, setFiles };
}
