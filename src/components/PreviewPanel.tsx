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
import { LiveCodeBackground } from '@/features/preview/live-code-background';

interface PreviewPanelProps {
  files: ProjectFiles;
  lastValidFiles: ProjectFiles;
  isGenerating: boolean;
  isEditing?: boolean;
  buildProgress?: BuildProgressState;
  blueprintPhase?: BlueprintPhase;
  pageStatuses?: PageGenerationStatus[];
  blueprintPalette?: PaletteColors;
  componentsReady?: boolean;
  streamingCode?: string | null;
}

export function PreviewPanel({ files, lastValidFiles, isGenerating, isEditing, buildProgress, blueprintPhase, pageStatuses, blueprintPalette, componentsReady, streamingCode }: PreviewPanelProps) {
  const [device, setDevice] = useState<DeviceSize>('desktop');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedPage, setSelectedPage] = useState('index.html');
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const prevSrcDocRef = useRef<string>('');

  // During blueprint generation, prefer fresh files once they arrive (shown under overlay).
  // During normal streaming, freeze on lastValidFiles to avoid flickering.
  const isBlueprintActive = blueprintPhase && blueprintPhase !== 'idle' && blueprintPhase !== 'error';
  const fallbackFiles = isGenerating && !isBlueprintActive
    ? lastValidFiles
    : (files['index.html'] ? files : lastValidFiles);
  const htmlPages = useMemo(() => getHtmlPages(fallbackFiles), [fallbackFiles]);

  // Derive effective active page — falls back to first available if selection is invalid
  const activePage = htmlPages.includes(selectedPage) ? selectedPage : (htmlPages[0] ?? 'index.html');

  const srcDoc = useMemo(() => {
    if (isGenerating && !isBlueprintActive) {
      return combineForPreview(lastValidFiles, activePage);
    }
    return combineForPreview(files, activePage) || combineForPreview(lastValidFiles, activePage);
  }, [files, lastValidFiles, activePage, isGenerating, isBlueprintActive]);

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
    try {
      const activeFiles = files['index.html'] ? files : lastValidFiles;
      if (!activeFiles['index.html']) return;

      // Bake components into page files for download, exclude _components/ from output
      const downloadFiles: Record<string, string> = {};
      for (const [filename, content] of Object.entries(activeFiles)) {
        if (filename.startsWith('_components/')) continue;
        let processed = content;
        for (const [compFile, compContent] of Object.entries(activeFiles)) {
          if (!compFile.startsWith('_components/')) continue;
          const compName = compFile.replace('_components/', '').replace('.html', '');
          processed = processed.replace(`<!-- @component:${compName} -->`, compContent);
        }
        downloadFiles[filename] = processed;
      }

      // Collect generated image paths referenced in HTML (e.g. /generated/uuid.jpg)
      const generatedImagePaths = new Set<string>();
      for (const content of Object.values(downloadFiles)) {
        const matches = content.match(/\/generated\/[a-f0-9-]+\.jpg/g);
        if (matches) matches.forEach((m) => generatedImagePaths.add(m));
      }

      const fileKeys = Object.keys(downloadFiles);
      const hasGeneratedImages = generatedImagePaths.size > 0;

      if (fileKeys.length === 1 && !hasGeneratedImages) {
        const blob = new Blob([downloadFiles['index.html']], { type: 'text/html' });
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

        // Rewrite /generated/ paths to relative generated/ for portability
        for (const [path, content] of Object.entries(downloadFiles)) {
          zip.file(path, hasGeneratedImages ? content.replace(/\/generated\//g, 'generated/') : content);
        }

        // Fetch and bundle generated images
        if (hasGeneratedImages) {
          const imageFolder = zip.folder('generated')!;
          await Promise.all(
            [...generatedImagePaths].map(async (imgPath) => {
              try {
                const res = await fetch(imgPath);
                if (!res.ok) return;
                const data = await res.arrayBuffer();
                const filename = imgPath.split('/').pop()!;
                imageFolder.file(filename, data);
              } catch {
                // Skip images that fail to fetch
              }
            }),
          );
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
    } catch (err) {
      console.error('Download failed:', err);
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

  // Update iframe only when srcDoc content actually changes to prevent flicker
  useEffect(() => {
    if (!iframeRef.current) return;
    const doc = srcDoc ?? '';
    if (doc === prevSrcDocRef.current) return;
    prevSrcDocRef.current = doc;
    iframeRef.current.srcdoc = doc;
  }, [srcDoc]);

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
          if (hash && iframeRef.current) {
            const iframe = iframeRef.current;
            const scrollToHash = () => {
              const id = hash.slice(1);
              if (id && iframe.contentDocument) {
                const target = iframe.contentDocument.getElementById(id);
                if (target) target.scrollIntoView({ behavior: 'smooth' });
              }
            };
            iframe.addEventListener('load', scrollToHash, { once: true });
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
        {/* Live code background — visible behind skeleton during writeFiles generation */}
        <LiveCodeBackground
          code={streamingCode ?? null}
          visible={!hasContent && isGenerating && !!streamingCode}
        />

        {/* Wireframe empty state — visible when no content, crossfades out when content arrives */}
        <div
          className={cn(
            'absolute inset-4 flex flex-col items-center justify-center gap-3 text-muted-foreground transition-all duration-500',
            hasContent ? 'pointer-events-none opacity-0 blur-sm' : 'opacity-100',
            !hasContent && isGenerating && streamingCode ? 'rounded-md bg-background/80 backdrop-blur-sm' : '',
          )}
        >
          <PreviewEmptyState isGenerating={isGenerating} buildProgress={buildProgress} blueprintPhase={blueprintPhase} pageStatuses={pageStatuses} device={device} blueprintPalette={blueprintPalette} componentsReady={componentsReady} />
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
            sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-popups-to-escape-sandbox"
            className="h-full w-full border-0"
            title="Website Preview"
          />
        </div>

        {isGenerating && hasContent && <PreviewLoadingOverlay buildProgress={buildProgress} blueprintPhase={blueprintPhase} pageStatuses={pageStatuses} componentsReady={componentsReady} />}

        {isEditing && hasContent && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 rounded-lg border border-muted-foreground/10 bg-background/95 px-3 py-1.5 shadow-md backdrop-blur-sm">
            <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
            <span className="text-xs font-medium text-muted-foreground">Applying edits...</span>
          </div>
        )}
      </div>
    </div>
  );
}
