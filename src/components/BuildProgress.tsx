'use client'

import { useEffect, useRef } from 'react'
import { Loader2, Check, Circle, Globe, Image, Palette, Code, Search, ShieldCheck, FileText, Pencil, AlertTriangle } from 'lucide-react'
import type { BuildProgressState } from '@/hooks/useBuildProgress'
import type { ToolActivityEvent } from '@/types/build-progress'

interface BuildProgressProps {
  progress: BuildProgressState
}

interface Step {
  label: string
  /** Step completes when percent reaches this threshold */
  threshold: number
}

// Steps with percent thresholds matching char-count-based progress
const STEPS: Step[] = [
  { label: 'Understanding', threshold: 5 },
  { label: 'Design system', threshold: 20 },
  { label: 'Page structure', threshold: 40 },
  { label: 'Content', threshold: 80 },
  { label: 'Finalizing', threshold: 100 },
]

const TOOL_ICONS: Record<string, typeof Globe> = {
  webSearch: Globe,
  fetchUrl: Globe,
  searchImages: Image,
  searchIcons: Search,
  generateColorPalette: Palette,
  writeFiles: Code,
  editFile: Pencil,
  readFile: FileText,
  validateHtml: ShieldCheck,
}

function getStepStatus(step: Step, stepIndex: number, percent: number): 'done' | 'active' | 'pending' {
  if (percent >= step.threshold) return 'done'
  const prevThreshold = stepIndex > 0 ? STEPS[stepIndex - 1].threshold : 0
  if (percent >= prevThreshold) return 'active'
  return 'pending'
}

function ToolActivityLog({ activities }: { activities: ToolActivityEvent[] }) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [activities])

  if (activities.length === 0) return null

  return (
    <div
      ref={scrollRef}
      className="mt-1 flex max-h-28 flex-col gap-0.5 overflow-y-auto rounded-md bg-muted/50 px-2 py-1.5"
    >
      {activities.map((activity) => {
        const Icon = TOOL_ICONS[activity.toolName] ?? Code
        return (
          <div key={activity.toolCallId} className="flex items-start gap-1.5 text-[11px] leading-tight">
            {activity.status === 'running' && (
              <Loader2 className="mt-px size-3 shrink-0 animate-spin text-muted-foreground" />
            )}
            {activity.status === 'done' && (
              <Check className="mt-px size-3 shrink-0 text-primary" />
            )}
            {activity.status === 'error' && (
              <AlertTriangle className="mt-px size-3 shrink-0 text-destructive" />
            )}
            <Icon className="mt-px size-3 shrink-0 text-muted-foreground" />
            <span className={
              activity.status === 'error'
                ? 'text-destructive'
                : activity.status === 'running'
                  ? 'text-foreground'
                  : 'text-muted-foreground'
            }>
              <span className="font-medium">{activity.label}</span>
              {activity.detail && (
                <span className="ml-1 opacity-70">{activity.detail}</span>
              )}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export function BuildProgress({ progress }: BuildProgressProps) {
  if (!progress.isActive) return null

  return (
    <div className="flex gap-3 px-4 py-3">
      <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted">
        <Loader2 className="size-3.5 animate-spin text-primary" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {/* Current phase label */}
        <span className="text-sm text-foreground">{progress.label}</span>

        {/* Progress bar */}
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
            style={{ width: `${progress.percent}%` }}
          />
        </div>

        {/* Step checklist */}
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {STEPS.map((step, i) => {
            const status = getStepStatus(step, i, progress.percent)
            return (
              <div key={step.label} className="flex items-center gap-1">
                {status === 'done' && (
                  <Check className="size-3 text-primary" />
                )}
                {status === 'active' && (
                  <Loader2 className="size-3 animate-spin text-primary" />
                )}
                {status === 'pending' && (
                  <Circle className="size-3 text-muted-foreground/40" />
                )}
                <span className={`text-xs ${
                  status === 'done' ? 'text-muted-foreground' :
                  status === 'active' ? 'text-foreground' :
                  'text-muted-foreground/40'
                }`}>
                  {step.label}
                </span>
              </div>
            )
          })}
        </div>

        {/* Tool activity log */}
        <ToolActivityLog activities={progress.toolActivities} />
      </div>
    </div>
  )
}
