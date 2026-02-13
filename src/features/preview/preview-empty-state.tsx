'use client';

import { Globe } from 'lucide-react';
import type { BuildProgressState } from '@/hooks/useBuildProgress';
import type { BlueprintPhase, PageGenerationStatus } from '@/hooks/useBlueprintGeneration';
import { cn } from '@/lib/utils';

interface PreviewEmptyStateProps {
  isGenerating: boolean;
  buildProgress?: BuildProgressState;
  blueprintPhase?: BlueprintPhase;
  pageStatuses?: PageGenerationStatus[];
}

// ---------------------------------------------------------------------------
// Wireframe section – transitions from dashed outline → shimmer → filled
// ---------------------------------------------------------------------------
type BlockStatus = 'idle' | 'active' | 'complete';

function WireframeBlock({
  status,
  className,
  children,
}: {
  status: BlockStatus;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'rounded-sm transition-all duration-700 ease-in-out relative overflow-hidden',
        status === 'idle' && 'border border-dashed border-muted-foreground/15 bg-transparent',
        status === 'active' && 'border border-primary/30 bg-primary/[0.03]',
        status === 'complete' && 'border border-primary/20 bg-primary/[0.08]',
        className,
      )}
    >
      {/* Sweep shimmer for active blocks */}
      {status === 'active' && (
        <div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(90deg, transparent 0%, color-mix(in srgb, var(--primary) 7%, transparent) 50%, transparent 100%)',
            animation: 'wireframeSweep 2s ease-in-out infinite',
          }}
        />
      )}
      {children}
    </div>
  );
}

// Tiny decorative lines to simulate text / nav items inside wireframe blocks
function WireframeLine({ w = 'w-10', className }: { w?: string; className?: string }) {
  return <div className={cn('h-[3px] rounded-full bg-current opacity-[0.15]', w, className)} />;
}
function WireframeDot({ className }: { className?: string }) {
  return <div className={cn('size-[5px] rounded-full bg-current opacity-[0.12]', className)} />;
}

