'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, Check, Circle, Globe, Image, Code, Search, FileText, Pencil, AlertTriangle } from 'lucide-react'
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

// Steps with percent thresholds matching tool-aware progress milestones
const GENERATE_STEPS: Step[] = [
  { label: 'Planning', threshold: 8 },
  { label: 'Design & assets', threshold: 30 },
  { label: 'Generating', threshold: 80 },
  { label: 'Finalizing', threshold: 100 },
]

const EDIT_STEPS: Step[] = [
  { label: 'Analyzing', threshold: 15 },
  { label: 'Applying edits', threshold: 80 },
  { label: 'Finalizing', threshold: 100 },
]

const TOOL_ICONS: Record<string, typeof Globe> = {
  webSearch: Globe,
  fetchUrl: Globe,
  searchImages: Image,
  searchIcons: Search,
  writeFiles: Code,
  editFile: Pencil,
  readFile: FileText,
}

function getStepStatus(step: Step, stepIndex: number, percent: number, steps: Step[]): 'done' | 'active' | 'pending' {
  if (percent >= step.threshold) return 'done'
  const prevThreshold = stepIndex > 0 ? steps[stepIndex - 1].threshold : 0
  if (percent >= prevThreshold) return 'active'
  return 'pending'
}

function isEditPhase(phase: string): boolean {
  return phase.startsWith('edit-')
}

function ToolActivityLog({ activities }: { activities: ToolActivityEvent[] }) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [activities])

  if (activities.length === 0) return null

  // Deduplicate by toolName: show one entry per tool, prefer 'running' > 'error' > 'done'
  const statusPriority = { running: 0, error: 1, done: 2 }
  const deduped = Array.from(
    activities.reduce((map, a) => {
      const existing = map.get(a.toolName)
      if (!existing || statusPriority[a.status] < statusPriority[existing.status]) {
        map.set(a.toolName, a)
      }
      return map
    }, new Map<string, ToolActivityEvent>()).values()
  )

  return (
    <div
      ref={scrollRef}
      className="mt-1 flex max-h-28 flex-col gap-0.5 overflow-y-auto rounded-md bg-muted/50 px-2 py-1.5"
    >
      {deduped.map((activity, idx) => {
        const Icon = TOOL_ICONS[activity.toolName] ?? Code
        return (
          <div
            key={activity.toolCallId}
            className="flex items-start gap-1.5 text-[11px] leading-tight"
            style={{
              animation: 'fadeSlideIn 0.25s ease-out both',
              animationDelay: `${idx * 30}ms`,
            }}
          >
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
              <span className="tabular-nums opacity-50">{new Date(activity.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
              <span className="ml-1.5 font-medium">{activity.label}</span>
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

function ElapsedTimer() {
  const [seconds, setSeconds] = useState(0)
  const startRef = useRef(Date.now())

  useEffect(() => {
    const id = setInterval(() => {
      setSeconds(Math.floor((Date.now() - startRef.current) / 1000))
    }, 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <span className="ml-1.5 text-xs tabular-nums text-muted-foreground">{seconds}s</span>
  )
}

export function BuildProgress({ progress }: BuildProgressProps) {
  const wasEditRef = useRef(false)

  // Track if we entered edit mode at any point during this build
  if (isEditPhase(progress.phase)) wasEditRef.current = true
  if (!progress.isActive) {
    wasEditRef.current = false
    return null
  }

  const isEdit = wasEditRef.current
  const steps = isEdit ? EDIT_STEPS : GENERATE_STEPS

  return (
    <div className="flex gap-3 px-4 py-3">
      <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted">
        <Loader2 className="size-3.5 animate-spin text-primary" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {/* Current phase label + elapsed timer */}
        <span className="flex items-center text-sm text-foreground">
          {progress.label}
          <ElapsedTimer />
        </span>

        {/* Progress bar with shimmer */}
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="relative h-full overflow-hidden rounded-full bg-primary transition-all duration-500 ease-out"
            style={{ width: `${progress.percent}%` }}
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

        {/* Step checklist */}
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {steps.map((step, i) => {
            const status = getStepStatus(step, i, progress.percent, steps)
            return (
              <div key={step.label} className="flex items-center gap-1">
                {status === 'done' && (
                  <Check
                    className="size-3 text-primary transition-transform duration-200"
                    style={{ animation: 'fadeSlideIn 0.2s ease-out' }}
                  />
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
