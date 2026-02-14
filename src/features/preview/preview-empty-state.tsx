'use client';

import { Globe } from 'lucide-react';
import type { BuildProgressState } from '@/hooks/useBuildProgress';
import type { BlueprintPhase, PageGenerationStatus } from '@/hooks/useBlueprintGeneration';
import type { PaletteColors } from '@/types/build-progress';
import type { DeviceSize } from '@/features/preview/constants';
import { cn } from '@/lib/utils';

interface PreviewEmptyStateProps {
  isGenerating: boolean;
  buildProgress?: BuildProgressState;
  blueprintPhase?: BlueprintPhase;
  pageStatuses?: PageGenerationStatus[];
  device?: DeviceSize;
  blueprintPalette?: PaletteColors;
}

// ---------------------------------------------------------------------------
// Wireframe section – transitions from dashed outline → shimmer → filled
// ---------------------------------------------------------------------------
type BlockStatus = 'idle' | 'active' | 'complete';

// Section labels for each wireframe region
const SECTION_LABELS = ['Header', 'Hero', 'Features', 'Content', 'Call to Action', 'Footer'] as const;

function WireframeBlock({
  status,
  label,
  className,
  children,
  delay = 0,
  tintColor,
}: {
  status: BlockStatus;
  label?: string;
  className?: string;
  children?: React.ReactNode;
  delay?: number;
  tintColor?: string;
}) {
  // Use tint color for active/complete block borders and backgrounds
  const tintBorder = tintColor ? `${tintColor}4d` : undefined; // 30% alpha
  const tintBg = tintColor ? `${tintColor}08` : undefined; // ~3% alpha
  const tintBgComplete = tintColor ? `${tintColor}14` : undefined; // ~8% alpha
  const tintSweep = tintColor ? `${tintColor}12` : undefined; // ~7% alpha

  return (
    <div
      className={cn(
        'rounded-sm transition-all duration-700 ease-in-out relative overflow-hidden',
        status === 'idle' && 'border border-dashed border-muted-foreground/15 bg-transparent',
        !tintColor && status === 'active' && 'border border-primary/30 bg-primary/[0.03]',
        !tintColor && status === 'complete' && 'border border-primary/20 bg-primary/[0.08]',
        className,
      )}
      style={{
        ...(status !== 'idle'
          ? { animation: 'fadeSlideIn 0.4s ease-out both', animationDelay: `${delay}ms` }
          : undefined),
        ...(tintColor && status === 'active'
          ? { borderColor: tintBorder, backgroundColor: tintBg, borderStyle: 'solid', borderWidth: '1px' }
          : undefined),
        ...(tintColor && status === 'complete'
          ? { borderColor: tintBorder, backgroundColor: tintBgComplete, borderStyle: 'solid', borderWidth: '1px' }
          : undefined),
      }}
    >
      {/* Section label – in-flow so it pushes children down */}
      {label && (
        <div
          className={cn(
            'text-[10px] font-medium tracking-wide uppercase pointer-events-none transition-all duration-700 px-2.5 pt-1.5 pb-0',
            status === 'idle' && 'opacity-[0.15]',
            status === 'active' && 'opacity-[0.35]',
            status === 'complete' && 'opacity-0',
          )}
          style={tintColor && status !== 'idle' ? { color: tintColor } : undefined}
        >
          {label}
        </div>
      )}

      {/* Sweep shimmer for active blocks */}
      {status === 'active' && (
        <div
          className="absolute inset-0"
          style={{
            background: tintSweep
              ? `linear-gradient(90deg, transparent 0%, ${tintSweep} 50%, transparent 100%)`
              : 'linear-gradient(90deg, transparent 0%, color-mix(in srgb, var(--primary) 7%, transparent) 50%, transparent 100%)',
            animation: 'wireframeSweep 2s ease-in-out infinite',
          }}
        />
      )}
      {children}
    </div>
  );
}

// Tiny decorative lines to simulate text / nav items inside wireframe blocks
function WireframeLine({ w = 'w-10', className, tintColor }: { w?: string; className?: string; tintColor?: string }) {
  return (
    <div
      className={cn('h-[3px] rounded-full bg-current opacity-[0.15]', w, className)}
      style={tintColor ? { backgroundColor: tintColor, opacity: 0.2 } : undefined}
    />
  );
}
function WireframeDot({ className, tintColor }: { className?: string; tintColor?: string }) {
  return (
    <div
      className={cn('size-[5px] rounded-full bg-current opacity-[0.12]', className)}
      style={tintColor ? { backgroundColor: tintColor, opacity: 0.18 } : undefined}
    />
  );
}

