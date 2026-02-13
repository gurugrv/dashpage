'use client';

import { AlertTriangle, Play, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ResumeCardProps {
  mode: 'chat' | 'blueprint';
  phase: string;
  completedPages?: number;
  totalPages?: number;
  isLoading: boolean;
  onResume: () => void;
  onDiscard: () => void;
}

export function ResumeCard({
  mode,
  completedPages = 0,
  totalPages = 0,
  isLoading,
  onResume,
  onDiscard,
}: ResumeCardProps) {
  if (isLoading) return null;

  const isBlueprintMode = mode === 'blueprint';
  const progress = totalPages > 0 ? Math.round((completedPages / totalPages) * 100) : 0;

  return (
    <div className="mx-4 mb-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-500" />
        <div className="flex-1 space-y-2">
          <p className="text-sm font-medium text-foreground">
            {isBlueprintMode
              ? 'Multi-page generation was interrupted'
              : 'Generation was interrupted'}
          </p>
          {isBlueprintMode && totalPages > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{completedPages} of {totalPages} pages completed</span>
                <span>{progress}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-amber-500 transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}
          {!isBlueprintMode && (
            <p className="text-xs text-muted-foreground">
              Partial response was saved. You can continue generating or keep the current state.
            </p>
          )}
          <div className="flex items-center gap-2 pt-1">
            <Button size="sm" onClick={onResume} className="gap-1.5">
              <Play className="size-3" />
              {isBlueprintMode ? 'Resume Generation' : 'Continue Generation'}
            </Button>
            <Button size="sm" variant="ghost" onClick={onDiscard} className="gap-1.5 text-muted-foreground">
              <X className="size-3" />
              {isBlueprintMode ? 'Discard & Start Over' : 'Keep As-Is'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
