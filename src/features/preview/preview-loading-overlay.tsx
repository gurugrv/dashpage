'use client';

import type { BuildProgressState } from '@/hooks/useBuildProgress';

interface PreviewLoadingOverlayProps {
  buildProgress?: BuildProgressState;
}

export function PreviewLoadingOverlay({ buildProgress }: PreviewLoadingOverlayProps) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-background/50 backdrop-blur-[1px]">
      <div className="flex flex-col items-center gap-2 rounded-xl border bg-background/90 px-5 py-3 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="size-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="text-sm text-muted-foreground">{buildProgress?.label || 'Generating...'}</span>
        </div>
        {buildProgress?.isActive && (
          <div className="h-1 w-28 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
              style={{ width: `${buildProgress.percent}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
