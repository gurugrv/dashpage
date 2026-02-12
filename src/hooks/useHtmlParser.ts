'use client';
import { useState, useCallback, useRef } from 'react';
import { HtmlStreamExtractor } from '@/lib/parser/html-extractor';
import { EditStreamExtractor, applyEditOperations } from '@/lib/parser/edit-operations';
import type { ProjectFiles } from '@/types';
import type { UIMessage } from '@ai-sdk/react';

export function useHtmlParser() {
  const [currentFiles, setCurrentFiles] = useState<ProjectFiles>({});
  const [lastValidFiles, setLastValidFiles] = useState<ProjectFiles>({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [editFailed, setEditFailed] = useState(false);
  const extractorRef = useRef(new HtmlStreamExtractor());
  const editExtractorRef = useRef(new EditStreamExtractor());
  const lastValidFilesRef = useRef<ProjectFiles>({});

  // Keep ref in sync for use inside callbacks
  const updateLastValid = useCallback((files: ProjectFiles) => {
    setLastValidFiles(files);
    lastValidFilesRef.current = files;
  }, []);

  const processMessages = useCallback((messages: UIMessage[], isLoading: boolean) => {
    setIsGenerating(isLoading);

    if (messages.length === 0) return;

    const lastMessage = messages[messages.length - 1];
    if (lastMessage.role !== 'assistant') return;

    // Get text content from the message parts
    const textContent = lastMessage.parts
      ?.filter((p): p is { type: 'text'; text: string } => p.type === 'text')
      .map(p => p.text)
      .join('') ?? '';

    if (!textContent) return;

    // Strategy 0: Edit operations parsing
    editExtractorRef.current.reset();
    const editResult = editExtractorRef.current.parse(textContent);

    if (editResult.hasEditTag) {
      // We detected <editOperations> — handle edit mode
      if (!isLoading && editResult.isComplete && editResult.operations.length > 0) {
        // Stream finished, apply edits to last valid HTML
        const currentHtml = lastValidFilesRef.current['index.html'];
        if (currentHtml) {
          const applied = applyEditOperations(currentHtml, editResult.operations);
          if (applied.success) {
            const files: ProjectFiles = { 'index.html': applied.html };
            setCurrentFiles(files);
            updateLastValid(files);
            setEditFailed(false);
          } else {
            // Edit failed — signal for fallback
            setEditFailed(true);
          }
        } else {
          // No existing HTML to edit — shouldn't happen but treat as failure
          setEditFailed(true);
        }
      }
      // During streaming, don't update preview (edits apply all at once when complete)
      return;
    }

    // Strategy 1: Try structured JSON parsing
    try {
      const parsed = JSON.parse(textContent);
      if (parsed.files && typeof parsed.files === 'object') {
        const files = parsed.files as ProjectFiles;
        setCurrentFiles(files);
        if (!isLoading && Object.keys(files).length > 0) {
          updateLastValid(files);
        }
        return;
      }
    } catch {
      // Not valid JSON, fall through to tag parsing
    }

    // Strategy 2: Tag-based parsing with HtmlStreamExtractor
    extractorRef.current.reset();
    const result = extractorRef.current.parse(textContent);

    if (result.html) {
      const files: ProjectFiles = { 'index.html': result.html };
      setCurrentFiles(files);
      if (!isLoading && result.isComplete) {
        updateLastValid(files);
      }
    }
  }, [updateLastValid]);

  const setFiles = useCallback((files: ProjectFiles) => {
    setCurrentFiles(files);
    updateLastValid(files);
  }, [updateLastValid]);

  const resetEditFailed = useCallback(() => {
    setEditFailed(false);
  }, []);

  return { currentFiles, lastValidFiles, isGenerating, editFailed, processMessages, setFiles, resetEditFailed };
}
