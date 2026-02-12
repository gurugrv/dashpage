'use client'

import { Loader2, Check, Circle } from 'lucide-react'
import type { BuildProgressState } from '@/hooks/useBuildProgress'

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

function getStepStatus(step: Step, stepIndex: number, percent: number): 'done' | 'active' | 'pending' {
  if (percent >= step.threshold) return 'done'
  const prevThreshold = stepIndex > 0 ? STEPS[stepIndex - 1].threshold : 0
  if (percent >= prevThreshold) return 'active'
  return 'pending'
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
      </div>
    </div>
  )
}
