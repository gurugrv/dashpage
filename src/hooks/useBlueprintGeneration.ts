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
  | 'generating-assets'
  | 'generating-pages'
  | 'generating-site'
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
  resolveStepModel: (step: 'planning' | 'research' | 'components' | 'assets' | 'pages') => {
    provider: string;
    model: string;
    maxOutputTokens?: number;
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

interface ComponentsExtractedEvent {
  type: 'components-extracted';
  files: Record<string, string>;
}

interface PostProcessedEvent {
  type: 'post-processed';
  files: Record<string, string>;
}

type SSEEvent = PageStatusEvent | PipelineStatusEvent | ToolActivitySSEEvent | CodeDeltaEvent | ComponentsExtractedEvent | PostProcessedEvent;

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

/** Replace placeholder comments with actual component HTML */
function mergeComponentsIntoPages(
  files: ProjectFiles,
  components: { headerHtml: string; footerHtml: string },
): ProjectFiles {
  const result: ProjectFiles = {};
  for (const [filename, html] of Object.entries(files)) {
    if (!filename.endsWith('.html') || filename.startsWith('_components/')) {
      result[filename] = html;
      continue;
    }
    result[filename] = html
      .replace(/<!-- @component:header -->/g, components.headerHtml)
      .replace(/<!-- @component:footer -->/g, components.footerHtml);
  }
  return result;
}

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
  const parallelModeRef = useRef(false);
  const filesAccumulatorRef = useRef<ProjectFiles>({});
  const streamingCodeRafRef = useRef<number>(0);
  const toolActivityRafRef = useRef<number>(0);
  const pendingToolActivitiesRef = useRef<ToolActivitySSEEvent[]>([]);

  const MAX_PAGE_RETRIES = 1;
  const MAX_COMPONENT_RETRIES = 1;

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
    parallelModeRef.current = false;
    filesAccumulatorRef.current = {};
    blueprintStreamingCodeRef.current = {};
    sharedStylesRef.current = null;
  }, [cancelPendingRafs]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  /** Restore the awaiting-approval state so the BlueprintCard is shown again after refresh. */
  const restoreAwaitingApproval = useCallback((blueprintData: Blueprint) => {
    setBlueprint(blueprintData);
    setPhase('awaiting-approval');
  }, []);

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
          maxOutputTokens: stepModel.maxOutputTokens,
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

    if (!parallelModeRef.current) {
      setPhase('generating-components');
    }
    setError(null);
    setComponentToolActivities([]);

    // In parallel mode, reuse the controller set by approveAndGenerate
    const controller = parallelModeRef.current
      ? abortControllerRef.current ?? new AbortController()
      : new AbortController();
    if (!parallelModeRef.current) {
      abortControllerRef.current = controller;
    }

    try {
      const response = await fetch('/api/blueprint/components', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blueprint: activeBlueprint,
          provider: stepModel.provider,
          model: stepModel.model,
          maxOutputTokens: stepModel.maxOutputTokens,
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
            if (parseErr instanceof SyntaxError) {
              // Malformed SSE JSON — skip
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
    sharedAssets?: { stylesCss: string; scriptsJs: string } | null,
  ) => {
    const activeBlueprint = blueprintOverride ?? blueprint;
    const stepModel = resolveStepModel('pages');
    if (!activeBlueprint || !stepModel) {
      setError('Missing blueprint, provider, or model');
      setPhase('error');
      return;
    }

    if (!parallelModeRef.current) {
      setPhase('generating-pages');
    }
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

    // In parallel mode, reuse the controller set by approveAndGenerate
    const controller = parallelModeRef.current
      ? abortControllerRef.current ?? new AbortController()
      : new AbortController();
    if (!parallelModeRef.current) {
      abortControllerRef.current = controller;
    }

    try {
      const response = await fetch('/api/blueprint/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId,
          provider: stepModel.provider,
          model: stepModel.model,
          maxOutputTokens: stepModel.maxOutputTokens,
          blueprint: activeBlueprint,
          headerHtml: sharedHtml?.headerHtml,
          footerHtml: sharedHtml?.footerHtml,
          headTags,
          skipPages,
          stylesCss: sharedAssets?.stylesCss,
          scriptsJs: sharedAssets?.scriptsJs,
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
            } else if (event.type === 'components-extracted' && event.files) {
              // Server extracted shared nav/footer into _components/ files
              // and replaced inline copies with placeholders — adopt the updated file map
              filesAccumulatorRef.current = { ...event.files };
            } else if (event.type === 'post-processed' && event.files) {
              // Server post-processed the pages (CSS/JS dedup)
              filesAccumulatorRef.current = { ...filesAccumulatorRef.current, ...event.files };
            } else if (event.type === 'pipeline-status' && event.status === 'complete') {
              // Flush any pending RAF updates so final state is consistent
              flushPendingRafs();
              if (!parallelModeRef.current) {
                // Sequential mode: deliver files immediately
                let files = { ...filesAccumulatorRef.current };
                if (sharedStylesRef.current) {
                  files['styles.css'] = sharedStylesRef.current.stylesCss;
                }
                files = removeDeadNavLinks(files);
                onFilesReady(files);
                setRetryAttempt(0);
                setPhase('complete');
              }
              // In parallel mode, approveAndGenerate/resumeFromState handles phase + delivery
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

  const generateComponentsWithRetry = useCallback(async (
    activeBlueprint: Blueprint,
    conversationId?: string,
    retryCount = 0,
  ): Promise<{ headerHtml: string; footerHtml: string } | null> => {
    const result = await generateComponents(activeBlueprint, conversationId);
    if (result) return result;
    // Retry once on non-abort failure (phase will be 'error' if it failed)
    if (retryCount < MAX_COMPONENT_RETRIES) {
      return generateComponentsWithRetry(activeBlueprint, conversationId, retryCount + 1);
    }
    return null;
  }, [generateComponents]);

  const generateAssets = useCallback(async (
    activeBlueprint: Blueprint,
    componentHtml?: { headerHtml: string; footerHtml: string } | null,
    conversationId?: string,
  ): Promise<{ stylesCss: string; scriptsJs: string } | null> => {
    const stepModel = resolveStepModel('assets') ?? resolveStepModel('components');
    if (!stepModel) {
      setError('No provider or model selected for assets step');
      setPhase('error');
      return null;
    }

    setPhase('generating-assets');
    setError(null);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch('/api/blueprint/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blueprint: activeBlueprint,
          provider: stepModel.provider,
          model: stepModel.model,
          maxOutputTokens: stepModel.maxOutputTokens,
          conversationId,
          componentHtml,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: 'Assets generation failed' }));
        throw new Error(data.error || 'Assets generation failed');
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response stream');

      const decoder = new TextDecoder();
      let buffer = '';
      let result: { stylesCss: string; scriptsJs: string } | null = null;

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
            const event = JSON.parse(jsonStr);
            if (event.type === 'assets-status') {
              if (event.status === 'complete' && event.stylesCss && event.scriptsJs) {
                result = { stylesCss: event.stylesCss, scriptsJs: event.scriptsJs };
              } else if (event.status === 'error') {
                throw new Error(event.error || 'Assets generation failed');
              }
            }
          } catch (parseErr) {
            if (parseErr instanceof SyntaxError) continue;
            throw parseErr;
          }
        }
      }

      return result;
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return null;
      console.warn('Assets generation failed, continuing with deterministic styles:', err);
      return null; // Non-fatal — fall back to deterministic styles
    }
  }, [resolveStepModel]);

  const approveAndGenerate = useCallback(async (conversationId: string, activeBlueprint: Blueprint) => {
    // Build shared styles synchronously from design system — no AI call needed
    const sharedStyles = generateSharedStyles(activeBlueprint.designSystem);
    sharedStylesRef.current = sharedStyles;

    const isSinglePage = activeBlueprint.pages.length === 1;
    if (isSinglePage) {
      // Single-page sites skip the components step (no shared header/footer)
      await generatePages(conversationId, activeBlueprint, undefined, sharedStyles.headTags);
    } else {
      setPhase('generating-site');

      const controller = new AbortController();
      abortControllerRef.current = controller;

      // Step 1: Generate components (header/footer)
      const components = await generateComponentsWithRetry(activeBlueprint, conversationId);

      // Step 2: Generate shared assets (styles.css + scripts.js) — sees component HTML
      const assets = await generateAssets(activeBlueprint, components, conversationId);

      // Step 3: Update headTags to include scripts.js and replace deterministic styles with AI-generated ones
      let headTags = sharedStyles.headTags;
      if (assets) {
        sharedStyles.stylesCss = assets.stylesCss;
        sharedStylesRef.current = { ...sharedStyles, stylesCss: assets.stylesCss };
        headTags += '\n<script src="scripts.js" defer></script>';
      }

      // Step 4: Generate pages (parallel, with shared context)
      await generatePages(conversationId, activeBlueprint, components ? components : undefined, headTags, undefined, 0, assets);

      // Merge components into page HTML (replace placeholders)
      const hasPages = Object.keys(filesAccumulatorRef.current).length > 0;
      if (components && hasPages) {
        const merged = mergeComponentsIntoPages(filesAccumulatorRef.current, components);
        filesAccumulatorRef.current = merged;
        let files = { ...merged };
        if (sharedStylesRef.current) {
          files['styles.css'] = sharedStylesRef.current.stylesCss;
        }
        if (assets?.scriptsJs) {
          files['scripts.js'] = assets.scriptsJs;
        }
        files = removeDeadNavLinks(files);
        onFilesReady(files);
        setPhase('complete');
      } else if (hasPages) {
        // Components failed but pages succeeded — deliver pages without shared components
        let files = { ...filesAccumulatorRef.current };
        if (sharedStylesRef.current) {
          files['styles.css'] = sharedStylesRef.current.stylesCss;
        }
        if (assets?.scriptsJs) {
          files['scripts.js'] = assets.scriptsJs;
        }
        files = removeDeadNavLinks(files);
        onFilesReady(files);
        setError('Shared components failed to generate — pages delivered without shared header/footer');
        setPhase('complete');
      } else {
        setError('Site generation failed');
        setPhase('error');
      }
    }
  }, [generateComponentsWithRetry, generateAssets, generatePages, onFilesReady]);

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
      // Need components + assets + remaining pages — sequential flow
      setPhase('generating-site');

      const controller = new AbortController();
      abortControllerRef.current = controller;

      const components = await generateComponentsWithRetry(activeBlueprint, conversationId);
      const assets = await generateAssets(activeBlueprint, components, conversationId);

      let headTags = sharedStyles.headTags;
      if (assets) {
        sharedStyles.stylesCss = assets.stylesCss;
        sharedStylesRef.current = { ...sharedStyles, stylesCss: assets.stylesCss };
        headTags += '\n<script src="scripts.js" defer></script>';
      }

      await generatePages(conversationId, activeBlueprint, components ?? undefined, headTags, completedFilenames, 0, assets);

      const hasPages = Object.keys(filesAccumulatorRef.current).length > 0;
      if (components && hasPages) {
        const merged = mergeComponentsIntoPages(filesAccumulatorRef.current, components);
        filesAccumulatorRef.current = merged;
        let files = { ...merged };
        if (sharedStylesRef.current) {
          files['styles.css'] = sharedStylesRef.current.stylesCss;
        }
        if (assets?.scriptsJs) {
          files['scripts.js'] = assets.scriptsJs;
        }
        files = removeDeadNavLinks(files);
        onFilesReady(files);
        setPhase('complete');
      } else if (hasPages) {
        let files = { ...filesAccumulatorRef.current };
        if (sharedStylesRef.current) {
          files['styles.css'] = sharedStylesRef.current.stylesCss;
        }
        if (assets?.scriptsJs) {
          files['scripts.js'] = assets.scriptsJs;
        }
        files = removeDeadNavLinks(files);
        onFilesReady(files);
        setError('Shared components failed to generate — pages delivered without shared header/footer');
        setPhase('complete');
      } else {
        setError('Site generation failed');
        setPhase('error');
      }
    } else {
      // Components exist, generate assets then resume page generation
      setHeaderHtml(state.componentHtml.headerHtml);
      setFooterHtml(state.componentHtml.footerHtml);

      const assets = await generateAssets(activeBlueprint, state.componentHtml, conversationId);

      let headTags = sharedStyles.headTags;
      if (assets) {
        sharedStyles.stylesCss = assets.stylesCss;
        sharedStylesRef.current = { ...sharedStyles, stylesCss: assets.stylesCss };
        headTags += '\n<script src="scripts.js" defer></script>';
      }

      await generatePages(
        conversationId,
        activeBlueprint,
        state.componentHtml,
        headTags,
        completedFilenames,
        0,
        assets,
      );
    }
  }, [generateComponentsWithRetry, generateAssets, generatePages, onFilesReady]);

  const updateBlueprint = useCallback((updated: Blueprint, conversationId: string) => {
    setBlueprint(updated);
    // Fire-and-forget persistence
    fetch(`/api/blueprint/${conversationId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blueprint: updated }),
    }).catch(() => {});
  }, []);

  const componentsReady = !!(headerHtml && footerHtml);

  return {
    phase,
    blueprint,
    pageStatuses,
    error,
    headerHtml,
    footerHtml,
    componentsReady,
    retryAttempt,
    componentToolActivities,
    blueprintStreamingCode,
    generateBlueprint,
    generatePages,
    approveAndGenerate,
    resumeFromState,
    restoreAwaitingApproval,
    updateBlueprint,
    cancel,
    reset,
    clearError,
  };
}
