import type { PlatformAdapter, AccessibilityElement } from '../adapters/PlatformAdapter.js'
import type { FlowDefinition, FlowStep, FlowStepResult, FlowResult } from './flowTypes.js'
import type { Issue } from '../report/reportWriter.js'

const STEP_SETTLE_MS = 300

const SWIPE_DIRECTIONS: Record<string, { dx: number; dy: number }> = {
  up: { dx: 0, dy: -300 },
  down: { dx: 0, dy: 300 },
  left: { dx: -300, dy: 0 },
  right: { dx: 300, dy: 0 },
}

export async function runFlow(
  adapter: PlatformAdapter,
  flow: FlowDefinition,
): Promise<FlowResult> {
  const issues: Issue[] = []
  const stepResults: FlowStepResult[] = []
  const flowStart = Date.now()

  for (const step of flow.steps) {
    const stepStart = Date.now()
    try {
      await executeStep(adapter, step)
      stepResults.push({ step, success: true, durationMs: Date.now() - stepStart })
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      stepResults.push({ step, success: false, error, durationMs: Date.now() - stepStart })
      issues.push({
        severity: 'error',
        category: 'Flow Assertion',
        message: `Step failed in flow "${flow.name}": ${error}`,
        suggestedFix: formatStepHint(step),
      })
      break // Stop on first failure
    }
    await settle()
  }

  const success = stepResults.every((r) => r.success)
  return {
    flowName: flow.name,
    success,
    steps: stepResults,
    issues,
    durationMs: Date.now() - flowStart,
  }
}

async function executeStep(adapter: PlatformAdapter, step: FlowStep): Promise<void> {
  if ('tap' in step) {
    if (step.tap.element) {
      await adapter.tapElement(step.tap.element)
    } else if (step.tap.x !== undefined && step.tap.y !== undefined) {
      await adapter.tap({ x: step.tap.x, y: step.tap.y })
    } else {
      throw new Error('tap step requires either "element" or both "x" and "y"')
    }
    return
  }

  if ('type' in step) {
    await adapter.typeText(step.type.text)
    return
  }

  if ('press' in step) {
    await adapter.pressKey(step.press.key)
    return
  }

  if ('swipe' in step) {
    const { direction, startX, startY, endX, endY } = step.swipe
    if (startX !== undefined && startY !== undefined && endX !== undefined && endY !== undefined) {
      await adapter.swipe({ x: startX, y: startY }, { x: endX, y: endY })
    } else if (direction) {
      const dir = SWIPE_DIRECTIONS[direction]
      if (!dir) throw new Error(`Unknown swipe direction: "${direction}"`)
      // Default center-screen origin
      const cx = 200
      const cy = 400
      await adapter.swipe({ x: cx, y: cy }, { x: cx + dir.dx, y: cy + dir.dy })
    } else {
      throw new Error('swipe step requires either "direction" or explicit coordinates')
    }
    return
  }

  if ('assert' in step) {
    if (step.assert.visible) {
      const tree = await adapter.accessibilityTree()
      const found = findElementByName(tree.elements, step.assert.visible)
      if (!found) {
        throw new Error(`Assertion failed: element "${step.assert.visible}" not visible`)
      }
    }
    return
  }
}

function findElementByName(elements: AccessibilityElement[], name: string): AccessibilityElement | undefined {
  for (const el of elements) {
    if (el.name === name) return el
    if (el.children) {
      const found = findElementByName(el.children, name)
      if (found) return found
    }
  }
  return undefined
}

function formatStepHint(step: FlowStep): string {
  if ('tap' in step) {
    return step.tap.element
      ? `Verify element "${step.tap.element}" exists in the accessibility tree`
      : `Verify coordinates (${step.tap.x}, ${step.tap.y}) are within screen bounds`
  }
  if ('type' in step) return 'Ensure a text field is focused before typing'
  if ('press' in step) return `Verify key "${step.press.key}" is valid`
  if ('swipe' in step) return 'Check swipe coordinates or direction'
  if ('assert' in step) return `Verify element "${step.assert.visible}" is rendered on screen`
  return 'Check step configuration'
}

function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, STEP_SETTLE_MS))
}