// ---------------------------------------------------------------------------
// SVG progress ring — determinate or indeterminate
// ---------------------------------------------------------------------------
function ProgressRing({
  size,
  strokeWidth,
  percent,
  indeterminate,
  ringColor,
}: {
  size: number;
  strokeWidth: number;
  percent: number;
  indeterminate?: boolean;
  ringColor?: string;
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
          stroke={ringColor ?? 'var(--primary)'}
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
// Shared wireframe browser-frame visual (full-size, device-responsive)
// ---------------------------------------------------------------------------
function WireframeVisual({
  headerStatus,
  footerStatus,
  contentStatusFn,
  percent,
  indeterminate,
  headline,
  subtitle,
  palette,
  device = 'desktop',
}: {
  headerStatus: BlockStatus;
  footerStatus: BlockStatus;
  contentStatusFn: (idx: number) => BlockStatus;
  percent: number;
  indeterminate?: boolean;
  headline: string;
  subtitle: string;
  palette?: PaletteColors;
  device?: DeviceSize;
}) {
  const isMobile = device === 'mobile';
  const tint = palette?.primary;
  const bgTint = palette?.background;

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
        @keyframes shimmerBar {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div
        className="flex h-full w-full flex-col transition-colors duration-1000"
        style={{
          animation: 'fadeInUp 0.4s ease-out',
          ...(bgTint ? { backgroundColor: `${bgTint}1a` } : undefined), // subtle bg tint
        }}
      >
        {/* Full-size wireframe layout — min-h-0 on flex children prevents overflow */}
        <div className={cn(
          'flex min-h-0 flex-1 flex-col text-foreground',
          isMobile ? 'gap-2 p-3' : 'gap-3 p-6',
        )}>
          {/* Header */}
          <WireframeBlock
            status={headerStatus}
            label={SECTION_LABELS[0]}
            tintColor={tint}
            className={cn(
              'flex shrink-0 items-center justify-between',
              isMobile ? 'px-3 py-2.5' : 'px-6 py-4',
            )}
          >
            <WireframeLine w={isMobile ? 'w-14' : 'w-24'} tintColor={tint} />
            <div className={cn('flex items-center', isMobile ? 'gap-2' : 'gap-3')}>
              {isMobile ? (
                // Hamburger icon for mobile
                <div className="flex flex-col gap-[3px]">
                  <WireframeLine w="w-5" tintColor={tint} />
                  <WireframeLine w="w-5" tintColor={tint} />
                  <WireframeLine w="w-5" tintColor={tint} />
                </div>
              ) : (
                <>
                  <WireframeLine w="w-12" tintColor={tint} />
                  <WireframeLine w="w-12" tintColor={tint} />
                  <WireframeLine w="w-12" tintColor={tint} />
                  <WireframeLine w="w-12" tintColor={tint} />
                </>
              )}
            </div>
          </WireframeBlock>

          {/* Hero section */}
          <WireframeBlock
            status={contentStatusFn(0)}
            label={SECTION_LABELS[1]}
            delay={0}
            tintColor={tint}
            className={cn(
              'flex min-h-0 flex-[2] flex-col items-center justify-center gap-3',
              isMobile ? 'px-4 py-6' : 'px-8 py-10',
            )}
          >
            <WireframeLine w={isMobile ? 'w-40' : 'w-64'} className="!h-[5px]" tintColor={tint} />
            <WireframeLine w={isMobile ? 'w-28' : 'w-48'} className="!h-[5px]" tintColor={tint} />
            <WireframeLine w={isMobile ? 'w-20' : 'w-36'} tintColor={tint} />
            <div
              className={cn('mt-2 rounded-sm opacity-[0.08]', isMobile ? 'h-[12px] w-20' : 'h-[14px] w-28')}
              style={tint ? { backgroundColor: tint, opacity: 0.15 } : { backgroundColor: 'currentColor' }}
            />
          </WireframeBlock>

          {/* Features row */}
          <WireframeBlock
            status={contentStatusFn(1)}
            label={SECTION_LABELS[2]}
            delay={60}
            tintColor={tint}
            className={cn('min-h-0 flex-1', isMobile ? 'p-2' : 'p-4')}
          >
            <div className={cn(
              'grid h-full gap-3',
              isMobile ? 'grid-cols-1 gap-2' : 'grid-cols-3 gap-4',
            )}>
              {(isMobile ? [0, 1] : [0, 1, 2]).map((i) => (
                <div key={i} className="flex flex-col items-center justify-center gap-2 rounded-sm border border-current/[0.06] py-3">
                  <WireframeDot className="!size-3" tintColor={tint} />
                  <WireframeLine w="w-16" tintColor={tint} />
                  <WireframeLine w="w-20" tintColor={tint} />
                </div>
              ))}
            </div>
          </WireframeBlock>

          {/* Content section */}
          <WireframeBlock
            status={contentStatusFn(2)}
            label={SECTION_LABELS[3]}
            delay={120}
            tintColor={tint}
            className={cn(
              'flex min-h-0 flex-1',
              isMobile ? 'flex-col gap-2 p-2' : 'flex-row gap-4 p-4',
            )}
          >
            <div
              className={cn(
                'rounded-sm opacity-[0.06]',
                isMobile ? 'h-16 w-full' : 'h-full w-1/3',
              )}
              style={tint ? { backgroundColor: tint, opacity: 0.1 } : { backgroundColor: 'currentColor' }}
            />
            <div className="flex flex-1 flex-col gap-2 py-2">
              <WireframeLine w="w-full" className="!h-[4px]" tintColor={tint} />
              <WireframeLine w="w-3/4" tintColor={tint} />
              <WireframeLine w="w-5/6" tintColor={tint} />
              <WireframeLine w="w-1/2" tintColor={tint} />
            </div>
          </WireframeBlock>

          {/* CTA / extra block */}
          <WireframeBlock
            status={contentStatusFn(3)}
            label={SECTION_LABELS[4]}
            delay={180}
            tintColor={tint}
            className={cn(
              'flex shrink-0 flex-col items-center justify-center gap-2',
              isMobile ? 'py-4' : 'py-6',
            )}
          >
            <WireframeLine w={isMobile ? 'w-32' : 'w-48'} className="!h-[4px]" tintColor={tint} />
            <WireframeLine w={isMobile ? 'w-24' : 'w-32'} tintColor={tint} />
          </WireframeBlock>

          {/* Footer */}
          <WireframeBlock
            status={footerStatus}
            label={SECTION_LABELS[5]}
            tintColor={tint}
            className={cn(
              'flex shrink-0 items-center justify-between',
              isMobile ? 'px-3 py-2.5' : 'px-6 py-3',
            )}
          >
            <WireframeLine w="w-16" tintColor={tint} />
            <div className="flex gap-3">
              <WireframeLine w="w-8" tintColor={tint} />
              <WireframeLine w="w-8" tintColor={tint} />
              <WireframeLine w="w-8" tintColor={tint} />
            </div>
          </WireframeBlock>
        </div>

        {/* Floating progress pill */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 rounded-full border border-muted-foreground/10 bg-background/90 pl-2 pr-4 py-2 shadow-lg backdrop-blur-sm z-10">
          <ProgressRing
            size={40}
            strokeWidth={3}
            percent={percent}
            indeterminate={indeterminate}
            ringColor={tint}
          />
          <div className="flex flex-col gap-0.5">
            <p className="text-sm font-medium text-foreground whitespace-nowrap">{headline}</p>
            <p className="text-[11px] text-muted-foreground whitespace-nowrap">{subtitle}</p>
          </div>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Phase-to-section mapping for single-page wireframe
// ---------------------------------------------------------------------------
// Maps buildProgress.phase to which wireframe sections are active/complete.
// This gives more accurate visual feedback than percent-range approximations.
//
// Phases flow: explaining → generating (with tools) → complete
// Tool order: searchImages/Icons (18-28%) → writeFiles (32-92%)
function phaseToSections(phase: string | undefined, percent: number): {
  header: BlockStatus;
  content: (idx: number) => BlockStatus;
  footer: BlockStatus;
} {
  // Phase-based mapping (more accurate than percent-only)
  switch (phase) {
    case 'explaining':
    case undefined:
      return {
        header: percent > 0 ? 'active' : 'idle',
        content: () => 'idle',
        footer: 'idle',
      };
    case 'navigation':
      return {
        header: 'active',
        content: (idx) => (idx === 0 ? 'active' : 'idle'),
        footer: 'idle',
      };
    case 'head':
    case 'styles':
      // Styles being generated — all sections shimmer briefly
      return {
        header: 'active',
        content: () => 'active',
        footer: 'active',
      };
    case 'body-started':
      return {
        header: 'complete',
        content: (idx) => (idx === 0 ? 'active' : 'idle'),
        footer: 'idle',
      };
    case 'content':
      // Use percent to determine which content blocks are done
      return {
        header: 'complete',
        content: (idx) => {
          const thresholds = [35, 50, 60, 72];
          const completeAt = [50, 60, 72, 85];
          if (percent >= completeAt[idx]) return 'complete';
          if (percent >= thresholds[idx]) return 'active';
          return 'idle';
        },
        footer: 'idle',
      };
    case 'footer':
      return {
        header: 'complete',
        content: () => 'complete',
        footer: 'active',
      };
    case 'scripts':
    case 'html-complete':
    case 'fileArtifact-started':
    case 'fileArtifact-complete':
    case 'complete':
      return {
        header: 'complete',
        content: () => 'complete',
        footer: 'complete',
      };
    // For tool-driven phases that don't map to specific sections,
    // fall back to percent-based approach
    case 'generating':
    default: {
      const headerStatus: BlockStatus = percent >= 15 ? 'complete' : percent > 5 ? 'active' : 'idle';
      const footerStatus: BlockStatus = percent >= 90 ? 'complete' : percent >= 82 ? 'active' : 'idle';
      const contentThresholds = [15, 35, 55, 70];
      const contentComplete = [35, 55, 70, 82];
      return {
        header: headerStatus,
        content: (idx) => {
          if (percent >= contentComplete[idx]) return 'complete';
          if (percent >= contentThresholds[idx]) return 'active';
          return 'idle';
        },
        footer: footerStatus,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Edit-mode wireframe – simpler, fewer sections
// ---------------------------------------------------------------------------
function EditWireframe({ buildProgress, device }: { buildProgress?: BuildProgressState; device?: DeviceSize }) {
  const percent = buildProgress?.percent ?? 0;

  // Edit operations are quick — show a simpler 2-section wireframe
  const contentStatus: BlockStatus = percent >= 80 ? 'complete' : percent > 0 ? 'active' : 'idle';

  return (
    <WireframeVisual
      headerStatus="complete"
      footerStatus={percent >= 90 ? 'complete' : 'idle'}
      contentStatusFn={() => contentStatus}
      percent={percent}
      headline={buildProgress?.label || 'Applying edits...'}
      subtitle="Updating your website"
      device={device}
    />
  );
}

// ---------------------------------------------------------------------------
// Single-page wireframe – phase-driven with palette tinting
// ---------------------------------------------------------------------------
function SinglePageWireframe({ buildProgress, device }: { buildProgress?: BuildProgressState; device?: DeviceSize }) {
  const percent = buildProgress?.percent ?? 0;
  const phase = buildProgress?.phase;

  // Use edit-specific wireframe for edit phases
  if (phase === 'edit-started' || phase === 'edit-applying' || phase === 'edit-complete') {
    return <EditWireframe buildProgress={buildProgress} device={device} />;
  }

  // Phase-mapped section statuses
  const sections = phaseToSections(phase, percent);

  return (
    <WireframeVisual
      headerStatus={sections.header}
      footerStatus={sections.footer}
      contentStatusFn={sections.content}
      percent={percent}
      headline={buildProgress?.label || 'Generating...'}
      subtitle="Building your website"
      device={device}
    />
  );
}

// ---------------------------------------------------------------------------
// Blueprint wireframe morph – multi-page visual
// ---------------------------------------------------------------------------
function BlueprintWireframe({
  blueprintPhase,
  pageStatuses,
  device,
  palette,
}: {
  blueprintPhase: BlueprintPhase;
  pageStatuses?: PageGenerationStatus[];
  device?: DeviceSize;
  palette?: PaletteColors;
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

  const contentSections = 4;
  const pagesFilledRatio = total > 0 ? completed / total : 0;
  const sectionsLit = Math.min(Math.floor(pagesFilledRatio * contentSections), contentSections);
  const activeSectionIdx = isPagesPhase && generating
    ? Math.min(sectionsLit, contentSections - 1)
    : -1;

  function contentStatusFn(idx: number): BlockStatus {
    if (!isPagesPhase) return 'idle';
    if (idx < sectionsLit) return 'complete';
    if (idx === activeSectionIdx) return 'active';
    return 'idle';
  }

  const isIndeterminate = isComponentsPhase;
  const totalSteps = total + 1;
  const completedSteps = (isPagesPhase ? 1 : 0) + completed;
  const percent = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

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

  if (!showWireframe) {
    // Non-wireframe phases: blueprint planning / approval — centered spinner
    return (
      <>
        <ProgressRing size={48} strokeWidth={3} percent={0} indeterminate />
        <div className="flex flex-col items-center gap-0.5">
          <p className="text-sm font-medium text-foreground">{headline}</p>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </>
    );
  }

  return (
    <WireframeVisual
      headerStatus={headerStatus}
      footerStatus={footerStatus}
      contentStatusFn={contentStatusFn}
      percent={percent}
      indeterminate={isIndeterminate}
      headline={headline}
      subtitle={subtitle}
      palette={palette}
      device={device}
    />
  );
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------
export function PreviewEmptyState({ isGenerating, buildProgress, blueprintPhase, pageStatuses, device, blueprintPalette }: PreviewEmptyStateProps) {
  if (isGenerating) {
    const isBlueprintActive = blueprintPhase && blueprintPhase !== 'idle' && blueprintPhase !== 'complete' && blueprintPhase !== 'error';

    if (isBlueprintActive) {
      return <BlueprintWireframe blueprintPhase={blueprintPhase} pageStatuses={pageStatuses} device={device} palette={blueprintPalette} />;
    }

    return <SinglePageWireframe buildProgress={buildProgress} device={device} />;
  }

  return (
    <>
      <Globe className="size-12 opacity-30" />
      <p className="text-sm">Enter a prompt to generate your website</p>
    </>
  );
}
