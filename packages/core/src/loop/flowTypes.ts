export interface FlowDefinition {
  name: string
  steps: FlowStep[]
}

export type FlowStep =
  | { tap: { element?: string; x?: number; y?: number } }
  | { type: { text: string } }
  | { press: { key: string } }
  | { swipe: { direction?: string; startX?: number; startY?: number; endX?: number; endY?: number } }
  | { assert: { visible?: string } }

export interface FlowStepResult {
  step: FlowStep
  success: boolean
  error?: string
  durationMs: number
}

export interface FlowResult {
  flowName: string
  success: boolean
  steps: FlowStepResult[]
  issues: Issue[]
  durationMs: number
}

// Re-export Issue from reportWriter so flow code doesn't need separate import
import type { Issue } from '../report/reportWriter.js'
export type { Issue }
