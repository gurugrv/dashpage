'use client'

import { useState, useCallback, useRef } from 'react'
import type { BuildPhase, BuildProgressData, ToolActivityEvent } from '@/types/build-progress'

export interface BuildProgressState {
  isActive: boolean
  phase: BuildPhase
  label: string
  percent: number
  file: string
  toolActivities: ToolActivityEvent[]
}

const INITIAL_STATE: BuildProgressState = {
  isActive: false,
  phase: 'explaining',
  label: '',
  percent: 0,
  file: 'index.html',
  toolActivities: [],
}

export function useBuildProgress() {
  const [progress, setProgress] = useState<BuildProgressState>(INITIAL_STATE)
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleProgressData = useCallback((data: BuildProgressData) => {
    // Clear any pending auto-clear timer
    if (clearTimerRef.current) {
      clearTimeout(clearTimerRef.current)
      clearTimerRef.current = null
    }

    setProgress((prev) => ({
      ...prev,
      isActive: true,
      phase: data.phase,
      label: data.label,
      percent: data.percent,
      file: data.file,
      // Clear activities on complete
      toolActivities: data.phase === 'complete' ? [] : prev.toolActivities,
    }))

    // Auto-clear 1.5s after "complete"
    if (data.phase === 'complete') {
      clearTimerRef.current = setTimeout(() => {
        setProgress(INITIAL_STATE)
        clearTimerRef.current = null
      }, 1500)
    }
  }, [])

  const handleToolActivity = useCallback((event: ToolActivityEvent) => {
    const MAX_TOOL_ACTIVITIES = 50
    setProgress((prev) => {
      const next = [...prev.toolActivities]
      const idx = next.findIndex((a) => a.toolCallId === event.toolCallId)
      if (idx >= 0) {
        next[idx] = event
      } else {
        next.push(event)
      }
      if (next.length > MAX_TOOL_ACTIVITIES) next.splice(0, next.length - MAX_TOOL_ACTIVITIES)
      return { ...prev, toolActivities: next }
    })
  }, [])

  const resetProgress = useCallback(() => {
    if (clearTimerRef.current) {
      clearTimeout(clearTimerRef.current)
      clearTimerRef.current = null
    }
    setProgress(INITIAL_STATE)
  }, [])

  return { progress, handleProgressData, handleToolActivity, resetProgress }
}
