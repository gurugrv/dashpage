'use client';
import { useState, useCallback, useRef } from 'react';
import { HtmlStreamExtractor } from '@/lib/parser/html-extractor';
import { FileArtifactExtractor } from '@/lib/parser/file-artifact-extractor';
import { EditStreamExtractor, applyEditOperations } from '@/lib/parser/edit-operations';
import { isPersistableArtifact } from '@/lib/parser/validate-artifact';
import type { ProjectFiles } from '@/types';
import type { UIMessage } from '@ai-sdk/react';

export function useHtmlParser() {
  const [currentFiles, setCurrentFiles] = useState<ProjectFiles>({});
  const [lastValidFiles, setLastValidFiles] = useState<ProjectFiles>({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [editFailed, setEditFailed] = useState(false);
  const extractorRef = useRef(new HtmlStreamExtractor());
  const editExtractorRef = useRef(new EditStreamExtractor());
  const fileArtifactExtractorRef = useRef(new FileArtifactExtractor());
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

    // Strategy 0: Edit operations parsing (supports <editOperations file="...">)
    editExtractorRef.current.reset();
    const editResult = editExtractorRef.current.parse(textContent);

    if (editResult.hasEditTag) {
      if (!isLoading && editResult.isComplete && editResult.operations.length > 0) {
        // Stream finished, apply edits to the targeted file
        const targetFile = editResult.targetFile || 'index.html';
        const sourceText = lastValidFilesRef.current[targetFile];
        if (sourceText) {
          const applied = applyEditOperations(sourceText, editResult.operations);
          if (applied.success) {
            const files: ProjectFiles = { ...lastValidFilesRef.current, [targetFile]: applied.html };
            setCurrentFiles(files);
            if (isPersistableArtifact(files)) {
              updateLastValid(files);
            }
            setEditFailed(false);
          } else {
            setEditFailed(true);
          }
        } else {
          setEditFailed(true);
        }
      }
      // During streaming, don't update preview (edits apply all at once when complete)
      return;
    }

    // Strategy 1: <fileArtifact> extraction
    fileArtifactExtractorRef.current.reset();
    const fileArtifactResult = fileArtifactExtractorRef.current.parse(textContent);

    if (fileArtifactResult.hasFileArtifactTag) {
      const files = fileArtifactResult.files;
      if (Object.keys(files).length > 0) {
        setCurrentFiles(files);
        if (!isLoading && fileArtifactResult.isComplete && isPersistableArtifact(files)) {
          updateLastValid(files);
        }
      }
      return;
    }

    // Strategy 2: Try structured JSON parsing
    try {
      const parsed = JSON.parse(textContent);
      if (parsed.files && typeof parsed.files === 'object') {
        const files = parsed.files as ProjectFiles;
        setCurrentFiles(files);
        if (!isLoading && Object.keys(files).length > 0 && isPersistableArtifact(files)) {
          updateLastValid(files);
        }
        return;
      }
    } catch {
      // Not valid JSON, fall through to tag parsing
    }

    // Strategy 3: Tag-based parsing with HtmlStreamExtractor (<htmlOutput>)
    extractorRef.current.reset();
    const result = extractorRef.current.parse(textContent);

    if (result.html) {
      const files: ProjectFiles = { 'index.html': result.html };
      setCurrentFiles(files);
      if (!isLoading && result.isComplete && isPersistableArtifact(files)) {
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
