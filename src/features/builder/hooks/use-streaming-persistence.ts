'use client';

import { useCallback, useEffect, type MutableRefObject } from 'react';
import type { UIMessage } from '@ai-sdk/react';
import type { ProjectFiles } from '@/types';

interface UseStreamingPersistenceOptions {
  currentFiles: ProjectFiles;
  activeConversationId: string | null;
  messages: UIMessage[];
  isLoading: boolean;
  currentFilesRef: MutableRefObject<ProjectFiles>;
  activeConversationIdRef: MutableRefObject<string | null>;
  partialSavedRef: MutableRefObject<boolean>;
  streamingTextRef: MutableRefObject<string>;
}

export function useStreamingPersistence({
  currentFiles,
  activeConversationId,
  messages,
  isLoading,
  currentFilesRef,
  activeConversationIdRef,
  partialSavedRef,
  streamingTextRef,
}: UseStreamingPersistenceOptions) {
  useEffect(() => {
    currentFilesRef.current = currentFiles;
  }, [currentFiles, currentFilesRef]);

  useEffect(() => {
    activeConversationIdRef.current = activeConversationId;
  }, [activeConversationId, activeConversationIdRef]);

  useEffect(() => {
    if (!isLoading || messages.length === 0) return;

    const last = messages[messages.length - 1];
    if (last.role !== 'assistant') return;

    const text = last.parts
      ?.filter((part): part is { type: 'text'; text: string } => part.type === 'text')
      .map((part) => part.text)
      .join('') ?? '';

    streamingTextRef.current = text;
  }, [messages, isLoading, streamingTextRef]);

  const savePartial = useCallback((useSendBeacon = false) => {
    if (partialSavedRef.current) return;

    const convId = activeConversationIdRef.current;
    const text = streamingTextRef.current;
    if (!convId || !text) return;

    partialSavedRef.current = true;
    const files = currentFilesRef.current;
    const htmlArtifact = files['index.html'] ? files : null;
    const payload = JSON.stringify({ role: 'assistant', content: text, htmlArtifact });
    const url = `/api/conversations/${convId}/messages/partial`;

    if (useSendBeacon && typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon(url, new Blob([payload], { type: 'application/json' }));
      return;
    }

    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true,
    }).catch(() => {});
  }, [activeConversationIdRef, currentFilesRef, partialSavedRef, streamingTextRef]);

  useEffect(() => {
    if (!isLoading) return;

    const handler = (event: BeforeUnloadEvent) => {
      savePartial(true);
      event.preventDefault();
    };

    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isLoading, savePartial]);

  useEffect(() => () => {
    if (streamingTextRef.current && !partialSavedRef.current) {
      savePartial(true);
    }
  }, [savePartial, streamingTextRef, partialSavedRef]);

  return { savePartial };
}