// ---------------------------------------------------------------------------
// SVG progress ring — determinate or indeterminate
// ---------------------------------------------------------------------------
function ProgressRing({
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

  // Indeterminate: show ~25% arc that spins
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
        <span className="absolute text-[10px] font-semibold text-foreground">
          {percent}%
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Blueprint wireframe morph – the main visual
// ---------------------------------------------------------------------------
function BlueprintWireframe({
  blueprintPhase,
  pageStatuses,
}: {
  blueprintPhase: BlueprintPhase;
  pageStatuses?: PageGenerationStatus[];
}) {
  const isComponentsPhase = blueprintPhase === 'generating-components';
  const isPagesPhase = blueprintPhase === 'generating-pages';
  const isBlueprintPhase = blueprintPhase === 'generating-blueprint';
  const isApproval = blueprintPhase === 'awaiting-approval';

  // Derive statuses for wireframe sections
  const headerStatus: BlockStatus = isComponentsPhase ? 'active' : isPagesPhase ? 'complete' : 'idle';
  const footerStatus: BlockStatus = headerStatus;

  // Map pages to content sections (max 4 visual blocks)
  const completed = pageStatuses?.filter((p) => p.status === 'complete').length ?? 0;
  const generating = pageStatuses?.find((p) => p.status === 'generating');
  const total = pageStatuses?.length ?? 0;
  const currentNum = completed + (generating ? 1 : 0);

  // Content sections: hero, features row, content block, CTA
  // Map page completion to how many light up, capped at 3 so index 3 is the last active slot
  const contentSections = 4;
  const pagesFilledRatio = total > 0 ? completed / total : 0;
  const sectionsLit = Math.min(Math.floor(pagesFilledRatio * contentSections), contentSections);
  // Active section: the next one after lit sections, but cap at max index
  const activeSectionIdx = isPagesPhase && generating
    ? Math.min(sectionsLit, contentSections - 1)
    : -1;

  function contentStatus(idx: number): BlockStatus {
    if (!isPagesPhase) return 'idle';
    if (idx < sectionsLit) return 'complete';
    if (idx === activeSectionIdx) return 'active';
    return 'idle';
  }

  // Overall progress for the ring
  // During components phase: indeterminate (we don't know total pages yet)
  // During pages phase: (1 + completed) / (1 + total) — components counts as 1 done step
  const isIndeterminate = isComponentsPhase;
  const totalSteps = total + 1;
  const completedSteps = (isPagesPhase ? 1 : 0) + completed;
  const percent = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

  // Text info
  let headline: string;
  let subtitle: string;
  if (isBlueprintPhase) {
    headline = 'Designing site architecture';
    subtitle = 'Analyzing your prompt and planning page structure...';
  } else if (isApproval) {
    headline = 'Blueprint ready';
    subtitle = 'Review and approve in the prompt panel';
  } else if (isComponentsPhase) {
    headline = 'Building shared styles';
    subtitle = 'Generating design system, header & footer...';
  } else if (isPagesPhase && generating) {
    headline = `${generating.filename}`;
    subtitle = `Page ${currentNum} of ${total} — generating content & layout`;
  } else if (isPagesPhase) {
    headline = 'Assembling pages';
    subtitle = `${completed} of ${total} pages complete`;
  } else {
    headline = 'Building your website';
    subtitle = 'This will take a moment...';
  }

  const showWireframe = isComponentsPhase || isPagesPhase;

  return (
    <>
      {/* Keyframes */}
      <style>{`
        @keyframes wireframeSweep {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div className="flex flex-col items-center gap-5" style={{ animation: 'fadeInUp 0.4s ease-out' }}>
        {showWireframe ? (
          <>
            {/* ---- Wireframe + ring combo ---- */}
            <div className="relative">
              {/* Browser-window frame */}
              <div className="w-[280px] rounded-lg border border-muted-foreground/10 bg-muted/30 shadow-sm overflow-hidden">
                {/* Chrome bar */}
                <div className="flex items-center gap-1.5 border-b border-muted-foreground/10 px-3 py-1.5">
                  <div className="flex gap-1">
                    <div className="size-[6px] rounded-full bg-muted-foreground/20" />
                    <div className="size-[6px] rounded-full bg-muted-foreground/20" />
                    <div className="size-[6px] rounded-full bg-muted-foreground/20" />
                  </div>
                  <div className="ml-2 h-[7px] flex-1 rounded-full bg-muted-foreground/[0.08]" />
                </div>

                {/* Page content */}
                <div className="flex flex-col gap-[6px] p-3 text-foreground">
                  {/* Header */}
                  <WireframeBlock status={headerStatus} className="flex items-center justify-between px-2.5 py-2">
                    <WireframeLine w="w-10" />
                    <div className="flex items-center gap-1.5">
                      <WireframeLine w="w-5" />
                      <WireframeLine w="w-5" />
                      <WireframeLine w="w-5" />
                      <WireframeLine w="w-5" />
                    </div>
                  </WireframeBlock>

                  {/* Hero section */}
                  <WireframeBlock status={contentStatus(0)} className="flex flex-col items-center gap-1.5 px-4 py-5">
                    <WireframeLine w="w-28" />
                    <WireframeLine w="w-20" />
                    <div className="mt-1 h-[10px] w-16 rounded-sm bg-current opacity-[0.08]" />
                  </WireframeBlock>

                  {/* Features row */}
                  <WireframeBlock status={contentStatus(1)} className="p-2">
                    <div className="grid grid-cols-3 gap-1.5">
                      {[0, 1, 2].map((i) => (
                        <div key={i} className="flex flex-col items-center gap-1 rounded-sm border border-current/[0.06] py-2">
                          <WireframeDot />
                          <WireframeLine w="w-6" />
                          <WireframeLine w="w-8" />
                        </div>
                      ))}
                    </div>
                  </WireframeBlock>

                  {/* Content section */}
                  <WireframeBlock status={contentStatus(2)} className="flex gap-2 p-2">
                    <div className="h-10 w-14 rounded-sm bg-current opacity-[0.06]" />
                    <div className="flex flex-1 flex-col gap-1 py-0.5">
                      <WireframeLine w="w-full" />
                      <WireframeLine w="w-3/4" />
                      <WireframeLine w="w-1/2" />
                    </div>
                  </WireframeBlock>

                  {/* CTA / extra block */}
                  <WireframeBlock status={contentStatus(3)} className="flex flex-col items-center gap-1 py-3">
                    <WireframeLine w="w-24" />
                    <WireframeLine w="w-16" />
                  </WireframeBlock>

                  {/* Footer */}
                  <WireframeBlock status={footerStatus} className="flex items-center justify-between px-2.5 py-2">
                    <WireframeLine w="w-8" />
                    <div className="flex gap-1.5">
                      <WireframeLine w="w-4" />
                      <WireframeLine w="w-4" />
                      <WireframeLine w="w-4" />
                    </div>
                  </WireframeBlock>
                </div>
              </div>

              {/* Progress ring – bottom-right corner */}
              <div className="absolute -bottom-3 -right-3 flex items-center justify-center rounded-full bg-background shadow-md border border-muted-foreground/10">
                <ProgressRing
                  size={52}
                  strokeWidth={3}
                  percent={percent}
                  indeterminate={isIndeterminate}
                />
              </div>
            </div>

            {/* Text below wireframe */}
            <div className="flex flex-col items-center gap-0.5 mt-1">
              <p className="text-sm font-medium text-foreground">{headline}</p>
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            </div>
          </>
        ) : (
          <>
            {/* Non-wireframe phases: blueprint planning / approval */}
            <div className="size-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <div className="flex flex-col items-center gap-0.5">
              <p className="text-sm font-medium text-foreground">{headline}</p>
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            </div>
          </>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------
export function PreviewEmptyState({ isGenerating, buildProgress, blueprintPhase, pageStatuses }: PreviewEmptyStateProps) {
  if (isGenerating) {
    const isBlueprintActive = blueprintPhase && blueprintPhase !== 'idle' && blueprintPhase !== 'complete' && blueprintPhase !== 'error';

    if (isBlueprintActive) {
      return <BlueprintWireframe blueprintPhase={blueprintPhase} pageStatuses={pageStatuses} />;
    }

    return (
      <div className="flex items-center gap-3 rounded-xl border border-muted-foreground/10 bg-background/90 pl-2 pr-4 py-2 shadow-lg backdrop-blur-sm">
        <ProgressRing
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
    );
  }

  return (
    <>
      <Globe className="size-12 opacity-30" />
      <p className="text-sm">Enter a prompt to generate your website</p>
    </>
  );
}
