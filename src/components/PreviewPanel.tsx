'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import JSZip from 'jszip';
import { cn } from '@/lib/utils';
import { combineForPreview, getHtmlPages } from '@/lib/preview/combine-files';
import type { BuildProgressState } from '@/hooks/useBuildProgress';
import type { ProjectFiles } from '@/types';
import type { PaletteColors } from '@/types/build-progress';
import type { BlueprintPhase, PageGenerationStatus } from '@/hooks/useBlueprintGeneration';
import { DEVICE_WIDTHS, type DeviceSize } from '@/features/preview/constants';
import { PreviewEmptyState } from '@/features/preview/preview-empty-state';
import { PreviewLoadingOverlay } from '@/features/preview/preview-loading-overlay';
import { PreviewToolbar } from '@/features/preview/preview-toolbar';

interface PreviewPanelProps {
  files: ProjectFiles;
  lastValidFiles: ProjectFiles;
  isGenerating: boolean;
  buildProgress?: BuildProgressState;
  blueprintPhase?: BlueprintPhase;
  pageStatuses?: PageGenerationStatus[];
  blueprintPalette?: PaletteColors;
}

export function PreviewPanel({ files, lastValidFiles, isGenerating, buildProgress, blueprintPhase, pageStatuses, blueprintPalette }: PreviewPanelProps) {
  const [device, setDevice] = useState<DeviceSize>('desktop');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedPage, setSelectedPage] = useState('index.html');
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // During blueprint generation, prefer fresh files once they arrive (shown under overlay).
  // During normal streaming, freeze on lastValidFiles to avoid flickering.
  const isBlueprintActive = blueprintPhase && blueprintPhase !== 'idle' && blueprintPhase !== 'error';
  const fallbackFiles = isGenerating && !isBlueprintActive
    ? lastValidFiles
    : (files['index.html'] ? files : lastValidFiles);
  const htmlPages = useMemo(() => getHtmlPages(fallbackFiles), [fallbackFiles]);

  // Derive effective active page — falls back to first available if selection is invalid
  const activePage = htmlPages.includes(selectedPage) ? selectedPage : (htmlPages[0] ?? 'index.html');

  const srcDoc = isGenerating && !isBlueprintActive
    ? combineForPreview(lastValidFiles, activePage)
    : (combineForPreview(files, activePage) || combineForPreview(lastValidFiles, activePage));

  const hasContent = !!srcDoc;

  const handleRefresh = useCallback(() => {
    if (!iframeRef.current || !srcDoc) return;

    const current = srcDoc;
    iframeRef.current.srcdoc = '';
    requestAnimationFrame(() => {
      if (iframeRef.current) iframeRef.current.srcdoc = current;
    });
  }, [srcDoc]);

  const handleDownload = useCallback(async () => {
    const activeFiles = files['index.html'] ? files : lastValidFiles;
    if (!activeFiles['index.html']) return;

    const fileKeys = Object.keys(activeFiles);

    if (fileKeys.length === 1) {
      const blob = new Blob([activeFiles['index.html']], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'website.html';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    } else {
      const zip = new JSZip();
      for (const [path, content] of Object.entries(activeFiles)) {
        zip.file(path, content);
      }
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'website.zip';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    }
  }, [files, lastValidFiles]);

  const handleToggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;

    if (!isFullscreen) {
      if (containerRef.current.requestFullscreen) {
        containerRef.current.requestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  }, [isFullscreen]);

  const handleFullscreenChange = useCallback(() => {
    setIsFullscreen(document.fullscreenElement !== null);
  }, []);

  // Send build phase to iframe for section highlighting
  useEffect(() => {
    if (!iframeRef.current?.contentWindow || !isGenerating) return;
    iframeRef.current.contentWindow.postMessage(
      { type: 'build-phase', phase: buildProgress?.phase ?? null },
      '*'
    );
  }, [isGenerating, buildProgress?.phase]);

  // Clear section highlights when generation ends
  useEffect(() => {
    if (!isGenerating && iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage(
        { type: 'build-phase', phase: null },
        '*'
      );
    }
  }, [isGenerating]);

  // Listen for inter-page navigation messages from iframe
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.data?.type === 'page-navigate' && typeof e.data.page === 'string') {
        if (htmlPages.includes(e.data.page)) {
          const hash = typeof e.data.hash === 'string' ? e.data.hash : '';
          setSelectedPage(e.data.page);
          // After page switch, scroll to hash target in the new page
          if (hash) {
            requestAnimationFrame(() => {
              setTimeout(() => {
                const id = hash.slice(1);
                if (id && iframeRef.current?.contentDocument) {
                  const target = iframeRef.current.contentDocument.getElementById(id);
                  if (target) target.scrollIntoView({ behavior: 'smooth' });
                }
              }, 100); // small delay for srcdoc to render
            });
          }
        }
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [htmlPages]);

  useEffect(() => {
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [handleFullscreenChange]);

  return (
    <div
      ref={containerRef}
      className={cn(
        'flex h-full flex-col bg-muted/20',
        isFullscreen && 'fixed inset-0 z-50'
      )}
    >
      <PreviewToolbar
        device={device}
        hasContent={hasContent}
        isFullscreen={isFullscreen}
        onDeviceChange={setDevice}
        onRefresh={handleRefresh}
        onDownload={handleDownload}
        onToggleFullscreen={handleToggleFullscreen}
        htmlPages={htmlPages}
        activePage={activePage}
        onPageChange={setSelectedPage}
      />

      <div className="relative flex flex-1 items-start justify-center overflow-auto p-4">
        {/* Wireframe empty state — visible when no content, crossfades out when content arrives */}
        <div
          className={cn(
            'absolute inset-4 flex flex-col items-center justify-center gap-3 text-muted-foreground transition-all duration-500',
            hasContent ? 'pointer-events-none opacity-0 blur-sm' : 'opacity-100',
          )}
        >
          <PreviewEmptyState isGenerating={isGenerating} buildProgress={buildProgress} blueprintPhase={blueprintPhase} pageStatuses={pageStatuses} device={device} blueprintPalette={blueprintPalette} />
        </div>

        {/* Iframe content — crossfades in when content arrives */}
        <div
          className={cn(
            'h-full overflow-hidden rounded-md bg-white shadow-sm transition-all duration-500',
            device === 'desktop' && 'w-full',
            device !== 'desktop' && 'border',
            hasContent ? 'opacity-100' : 'pointer-events-none opacity-0',
          )}
          style={{ width: DEVICE_WIDTHS[device], maxWidth: '100%' }}
        >
          <iframe
            ref={iframeRef}
            srcDoc={srcDoc ?? ''}
            sandbox="allow-scripts allow-forms allow-same-origin"
            className="h-full w-full border-0"
            title="Website Preview"
          />
        </div>

        {isGenerating && hasContent && <PreviewLoadingOverlay buildProgress={buildProgress} blueprintPhase={blueprintPhase} pageStatuses={pageStatuses} />}
      </div>
    </div>
  );
}
