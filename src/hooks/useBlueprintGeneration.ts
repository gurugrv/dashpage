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

export interface PageToolActivity {
  toolCallId: string;
  toolName: string;
  status: 'running' | 'done' | 'error';
  label: string;
  detail?: string;
}

export interface PageGenerationStatus {
  filename: string;
  status: 'pending' | 'generating' | 'complete' | 'error';
  error?: string;
  toolActivities?: PageToolActivity[];
}

interface UseBlueprintGenerationOptions {
  resolveStepModel: (step: 'planning' | 'research' | 'components' | 'pages') => {
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

interface ToolActivitySSEEvent {
  type: 'tool-activity';
  filename: string;
  toolCallId: string;
  toolName: string;
  status: 'running' | 'done' | 'error';
  label: string;
  detail?: string;
}

interface CodeDeltaEvent {
  type: 'code-delta';
  filename: string;
  delta: string;
}

type SSEEvent = PageStatusEvent | PipelineStatusEvent | ToolActivitySSEEvent | CodeDeltaEvent;

interface ComponentStatusEvent {
  type: 'component-status';
  status: 'generating' | 'complete' | 'error';
  headerHtml?: string;
  footerHtml?: string;
  error?: string;
}

interface ComponentToolActivityEvent {
  type: 'tool-activity';
  toolCallId: string;
  toolName: string;
  status: 'running' | 'done' | 'error';
  label: string;
  detail?: string;
}

type ComponentSSEEvent = ComponentStatusEvent | ComponentToolActivityEvent;

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
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [componentToolActivities, setComponentToolActivities] = useState<PageToolActivity[]>([]);
  const [blueprintStreamingCode, setBlueprintStreamingCode] = useState<string | null>(null);
  const blueprintStreamingCodeRef = useRef<Record<string, string>>({});

  const abortControllerRef = useRef<AbortController | null>(null);
  const filesAccumulatorRef = useRef<ProjectFiles>({});
  const streamingCodeRafRef = useRef<number>(0);
  const toolActivityRafRef = useRef<number>(0);
  const pendingToolActivitiesRef = useRef<ToolActivitySSEEvent[]>([]);

  const MAX_PAGE_RETRIES = 1;

  /** Cancel any pending RAF handles without flushing state */
  const cancelPendingRafs = useCallback(() => {
    if (streamingCodeRafRef.current) {
      cancelAnimationFrame(streamingCodeRafRef.current);
      streamingCodeRafRef.current = 0;
    }
    if (toolActivityRafRef.current) {
      cancelAnimationFrame(toolActivityRafRef.current);
      toolActivityRafRef.current = 0;
    }
    pendingToolActivitiesRef.current = [];
  }, []);

  /** Synchronously flush any pending RAF state updates (for use before completion) */
  const flushPendingRafs = useCallback(() => {
    // Flush streaming code
    if (streamingCodeRafRef.current) {
      cancelAnimationFrame(streamingCodeRafRef.current);
      streamingCodeRafRef.current = 0;
      const values = Object.values(blueprintStreamingCodeRef.current);
      setBlueprintStreamingCode(values.length > 0 ? values[values.length - 1] : null);
    }
    // Flush tool activities
    if (toolActivityRafRef.current) {
      cancelAnimationFrame(toolActivityRafRef.current);
      toolActivityRafRef.current = 0;
      const pending = pendingToolActivitiesRef.current;
      pendingToolActivitiesRef.current = [];
      if (pending.length > 0) {
        setPageStatuses((prev) => {
          let next = prev;
          for (const evt of pending) {
            next = next.map((ps) => {
              if (ps.filename !== evt.filename) return ps;
              const activities = [...(ps.toolActivities ?? [])];
              const idx = activities.findIndex((a) => a.toolCallId === evt.toolCallId);
              const entry: PageToolActivity = {
                toolCallId: evt.toolCallId,
                toolName: evt.toolName,
                status: evt.status,
                label: evt.label,
                detail: evt.detail,
              };
              if (idx >= 0) {
                activities[idx] = entry;
              } else {
                activities.push(entry);
              }
              return { ...ps, toolActivities: activities };
            });
          }
          return next;
        });
      }
    }
  }, []);

  const cancel = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    cancelPendingRafs();
    setPhase('idle');
  }, [cancelPendingRafs]);

  const reset = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    cancelPendingRafs();
    setPhase('idle');
    setBlueprint(null);
    setPageStatuses([]);
    setError(null);
    setHeaderHtml(null);
    setFooterHtml(null);
    setRetryAttempt(0);
    setComponentToolActivities([]);
    setBlueprintStreamingCode(null);
    filesAccumulatorRef.current = {};
    blueprintStreamingCodeRef.current = {};
    sharedStylesRef.current = null;
  }, [cancelPendingRafs]);

  const generateBlueprint = useCallback(async (prompt: string, conversationId: string) => {
    const stepModel = resolveStepModel('planning');
    if (!stepModel) {
      setError('No provider or model selected');
      setPhase('error');
      return;
    }

    // Resolve optional research model override
    const researchModel = resolveStepModel('research');

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
          ...(researchModel ? { researchProvider: researchModel.provider, researchModel: researchModel.model } : {}),
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
    setComponentToolActivities([]);

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

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response stream');

      const decoder = new TextDecoder();
      let buffer = '';
      let result: { headerHtml: string; footerHtml: string } | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr) continue;

          try {
            const event = JSON.parse(jsonStr) as ComponentSSEEvent;

            if (event.type === 'tool-activity') {
              setComponentToolActivities((prev) => {
                const idx = prev.findIndex((a) => a.toolCallId === event.toolCallId);
                const entry: PageToolActivity = {
                  toolCallId: event.toolCallId,
                  toolName: event.toolName,
                  status: event.status,
                  label: event.label,
                  detail: event.detail,
                };
                if (idx >= 0) {
                  const next = [...prev];
                  next[idx] = entry;
                  return next;
                }
                return [...prev, entry];
              });
            } else if (event.type === 'component-status') {
              if (event.status === 'complete' && event.headerHtml && event.footerHtml) {
                result = { headerHtml: event.headerHtml, footerHtml: event.footerHtml };
                setHeaderHtml(event.headerHtml);
                setFooterHtml(event.footerHtml);
                setComponentToolActivities([]);
              } else if (event.status === 'error') {
                throw new Error(event.error || 'Components generation failed');
              }
            }
          } catch (parseErr) {
            if (parseErr instanceof Error && parseErr.message !== 'Components generation failed' && !parseErr.message.startsWith('Failed to generate')) {
              // Skip malformed SSE JSON, but re-throw component errors
              continue;
            }
            throw parseErr;
          }
        }
      }

      return result;
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return null;
      setError(err instanceof Error ? err.message : 'Components generation failed');
      setPhase('error');
      return null;
    }
  }, [resolveStepModel]);

  /** Remove <a> tags pointing to HTML files not present in the file set */
  const removeDeadNavLinks = (files: ProjectFiles): ProjectFiles => {
    const filenames = new Set(Object.keys(files));
    const result: ProjectFiles = {};
    for (const [name, html] of Object.entries(files)) {
      if (!name.endsWith('.html')) {
        result[name] = html;
        continue;
      }
      result[name] = html.replace(
        /<a\b([^>]*?)href=["']([^"']*?\.html)["']([^>]*?)>([\s\S]*?)<\/a>/gi,
        (match, before: string, href: string, after: string, content: string) => {
          if (filenames.has(href)) return match;
          // Extract class attribute from the original <a> tag to preserve styling
          const classMatch = (before + after).match(/class=["']([^"']*)["']/);
          const cls = classMatch ? ` class="${classMatch[1]}"` : '';
          return `<span${cls}>${content}</span>`;
        },
      );
    }
    return result;
  };

  const generatePages = useCallback(async (
    conversationId: string,
    blueprintOverride?: Blueprint,
    sharedHtml?: { headerHtml: string; footerHtml: string },
    headTags?: string,
    skipPages?: string[],
    retryCount = 0,
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

            if (event.type === 'code-delta') {
              const perPage = blueprintStreamingCodeRef.current;
              perPage[event.filename] = (perPage[event.filename] ?? '') + event.delta;
              // RAF-throttle: accumulate in ref, flush state at most once per frame
              if (!streamingCodeRafRef.current) {
                streamingCodeRafRef.current = requestAnimationFrame(() => {
                  streamingCodeRafRef.current = 0;
                  const values = Object.values(blueprintStreamingCodeRef.current);
                  setBlueprintStreamingCode(values.length > 0 ? values[values.length - 1] : null);
                });
              }
            } else if (event.type === 'tool-activity') {
              // Queue tool-activity events and flush in a single RAF callback
              pendingToolActivitiesRef.current.push(event);
              if (!toolActivityRafRef.current) {
                toolActivityRafRef.current = requestAnimationFrame(() => {
                  toolActivityRafRef.current = 0;
                  const pending = pendingToolActivitiesRef.current;
                  pendingToolActivitiesRef.current = [];
                  if (pending.length === 0) return;
                  setPageStatuses((prev) => {
                    let next = prev;
                    for (const evt of pending) {
                      next = next.map((ps) => {
                        if (ps.filename !== evt.filename) return ps;
                        const activities = [...(ps.toolActivities ?? [])];
                        const idx = activities.findIndex((a) => a.toolCallId === evt.toolCallId);
                        const entry: PageToolActivity = {
                          toolCallId: evt.toolCallId,
                          toolName: evt.toolName,
                          status: evt.status,
                          label: evt.label,
                          detail: evt.detail,
                        };
                        if (idx >= 0) {
                          activities[idx] = entry;
                        } else {
                          activities.push(entry);
                        }
                        return { ...ps, toolActivities: activities };
                      });
                    }
                    return next;
                  });
                });
              }
            } else if (event.type === 'page-status') {
              setPageStatuses((prev) =>
                prev.map((ps) =>
                  ps.filename === event.filename
                    ? {
                        filename: ps.filename,
                        status: event.status,
                        error: event.error,
                        // Clear tool activities when page completes or errors
                        toolActivities: event.status === 'complete' || event.status === 'error' ? [] : ps.toolActivities,
                      }
                    : ps,
                ),
              );

              // Clear this page's streaming code when it completes or errors
              if (event.status === 'complete' || event.status === 'error') {
                delete blueprintStreamingCodeRef.current[event.filename];
                // Show another generating page's code if available, otherwise null
                const remaining = Object.values(blueprintStreamingCodeRef.current);
                setBlueprintStreamingCode(remaining.length > 0 ? remaining[remaining.length - 1] : null);
              }

              // When a page completes, add it to accumulator (don't push to preview yet)
              if (event.status === 'complete' && event.html) {
                filesAccumulatorRef.current[event.filename] = event.html;
              }
            } else if (event.type === 'pipeline-status' && event.status === 'complete') {
              // Flush any pending RAF updates so final state is consistent
              flushPendingRafs();
              // Merge shared styles.css into files if available
              let files = { ...filesAccumulatorRef.current };
              if (sharedStylesRef.current) {
                files['styles.css'] = sharedStylesRef.current.stylesCss;
              }
              files = removeDeadNavLinks(files);
              onFilesReady(files);
              setRetryAttempt(0);
              setPhase('complete');
            } else if (event.type === 'pipeline-status' && event.status === 'error') {
              const completedFilenames = Object.keys(filesAccumulatorRef.current);

              // Auto-retry failed pages once
              if (retryCount < MAX_PAGE_RETRIES && completedFilenames.length > 0) {
                setRetryAttempt(retryCount + 1);
                // Re-invoke generatePages with completed pages skipped
                generatePages(
                  conversationId,
                  blueprintOverride,
                  sharedHtml,
                  headTags,
                  completedFilenames,
                  retryCount + 1,
                );
                return; // exit current SSE loop
              }

              setError('Some pages failed to generate');
              setRetryAttempt(0);
              // Still set complete if we got at least some pages
              if (completedFilenames.length > 0) {
                let files = { ...filesAccumulatorRef.current };
                if (sharedStylesRef.current) {
                  files['styles.css'] = sharedStylesRef.current.stylesCss;
                }
                files = removeDeadNavLinks(files);
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
  }, [blueprint, resolveStepModel, onFilesReady, flushPendingRafs]);

  const sharedStylesRef = useRef<{ stylesCss: string; headTags: string } | null>(null);

  const approveAndGenerate = useCallback(async (conversationId: string, activeBlueprint: Blueprint) => {
    // Build shared styles synchronously from design system — no AI call needed
    const sharedStyles = generateSharedStyles(activeBlueprint.designSystem);
    sharedStylesRef.current = sharedStyles;

    const isSinglePage = activeBlueprint.pages.length === 1;
    if (isSinglePage) {
      // Single-page sites skip the components step (no shared header/footer)
      await generatePages(conversationId, activeBlueprint, undefined, sharedStyles.headTags);
    } else {
      const components = await generateComponents(activeBlueprint, conversationId);
      if (!components) return; // Error already set by generateComponents
      await generatePages(conversationId, activeBlueprint, components, sharedStyles.headTags);
    }
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

    const sharedStyles = generateSharedStyles(activeBlueprint.designSystem);
    sharedStylesRef.current = sharedStyles;

    const isSinglePage = activeBlueprint.pages.length === 1;

    if (isSinglePage) {
      // Single-page sites skip the components step
      await generatePages(conversationId, activeBlueprint, undefined, sharedStyles.headTags, completedFilenames);
    } else if (!state.componentHtml) {
      // Need to regenerate components first, then pages
      const components = await generateComponents(activeBlueprint, conversationId);
      if (!components) return;

      await generatePages(conversationId, activeBlueprint, components, sharedStyles.headTags, completedFilenames);
    } else {
      // Components exist, just resume page generation
      setHeaderHtml(state.componentHtml.headerHtml);
      setFooterHtml(state.componentHtml.footerHtml);

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
    retryAttempt,
    componentToolActivities,
    blueprintStreamingCode,
    generateBlueprint,
    generatePages,
    approveAndGenerate,
    resumeFromState,
    updateBlueprint,
    cancel,
    reset,
  };
}
