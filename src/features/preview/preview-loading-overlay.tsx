'use client';

import type { BuildProgressState } from '@/hooks/useBuildProgress';
import type { BlueprintPhase, PageGenerationStatus } from '@/hooks/useBlueprintGeneration';

interface PreviewLoadingOverlayProps {
  buildProgress?: BuildProgressState;
  blueprintPhase?: BlueprintPhase;
  pageStatuses?: PageGenerationStatus[];
}

export function PreviewLoadingOverlay({ buildProgress, blueprintPhase, pageStatuses }: PreviewLoadingOverlayProps) {
  const isBlueprintActive = blueprintPhase && blueprintPhase !== 'idle' && blueprintPhase !== 'complete' && blueprintPhase !== 'error';

  let label: string;
  let showProgress = false;
  let percent = 0;

  if (isBlueprintActive) {
    if (blueprintPhase === 'generating-pages' && pageStatuses?.length) {
      const completed = pageStatuses.filter((p) => p.status === 'complete').length;
      label = `Building pages (${completed} of ${pageStatuses.length})...`;
      showProgress = true;
      percent = Math.round((completed / pageStatuses.length) * 100);
    } else if (blueprintPhase === 'generating-blueprint') {
      label = 'Planning site architecture...';
    } else {
      label = 'Generating...';
    }
  } else {
    label = buildProgress?.label || 'Generating...';
    showProgress = !!buildProgress?.isActive;
    percent = buildProgress?.percent ?? 0;
  }

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-background/50 backdrop-blur-[1px]">
      <div className="flex flex-col items-center gap-2 rounded-xl border bg-background/90 px-5 py-3 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="size-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="text-sm text-muted-foreground">{label}</span>
        </div>
        {showProgress && (
          <div className="h-1 w-28 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
              style={{ width: `${percent}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
