'use client';

import { cn } from '@/lib/utils';
import type { BuildProgressState } from '@/hooks/useBuildProgress';
import type { BlueprintPhase, PageGenerationStatus } from '@/hooks/useBlueprintGeneration';

interface PreviewLoadingOverlayProps {
  buildProgress?: BuildProgressState;
  blueprintPhase?: BlueprintPhase;
  pageStatuses?: PageGenerationStatus[];
}

function OverlayRing({
  size,
  strokeWidth,
  percent,
  indeterminate,
}: {
  size: number;
  strokeWidth: number;
  percent: number;
  indeterminate?: boolean;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const arcLength = indeterminate ? circumference * 0.25 : (percent / 100) * circumference;
  const offset = circumference - arcLength;

  return (
    <div className="relative flex items-center justify-center">
      <svg
        width={size}
        height={size}
        className={cn('-rotate-90', indeterminate && 'animate-spin')}
        style={indeterminate ? { animationDuration: '1.5s' } : undefined}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--border)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--primary)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={cn(!indeterminate && 'transition-all duration-700 ease-out')}
        />
      </svg>
      {!indeterminate && (
        <span className="absolute text-xs font-semibold text-foreground">{percent}%</span>
      )}
    </div>
  );
}

function BlueprintOverlayContent({ blueprintPhase, pageStatuses }: { blueprintPhase: BlueprintPhase; pageStatuses?: PageGenerationStatus[] }) {
  const isComponentsPhase = blueprintPhase === 'generating-components';
  const isPagesPhase = blueprintPhase === 'generating-pages';

  const completed = pageStatuses?.filter((p) => p.status === 'complete').length ?? 0;
  const generating = pageStatuses?.find((p) => p.status === 'generating');
  const total = pageStatuses?.length ?? 0;
  const currentNum = completed + (generating ? 1 : 0);

  // During components: indeterminate (no page count yet)
  // During pages: determinate with (1 + completed) / (1 + total)
  const isIndeterminate = isComponentsPhase;
  const totalSteps = total + 1;
  const completedSteps = (isPagesPhase ? 1 : 0) + completed;
  const percent = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

  const label = isComponentsPhase
    ? 'Styles & components'
    : generating
      ? `${generating.filename} (${currentNum}/${total})`
      : `Pages (${completed}/${total})`;

  return (
    <div className="flex items-center gap-3 rounded-xl border border-muted-foreground/10 bg-background/90 pl-2 pr-4 py-2 shadow-lg backdrop-blur-sm">
      <OverlayRing
        size={64}
        strokeWidth={3.5}
        percent={percent}
        indeterminate={isIndeterminate}
      />

      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <span className="text-[11px] text-muted-foreground">
          {isComponentsPhase ? 'Building shared styles & components...' : 'Generating content & layout...'}
        </span>
      </div>
    </div>
  );
}

export function PreviewLoadingOverlay({ buildProgress, blueprintPhase, pageStatuses }: PreviewLoadingOverlayProps) {
  const isBlueprintActive = blueprintPhase && blueprintPhase !== 'idle' && blueprintPhase !== 'complete' && blueprintPhase !== 'error';

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-background/30 backdrop-blur-[2px]">
      {isBlueprintActive ? (
        <BlueprintOverlayContent blueprintPhase={blueprintPhase} pageStatuses={pageStatuses} />
      ) : (
        <div className="flex items-center gap-3 rounded-xl border border-muted-foreground/10 bg-background/90 pl-2 pr-4 py-2 shadow-lg backdrop-blur-sm">
          <OverlayRing
            size={64}
            strokeWidth={3.5}
            percent={buildProgress?.percent ?? 0}
          />
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-foreground">
              {buildProgress?.label || 'Generating...'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
