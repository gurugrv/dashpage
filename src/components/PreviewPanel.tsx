'use client';

import { useCallback, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import type { BuildProgressState } from '@/hooks/useBuildProgress';
import type { ProjectFiles } from '@/types';
import { DEVICE_WIDTHS, type DeviceSize } from '@/features/preview/constants';
import { PreviewEmptyState } from '@/features/preview/preview-empty-state';
import { PreviewLoadingOverlay } from '@/features/preview/preview-loading-overlay';
import { PreviewToolbar } from '@/features/preview/preview-toolbar';

interface PreviewPanelProps {
  files: ProjectFiles;
  lastValidFiles: ProjectFiles;
  isGenerating: boolean;
  buildProgress?: BuildProgressState;
}

export function PreviewPanel({ files, lastValidFiles, isGenerating, buildProgress }: PreviewPanelProps) {
  const [device, setDevice] = useState<DeviceSize>('desktop');
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const srcDoc = isGenerating
    ? (lastValidFiles['index.html'] || '')
    : (files['index.html'] || lastValidFiles['index.html'] || '');

  const hasContent = !!srcDoc;

  const handleRefresh = useCallback(() => {
    if (!iframeRef.current || !srcDoc) return;

    const current = srcDoc;
    iframeRef.current.srcdoc = '';
    requestAnimationFrame(() => {
      if (iframeRef.current) iframeRef.current.srcdoc = current;
    });
  }, [srcDoc]);

  const handleDownload = useCallback(() => {
    const content = files['index.html'] || lastValidFiles['index.html'];
    if (!content) return;

    const blob = new Blob([content], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'website.html';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }, [files, lastValidFiles]);

  return (
    <div className="flex h-full flex-col bg-muted/20">
      <PreviewToolbar
        device={device}
        hasContent={hasContent}
        onDeviceChange={setDevice}
        onRefresh={handleRefresh}
        onDownload={handleDownload}
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
            <PreviewEmptyState isGenerating={isGenerating} buildProgress={buildProgress} />
          </div>
        )}

        {isGenerating && hasContent && <PreviewLoadingOverlay buildProgress={buildProgress} />}
      </div>
    </div>
  );
}
