'use client';

import { AlertCircle, AlertTriangle, Check, Clock, Globe, Image, Loader2, Search } from 'lucide-react';
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
  fetchUrl: Globe,
};

export function PageProgress({ pageStatuses, componentsStatus, isRetrying, onCancel }: PageProgressProps) {
  const completedPages = pageStatuses.filter((p) => p.status === 'complete').length;
  const generatingPage = pageStatuses.find((p) => p.status === 'generating');
  const currentPage = completedPages + (generatingPage ? 1 : 0);
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
                ? `Retrying failed pages (${currentPage} of ${totalPages})`
                : totalPages === 1
                  ? 'Generating your site...'
                  : `Generating pages (${currentPage} of ${totalPages})`}
          </span>
          {onCancel && (
            <Button size="xs" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          )}
        </div>

        {/* Progress bar with shimmer */}
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="relative h-full overflow-hidden rounded-full bg-primary transition-all duration-500 ease-out"
            style={{ width: `${percent}%` }}
          >
            <div
              className="absolute inset-0"
              style={{
                background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.25) 50%, transparent 100%)',
                animation: 'shimmerBar 1.8s ease-in-out infinite',
              }}
            />
          </div>
        </div>

        {/* Steps list */}
        <div className="space-y-1.5">
          {/* Shared components step */}
          {hasComponentsStep && (
            <div
              className="flex items-center gap-2"
              style={{ animation: 'fadeSlideIn 0.3s ease-out both' }}
            >
              {componentsStatus === 'generating' ? (
                <Loader2 className="size-3.5 animate-spin text-primary"  />
              ) : (
                <Check className="size-3.5 text-green-600 dark:text-green-500" style={{ animation: 'fadeSlideIn 0.2s ease-out' }} />
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
          {pageStatuses.map((page, idx) => (
            <div
              key={page.filename}
              style={{
                animation: 'fadeSlideIn 0.3s ease-out both',
                animationDelay: `${(idx + 1) * 60}ms`,
              }}
            >
              <div
                className={`flex items-center gap-2 rounded-md px-1.5 py-0.5 transition-all duration-300 ${
                  page.status === 'generating'
                    ? 'border-l-2 border-primary bg-primary/[0.04]'
                    : ''
                }`}
              >
                {page.status === 'pending' && (
                  <Clock className="size-3.5 text-muted-foreground/50" />
                )}
                {page.status === 'generating' && (
                  <Loader2 className="size-3.5 animate-spin text-primary"  />
                )}
                {page.status === 'complete' && (
                  <Check className="size-3.5 text-green-600 dark:text-green-500" style={{ animation: 'fadeSlideIn 0.2s ease-out' }} />
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
                  {page.toolActivities.map((activity, actIdx) => {
                    const Icon = TOOL_ICONS[activity.toolName] ?? Globe;
                    return (
                      <div
                        key={activity.toolCallId}
                        className="flex items-center gap-1.5 text-[11px] leading-tight"
                        style={{
                          animation: 'fadeSlideIn 0.25s ease-out both',
                          animationDelay: `${actIdx * 30}ms`,
                        }}
                      >
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
