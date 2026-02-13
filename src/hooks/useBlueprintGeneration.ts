'use client';

import { useCallback, useRef, useState } from 'react';
import type { Blueprint } from '@/lib/blueprint/types';
import type { ProjectFiles } from '@/types';
import { generateSharedStyles } from '@/lib/blueprint/generate-shared-styles';

export type BlueprintPhase =
  | 'idle'
  | 'generating-blueprint'
  | 'awaiting-approval'
  | 'generating-components'
  | 'generating-pages'
  | 'complete'
  | 'error';

export interface PageGenerationStatus {
  filename: string;
  status: 'pending' | 'generating' | 'complete' | 'error';
  error?: string;
}

interface UseBlueprintGenerationOptions {
  resolveStepModel: (step: 'planning' | 'components' | 'pages') => {
    provider: string;
    model: string;
  } | null;
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
  resolveStepModel,
  savedTimeZone,
  browserTimeZone,
  onFilesReady,
}: UseBlueprintGenerationOptions) {
  const [phase, setPhase] = useState<BlueprintPhase>('idle');
  const [blueprint, setBlueprint] = useState<Blueprint | null>(null);
  const [pageStatuses, setPageStatuses] = useState<PageGenerationStatus[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [headerHtml, setHeaderHtml] = useState<string | null>(null);
  const [footerHtml, setFooterHtml] = useState<string | null>(null);

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
    setHeaderHtml(null);
    setFooterHtml(null);
    filesAccumulatorRef.current = {};
    sharedStylesRef.current = null;
  }, []);

  const generateBlueprint = useCallback(async (prompt: string, conversationId: string) => {
    const stepModel = resolveStepModel('planning');
    if (!stepModel) {
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
          provider: stepModel.provider,
          model: stepModel.model,
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
  }, [resolveStepModel, savedTimeZone, browserTimeZone]);

  const generateComponents = useCallback(async (activeBlueprint: Blueprint, conversationId?: string): Promise<{ headerHtml: string; footerHtml: string } | null> => {
    const stepModel = resolveStepModel('components');
    if (!stepModel) {
      setError('No provider or model selected');
      setPhase('error');
      return null;
    }

    setPhase('generating-components');
    setError(null);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch('/api/blueprint/components', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blueprint: activeBlueprint,
          provider: stepModel.provider,
          model: stepModel.model,
          conversationId,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: 'Components generation failed' }));
        throw new Error(data.error || 'Components generation failed');
      }

      const data = await response.json();
      setHeaderHtml(data.headerHtml);
      setFooterHtml(data.footerHtml);
      return { headerHtml: data.headerHtml, footerHtml: data.footerHtml };
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return null;
      setError(err instanceof Error ? err.message : 'Components generation failed');
      setPhase('error');
      return null;
    }
  }, [resolveStepModel]);

  const generatePages = useCallback(async (
    conversationId: string,
    blueprintOverride?: Blueprint,
    sharedHtml?: { headerHtml: string; footerHtml: string },
    headTags?: string,
    skipPages?: string[],
  ) => {
    const activeBlueprint = blueprintOverride ?? blueprint;
    const stepModel = resolveStepModel('pages');
    if (!activeBlueprint || !stepModel) {
      setError('Missing blueprint, provider, or model');
      setPhase('error');
      return;
    }

    setPhase('generating-pages');
    setError(null);

    // Pre-populate accumulator with already-completed pages (for resume)
    if (!skipPages || skipPages.length === 0) {
      filesAccumulatorRef.current = {};
    }

    // Initialize page statuses
    const initialStatuses: PageGenerationStatus[] = activeBlueprint.pages.map((p) => ({
      filename: p.filename,
      status: skipPages?.includes(p.filename) ? 'complete' as const : 'pending' as const,
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
          provider: stepModel.provider,
          model: stepModel.model,
          blueprint: activeBlueprint,
          headerHtml: sharedHtml?.headerHtml,
          footerHtml: sharedHtml?.footerHtml,
          headTags,
          skipPages,
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
              // Merge shared styles.css into files if available
              const files = { ...filesAccumulatorRef.current };
              if (sharedStylesRef.current) {
                files['styles.css'] = sharedStylesRef.current.stylesCss;
              }
              // Push files first, then delay phase transition so the site
              // renders under the loading overlay before it disappears
              onFilesReady(files);
              setTimeout(() => setPhase('complete'), 600);
            } else if (event.type === 'pipeline-status' && event.status === 'error') {
              setError('Some pages failed to generate');
              // Still set complete if we got at least some pages
              if (Object.keys(filesAccumulatorRef.current).length > 0) {
                const files = { ...filesAccumulatorRef.current };
                if (sharedStylesRef.current) {
                  files['styles.css'] = sharedStylesRef.current.stylesCss;
                }
                onFilesReady(files);
                setTimeout(() => setPhase('complete'), 600);
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
  }, [blueprint, resolveStepModel, onFilesReady]);

  const sharedStylesRef = useRef<{ stylesCss: string; headTags: string } | null>(null);

  const approveAndGenerate = useCallback(async (conversationId: string, activeBlueprint: Blueprint) => {
    const components = await generateComponents(activeBlueprint, conversationId);
    if (!components) return; // Error already set by generateComponents

    // Build shared styles synchronously from design system — no AI call needed
    const sharedStyles = generateSharedStyles(activeBlueprint.designSystem);
    sharedStylesRef.current = sharedStyles;

    await generatePages(conversationId, activeBlueprint, components, sharedStyles.headTags);
  }, [generateComponents, generatePages]);

  const resumeFromState = useCallback(async (
    conversationId: string,
    state: {
      phase: string;
      blueprintData: Blueprint;
      componentHtml?: { headerHtml: string; footerHtml: string } | null;
      completedPages?: Record<string, string> | null;
    },
  ) => {
    const activeBlueprint = state.blueprintData;
    setBlueprint(activeBlueprint);

    const completedPageFiles = state.completedPages ?? {};
    const completedFilenames = Object.keys(completedPageFiles);

    // Pre-populate accumulator with already-completed pages
    filesAccumulatorRef.current = { ...completedPageFiles };

    if (!state.componentHtml) {
      // Need to regenerate components first, then pages
      const components = await generateComponents(activeBlueprint, conversationId);
      if (!components) return;

      const sharedStyles = generateSharedStyles(activeBlueprint.designSystem);
      sharedStylesRef.current = sharedStyles;

      await generatePages(conversationId, activeBlueprint, components, sharedStyles.headTags, completedFilenames);
    } else {
      // Components exist, just resume page generation
      setHeaderHtml(state.componentHtml.headerHtml);
      setFooterHtml(state.componentHtml.footerHtml);

      const sharedStyles = generateSharedStyles(activeBlueprint.designSystem);
      sharedStylesRef.current = sharedStyles;

      await generatePages(
        conversationId,
        activeBlueprint,
        state.componentHtml,
        sharedStyles.headTags,
        completedFilenames,
      );
    }
  }, [generateComponents, generatePages]);

  const updateBlueprint = useCallback((updated: Blueprint, conversationId: string) => {
    setBlueprint(updated);
    // Fire-and-forget persistence
    fetch(`/api/blueprint/${conversationId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blueprint: updated }),
    }).catch(() => {});
  }, []);

  return {
    phase,
    blueprint,
    pageStatuses,
    error,
    headerHtml,
    footerHtml,
    generateBlueprint,
    generatePages,
    approveAndGenerate,
    resumeFromState,
    updateBlueprint,
    cancel,
    reset,
  };
}
