'use client';

import { useCallback, useRef, useState } from 'react';
import type { Blueprint } from '@/lib/blueprint/types';
import type { ProjectFiles } from '@/types';

export type BlueprintPhase =
  | 'idle'
  | 'generating-blueprint'
  | 'awaiting-approval'
  | 'generating-pages'
  | 'complete'
  | 'error';

export interface PageGenerationStatus {
  filename: string;
  status: 'pending' | 'generating' | 'complete' | 'error';
  error?: string;
}

interface UseBlueprintGenerationOptions {
  provider: string | null;
  model: string | null;
  savedTimeZone?: string | null;
  browserTimeZone?: string;
  onFilesReady: (files: ProjectFiles) => void;
}

interface PageStatusEvent {
  type: 'page-status';
  filename: string;
  status: 'pending' | 'generating' | 'complete' | 'error';
  html?: string;
  error?: string;
  totalPages: number;
  completedPages: number;
}

interface PipelineStatusEvent {
  type: 'pipeline-status';
  status: 'generating' | 'complete' | 'error';
  totalPages: number;
  completedPages: number;
}

type SSEEvent = PageStatusEvent | PipelineStatusEvent;

export function useBlueprintGeneration({
  provider,
  model,
  savedTimeZone,
  browserTimeZone,
  onFilesReady,
}: UseBlueprintGenerationOptions) {
  const [phase, setPhase] = useState<BlueprintPhase>('idle');
  const [blueprint, setBlueprint] = useState<Blueprint | null>(null);
  const [pageStatuses, setPageStatuses] = useState<PageGenerationStatus[]>([]);
  const [error, setError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const filesAccumulatorRef = useRef<ProjectFiles>({});

  const cancel = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setPhase('idle');
  }, []);

  const reset = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setPhase('idle');
    setBlueprint(null);
    setPageStatuses([]);
    setError(null);
    filesAccumulatorRef.current = {};
  }, []);

  const generateBlueprint = useCallback(async (prompt: string, conversationId: string) => {
    if (!provider || !model) {
      setError('No provider or model selected');
      setPhase('error');
      return;
    }

    setPhase('generating-blueprint');
    setError(null);
    setBlueprint(null);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch('/api/blueprint/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          conversationId,
          provider,
          model,
          savedTimeZone,
          browserTimeZone,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: 'Blueprint generation failed' }));
        throw new Error(data.error || 'Blueprint generation failed');
      }

      const data = await response.json();
      setBlueprint(data.blueprint);
      setPhase('awaiting-approval');
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Blueprint generation failed');
      setPhase('error');
    }
  }, [provider, model, savedTimeZone, browserTimeZone]);

  const generatePages = useCallback(async (conversationId: string, blueprintOverride?: Blueprint) => {
    const activeBlueprint = blueprintOverride ?? blueprint;
    if (!activeBlueprint || !provider || !model) {
      setError('Missing blueprint, provider, or model');
      setPhase('error');
      return;
    }

    setPhase('generating-pages');
    setError(null);
    filesAccumulatorRef.current = {};

    // Initialize page statuses
    const initialStatuses: PageGenerationStatus[] = activeBlueprint.pages.map((p) => ({
      filename: p.filename,
      status: 'pending' as const,
    }));
    setPageStatuses(initialStatuses);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch('/api/blueprint/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId,
          provider,
          model,
          blueprint: activeBlueprint,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: 'Page generation failed' }));
        throw new Error(data.error || 'Page generation failed');
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response stream');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE events
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr) continue;

          try {
            const event = JSON.parse(jsonStr) as SSEEvent;

            if (event.type === 'page-status') {
              setPageStatuses((prev) =>
                prev.map((ps) =>
                  ps.filename === event.filename
                    ? { filename: ps.filename, status: event.status, error: event.error }
                    : ps,
                ),
              );

              // When a page completes, add it to accumulator (don't push to preview yet)
              if (event.status === 'complete' && event.html) {
                filesAccumulatorRef.current[event.filename] = event.html;
              }
            } else if (event.type === 'pipeline-status' && event.status === 'complete') {
              // Push all accumulated files at once on pipeline completion
              onFilesReady({ ...filesAccumulatorRef.current });
              setPhase('complete');
            } else if (event.type === 'pipeline-status' && event.status === 'error') {
              setError('Some pages failed to generate');
              // Still set complete if we got at least some pages
              if (Object.keys(filesAccumulatorRef.current).length > 0) {
                onFilesReady({ ...filesAccumulatorRef.current });
                setPhase('complete');
              } else {
                setPhase('error');
              }
            }
          } catch {
            // Skip malformed events
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Page generation failed');
      setPhase('error');
    }
  }, [blueprint, provider, model, onFilesReady]);

  return {
    phase,
    blueprint,
    pageStatuses,
    error,
    generateBlueprint,
    generatePages,
    cancel,
    reset,
  };
}
