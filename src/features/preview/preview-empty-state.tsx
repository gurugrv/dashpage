'use client';

import { Globe } from 'lucide-react';
import type { BuildProgressState } from '@/hooks/useBuildProgress';
import type { BlueprintPhase, PageGenerationStatus } from '@/hooks/useBlueprintGeneration';

interface PreviewEmptyStateProps {
  isGenerating: boolean;
  buildProgress?: BuildProgressState;
  blueprintPhase?: BlueprintPhase;
  pageStatuses?: PageGenerationStatus[];
}

function getBlueprintLabel(phase: BlueprintPhase, pageStatuses?: PageGenerationStatus[]): string {
  switch (phase) {
    case 'generating-blueprint':
      return 'Planning site architecture...';
    case 'awaiting-approval':
      return 'Review your blueprint...';
    case 'generating-pages': {
      const completed = pageStatuses?.filter((p) => p.status === 'complete').length ?? 0;
      const total = pageStatuses?.length ?? 0;
      return total > 0 ? `Building pages (${completed} of ${total})...` : 'Building pages...';
    }
    default:
      return 'Generating your website...';
  }
}

function getBlueprintPercent(pageStatuses?: PageGenerationStatus[]): number {
  if (!pageStatuses?.length) return 0;
  const completed = pageStatuses.filter((p) => p.status === 'complete').length;
  return Math.round((completed / pageStatuses.length) * 100);
}

export function PreviewEmptyState({ isGenerating, buildProgress, blueprintPhase, pageStatuses }: PreviewEmptyStateProps) {
  if (isGenerating) {
    const isBlueprintActive = blueprintPhase && blueprintPhase !== 'idle' && blueprintPhase !== 'complete' && blueprintPhase !== 'error';
    const label = isBlueprintActive
      ? getBlueprintLabel(blueprintPhase, pageStatuses)
      : (buildProgress?.label || 'Generating your website...');
    const showProgress = isBlueprintActive
      ? blueprintPhase === 'generating-pages'
      : buildProgress?.isActive;
    const percent = isBlueprintActive
      ? getBlueprintPercent(pageStatuses)
      : (buildProgress?.percent ?? 0);

    return (
      <>
        <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-sm">{label}</p>
        {showProgress && (
          <div className="mt-1 h-1 w-32 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
              style={{ width: `${percent}%` }}
            />
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <Globe className="size-12 opacity-30" />
      <p className="text-sm">Enter a prompt to generate your website</p>
    </>
  );
}
