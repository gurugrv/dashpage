'use client'

import { useState, useCallback, useRef } from 'react'
import type { BuildPhase, BuildProgressData } from '@/types/build-progress'

export interface BuildProgressState {
  isActive: boolean
  phase: BuildPhase
  label: string
  percent: number
  file: string
}

const INITIAL_STATE: BuildProgressState = {
  isActive: false,
  phase: 'explaining',
  label: '',
  percent: 0,
  file: 'index.html',
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

    setProgress({
      isActive: true,
      phase: data.phase,
      label: data.label,
      percent: data.percent,
      file: data.file,
    })

    // Auto-clear 1.5s after "complete"
    if (data.phase === 'complete') {
      clearTimerRef.current = setTimeout(() => {
        setProgress(INITIAL_STATE)
        clearTimerRef.current = null
      }, 1500)
    }
  }, [])

  const resetProgress = useCallback(() => {
    if (clearTimerRef.current) {
      clearTimeout(clearTimerRef.current)
      clearTimerRef.current = null
    }
    setProgress(INITIAL_STATE)
  }, [])

  return { progress, handleProgressData, resetProgress }
}
