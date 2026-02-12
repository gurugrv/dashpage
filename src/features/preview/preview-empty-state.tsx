'use client';

import { Globe } from 'lucide-react';
import type { BuildProgressState } from '@/hooks/useBuildProgress';

interface PreviewEmptyStateProps {
  isGenerating: boolean;
  buildProgress?: BuildProgressState;
}

export function PreviewEmptyState({ isGenerating, buildProgress }: PreviewEmptyStateProps) {
  if (isGenerating) {
    return (
      <>
        <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-sm">{buildProgress?.label || 'Generating your website...'}</p>
        {buildProgress?.isActive && (
          <div className="mt-1 h-1 w-32 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
              style={{ width: `${buildProgress.percent}%` }}
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
