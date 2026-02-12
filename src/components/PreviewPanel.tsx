'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import JSZip from 'jszip';
import { cn } from '@/lib/utils';
import { combineForPreview, getHtmlPages } from '@/lib/preview/combine-files';
import type { BuildProgressState } from '@/hooks/useBuildProgress';
import type { ProjectFiles } from '@/types';
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
}

export function PreviewPanel({ files, lastValidFiles, isGenerating, buildProgress, blueprintPhase, pageStatuses }: PreviewPanelProps) {
  const [device, setDevice] = useState<DeviceSize>('desktop');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedPage, setSelectedPage] = useState('index.html');
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const fallbackFiles = isGenerating ? lastValidFiles : (files['index.html'] ? files : lastValidFiles);
  const htmlPages = useMemo(() => getHtmlPages(fallbackFiles), [fallbackFiles]);

  // Derive effective active page — falls back to first available if selection is invalid
  const activePage = htmlPages.includes(selectedPage) ? selectedPage : (htmlPages[0] ?? 'index.html');

  const srcDoc = isGenerating
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

  // Listen for inter-page navigation messages from iframe
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.data?.type === 'page-navigate' && typeof e.data.page === 'string') {
        if (htmlPages.includes(e.data.page)) {
          setSelectedPage(e.data.page);
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
        {hasContent ? (
          <div
            className={cn(
              'h-full overflow-hidden rounded-md bg-white shadow-sm transition-all duration-200',
              device === 'desktop' && 'w-full',
              device !== 'desktop' && 'border',
            )}
            style={{ width: DEVICE_WIDTHS[device], maxWidth: '100%' }}
          >
            <iframe
              ref={iframeRef}
              srcDoc={srcDoc}
              sandbox="allow-scripts allow-forms"
              className="h-full w-full border-0"
              title="Website Preview"
            />
          </div>
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-muted-foreground">
            <PreviewEmptyState isGenerating={isGenerating} buildProgress={buildProgress} blueprintPhase={blueprintPhase} pageStatuses={pageStatuses} />
          </div>
        )}

        {isGenerating && hasContent && <PreviewLoadingOverlay buildProgress={buildProgress} blueprintPhase={blueprintPhase} pageStatuses={pageStatuses} />}
      </div>
    </div>
  );
}
