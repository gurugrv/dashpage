'use client';

import { AlertCircle, AlertTriangle, Check, Clock, Globe, Image, Loader2, Palette, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { PageGenerationStatus } from '@/hooks/useBlueprintGeneration';

interface PageProgressProps {
  pageStatuses: PageGenerationStatus[];
  componentsStatus?: 'generating' | 'complete';
  isRetrying?: boolean;
  onCancel?: () => void;
}

const TOOL_ICONS: Record<string, typeof Globe> = {
  searchImages: Image,
  searchIcons: Search,
  generateColorPalette: Palette,
  fetchUrl: Globe,
};

export function PageProgress({ pageStatuses, componentsStatus, isRetrying, onCancel }: PageProgressProps) {
  const completedPages = pageStatuses.filter((p) => p.status === 'complete').length;
  const totalPages = pageStatuses.length;

  // Include components step in progress calculation
  const hasComponentsStep = !!componentsStatus;
  const componentsComplete = componentsStatus === 'complete';
  const totalSteps = totalPages + (hasComponentsStep ? 1 : 0);
  const completedSteps = completedPages + (componentsComplete ? 1 : 0);
  const percent = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

  return (
    <div className="mx-4 my-3 rounded-lg border bg-background shadow-sm">
      <div className="space-y-3 px-4 py-3">
        {/* Overall progress */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">
            {hasComponentsStep && !componentsComplete
              ? 'Preparing shared styles & components...'
              : isRetrying
                ? `Retrying failed pages (${completedPages} of ${totalPages})`
                : `Generating pages (${completedPages} of ${totalPages})`}
          </span>
          {onCancel && (
            <Button size="xs" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          )}
        </div>

        {/* Progress bar */}
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
            style={{ width: `${percent}%` }}
          />
        </div>

        {/* Steps list */}
        <div className="space-y-1.5">
          {/* Shared components step */}
          {hasComponentsStep && (
            <div className="flex items-center gap-2">
              {componentsStatus === 'generating' ? (
                <Loader2 className="size-3.5 animate-spin text-primary" />
              ) : (
                <Check className="size-3.5 text-green-600 dark:text-green-500" />
              )}
              <span
                className={`text-xs ${
                  componentsStatus === 'complete'
                    ? 'text-muted-foreground'
                    : 'text-foreground font-medium'
                }`}
              >
                Shared styles, header & footer
              </span>
            </div>
          )}

          {/* Per-page list */}
          {pageStatuses.map((page) => (
            <div key={page.filename}>
              <div className="flex items-center gap-2">
                {page.status === 'pending' && (
                  <Clock className="size-3.5 text-muted-foreground/50" />
                )}
                {page.status === 'generating' && (
                  <Loader2 className="size-3.5 animate-spin text-primary" />
                )}
                {page.status === 'complete' && (
                  <Check className="size-3.5 text-green-600 dark:text-green-500" />
                )}
                {page.status === 'error' && (
                  <AlertCircle className="size-3.5 text-destructive" />
                )}
                <span
                  className={`text-xs ${
                    page.status === 'complete'
                      ? 'text-muted-foreground'
                      : page.status === 'generating'
                        ? 'text-foreground font-medium'
                        : page.status === 'error'
                          ? 'text-destructive'
                          : 'text-muted-foreground/50'
                  }`}
                >
                  {page.filename}
                </span>
                {page.status === 'error' && page.error && (
                  <span className="text-xs text-destructive/80">{page.error}</span>
                )}
              </div>

              {/* Tool activity for currently generating page */}
              {page.status === 'generating' && page.toolActivities && page.toolActivities.length > 0 && (
                <div className="ml-5.5 mt-0.5 flex flex-col gap-0.5">
                  {page.toolActivities.map((activity) => {
                    const Icon = TOOL_ICONS[activity.toolName] ?? Globe;
                    return (
                      <div key={activity.toolCallId} className="flex items-center gap-1.5 text-[11px] leading-tight">
                        {activity.status === 'running' && (
                          <Loader2 className="size-2.5 animate-spin text-muted-foreground" />
                        )}
                        {activity.status === 'done' && (
                          <Check className="size-2.5 text-primary" />
                        )}
                        {activity.status === 'error' && (
                          <AlertTriangle className="size-2.5 text-destructive" />
                        )}
                        <Icon className="size-2.5 text-muted-foreground" />
                        <span className={
                          activity.status === 'error'
                            ? 'text-destructive'
                            : 'text-muted-foreground'
                        }>
                          {activity.label}
                          {activity.detail && (
                            <span className="ml-1 opacity-70">{activity.detail}</span>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
