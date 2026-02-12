import type { BuildPhase, BuildProgressData } from '@/types/build-progress'

interface Landmark {
  pattern: RegExp
  phase: BuildPhase
  label: string
}

// Landmarks provide labels only - percent comes from character count
const HTML_LANDMARKS: Landmark[] = [
  { pattern: /<head[\s>]/i, phase: 'head', label: 'Setting up document...' },
  { pattern: /<style[\s>]|tailwind/i, phase: 'styles', label: 'Defining design system...' },
  { pattern: /<body[\s>]/i, phase: 'body-started', label: 'Building page structure...' },
  { pattern: /<nav[\s>]|<header[\s>]/i, phase: 'navigation', label: 'Creating navigation...' },
  { pattern: /<footer[\s>]/i, phase: 'footer', label: 'Adding footer...' },
  { pattern: /<script[\s>](?!.*tailwind|.*cdn)/i, phase: 'scripts', label: 'Adding interactivity...' },
  { pattern: /<\/htmlOutput>/i, phase: 'html-complete', label: 'Finalizing...' },
]

const SECTION_COMMENT = /<!--\s*SECTION:\s*(.+?)\s*-->/i
const SECTION_TAG = /<section[\s>]/i

// Typical HTML page is 6000-15000 chars. Start conservative, grow if exceeded.
const INITIAL_ESTIMATED_SIZE = 8000
const INITIAL_EDIT_ESTIMATED_SIZE = 1600
// Minimum percent jump to emit an update (avoids flooding)
const MIN_PERCENT_STEP = 3

export class BuildProgressDetector {
  private buffer = ''
  private currentPhase: BuildPhase = 'explaining'
  private currentLabel = 'Understanding your request...'
  private lastEmittedPercent = 0
  private matchedPhases = new Set<BuildPhase>()
  private file: string
  private totalChars = 0
  private htmlStarted = false
  private editMode = false
  private charsSinceHtmlStart = 0
  private charsSinceEditStart = 0
  private estimatedSize = INITIAL_ESTIMATED_SIZE
  private editEstimatedSize = INITIAL_EDIT_ESTIMATED_SIZE
  private emittedExplaining = false

  constructor(file = 'index.html') {
    this.file = file
  }

  processDelta(delta: string): BuildProgressData | null {
    this.buffer += delta
    this.totalChars += delta.length

    // Keep buffer manageable
    if (this.buffer.length > 2000) {
      this.buffer = this.buffer.slice(-1000)
    }

    // Detect <editOperations> or <htmlOutput> start
    if (!this.htmlStarted && !this.editMode) {
      const recent = this.buffer.slice(-200)
      if (/<editOperations>/i.test(delta) || /<editOperations>/i.test(recent)) {
        this.editMode = true
        this.currentPhase = 'edit-started'
        this.currentLabel = 'Understanding your request...'
        this.lastEmittedPercent = 5
        return this.makeData('edit-started', 'Understanding your request...', 5)
      }
      if (/<htmlOutput>/i.test(delta) || /<htmlOutput>/i.test(recent)) {
        this.htmlStarted = true
        this.currentPhase = 'html-started'
        this.currentLabel = 'Starting generation...'
        this.lastEmittedPercent = 5
        return this.makeData('html-started', 'Starting generation...', 5)
      }
      // Emit "explaining" once after some text arrives
      if (!this.emittedExplaining && this.totalChars > 20) {
        this.emittedExplaining = true
        this.lastEmittedPercent = 2
        return this.makeData('explaining', 'Understanding your request...', 2)
      }
      return null
    }

    // Edit mode: keep the same step progression as full generation
    if (this.editMode) {
      if (/<\/editOperations>/i.test(delta) || /<\/editOperations>/i.test(this.buffer.slice(-200))) {
        this.lastEmittedPercent = 95
        return this.makeData('edit-complete', 'Finalizing...', 95)
      }

      this.charsSinceEditStart += delta.length
      if (this.charsSinceEditStart > this.editEstimatedSize * 0.85) {
        this.editEstimatedSize = Math.round(this.charsSinceEditStart * 1.4)
      }

      const ratio = this.charsSinceEditStart / this.editEstimatedSize
      const percent = Math.min(90, Math.round(5 + ratio * 85))
      const label = this.getStepLabel(percent)

      if (percent > this.lastEmittedPercent + MIN_PERCENT_STEP) {
        this.lastEmittedPercent = percent
        return this.makeData('edit-applying', label, percent)
      }
      return null
    }

    // Track HTML chars for percent calculation
    this.charsSinceHtmlStart += delta.length

    // Grow estimate if we exceed it (so bar doesn't stall at 95%)
    if (this.charsSinceHtmlStart > this.estimatedSize * 0.85) {
      this.estimatedSize = Math.round(this.charsSinceHtmlStart * 1.4)
    }

    // Calculate percent from char ratio (5% → 95% range)
    const ratio = this.charsSinceHtmlStart / this.estimatedSize
    const percent = Math.min(95, Math.round(5 + ratio * 90))

    // Detect landmarks for label updates (don't use for percent)
    this.detectLandmark(delta)

    // Only emit if percent changed enough
    if (percent < this.lastEmittedPercent + MIN_PERCENT_STEP) return null

    this.lastEmittedPercent = percent
    return this.makeData(this.currentPhase, this.currentLabel, percent)
  }

  finish(): BuildProgressData {
    return this.makeData('complete', 'Done!', 100)
  }

  private detectLandmark(delta: string): void {
    // Check section comments for rich labels
    const sectionMatch = delta.match(SECTION_COMMENT)
    if (sectionMatch) {
      this.currentPhase = 'content'
      this.currentLabel = `Building ${sectionMatch[1].trim()}...`
      return
    }

    // Check section tags
    if (SECTION_TAG.test(delta)) {
      this.currentPhase = 'content'
      this.currentLabel = 'Building content sections...'
      return
    }

    // Check structural landmarks
    const recent = this.buffer.slice(-200)
    for (const landmark of HTML_LANDMARKS) {
      if (this.matchedPhases.has(landmark.phase)) continue
      if (landmark.pattern.test(delta) || landmark.pattern.test(recent)) {
        this.matchedPhases.add(landmark.phase)
        this.currentPhase = landmark.phase
        this.currentLabel = landmark.label
        return
      }
    }
  }

  private makeData(phase: BuildPhase, label: string, percent: number): BuildProgressData {
    return { phase, label, file: this.file, percent, timestamp: Date.now() }
  }

  private getStepLabel(percent: number): string {
    if (percent >= 95) return 'Finalizing...'
    if (percent >= 80) return 'Building content...'
    if (percent >= 40) return 'Building page structure...'
    if (percent >= 20) return 'Defining design system...'
    return 'Understanding your request...'
  }
}
