export type BuildPhase =
  | 'explaining'
  | 'html-started'
  | 'head'
  | 'styles'
  | 'body-started'
  | 'navigation'
  | 'content'
  | 'footer'
  | 'scripts'
  | 'html-complete'
  | 'fileArtifact-started'
  | 'fileArtifact-complete'
  | 'edit-started'
  | 'edit-applying'
  | 'edit-complete'
  | 'generating'
  | 'complete'

export interface BuildProgressData {
  phase: BuildPhase
  label: string
  file: string
  percent: number
  timestamp: number
}
