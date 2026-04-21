import { readFileSync } from 'node:fs'
import { parseSimpleYaml } from './yamlParser.js'
import { validateFlowName, safeResolvePath } from '../validation.js'
import { ScoutValidationError } from '../errors.js'
import type { FlowDefinition, FlowStep } from './flowTypes.js'

const VALID_STEP_KEYS = new Set(['tap', 'type', 'press', 'swipe', 'assert'])

export function loadFlows(flowsPath: string, projectRoot: string): FlowDefinition[] {
  const resolved = safeResolvePath(projectRoot, flowsPath)
  const content = readFileSync(resolved, 'utf-8')
  const parsed = parseSimpleYaml(content)

  if (!isObject(parsed) || !Array.isArray(parsed.flows)) {
    throw new ScoutValidationError('flows.yaml must have a top-level "flows" array')
  }

  const flows: FlowDefinition[] = []
  for (const entry of parsed.flows) {
    flows.push(parseFlowEntry(entry))
  }
  return flows
}

export function findFlow(flows: FlowDefinition[], name: string): FlowDefinition {
  validateFlowName(name)
  const flow = flows.find((f) => f.name === name)
  if (!flow) {
    throw new ScoutValidationError(`Flow not found: "${name}"`)
  }
  return flow
}

function parseFlowEntry(entry: unknown): FlowDefinition {
  if (!isObject(entry)) {
    throw new ScoutValidationError('Each flow must be an object with "name" and "steps"')
  }

  const name = entry.name
  if (typeof name !== 'string' || name.length === 0) {
    throw new ScoutValidationError('Each flow must have a string "name"')
  }
  validateFlowName(name)

  const steps = entry.steps
  if (!Array.isArray(steps)) {
    throw new ScoutValidationError(`Flow "${name}" must have a "steps" array`)
  }

  const parsed: FlowStep[] = []
  for (const step of steps) {
    parsed.push(parseStep(name, step))
  }
  return { name, steps: parsed }
}

function parseStep(flowName: string, step: unknown): FlowStep {
  if (!isObject(step)) {
    throw new ScoutValidationError(`Invalid step in flow "${flowName}": must be an object`)
  }

  const keys = Object.keys(step).filter((k) => VALID_STEP_KEYS.has(k))
  if (keys.length === 0) {
    throw new ScoutValidationError(
      `Invalid step in flow "${flowName}": must have one of ${[...VALID_STEP_KEYS].join(', ')}`,
    )
  }
  if (keys.length > 1) {
    throw new ScoutValidationError(
      `Invalid step in flow "${flowName}": must have exactly one action, got ${keys.join(', ')}`,
    )
  }

  const key = keys[0]
  const value = step[key]

  switch (key) {
    case 'tap': {
      if (!isObject(value)) throw new ScoutValidationError(`Invalid tap step in flow "${flowName}"`)
      return { tap: { element: asOptString(value.element), x: asOptNumber(value.x), y: asOptNumber(value.y) } }
    }
    case 'type': {
      if (!isObject(value)) throw new ScoutValidationError(`Invalid type step in flow "${flowName}"`)
      if (typeof value.text !== 'string') throw new ScoutValidationError(`type step requires "text" in flow "${flowName}"`)
      return { type: { text: value.text } }
    }
    case 'press': {
      if (!isObject(value)) throw new ScoutValidationError(`Invalid press step in flow "${flowName}"`)
      if (typeof value.key !== 'string') throw new ScoutValidationError(`press step requires "key" in flow "${flowName}"`)
      return { press: { key: value.key } }
    }
    case 'swipe': {
      if (!isObject(value)) throw new ScoutValidationError(`Invalid swipe step in flow "${flowName}"`)
      return {
        swipe: {
          direction: asOptString(value.direction),
          startX: asOptNumber(value.startX),
          startY: asOptNumber(value.startY),
          endX: asOptNumber(value.endX),
          endY: asOptNumber(value.endY),
        },
      }
    }
    case 'assert': {
      if (!isObject(value)) throw new ScoutValidationError(`Invalid assert step in flow "${flowName}"`)
      return { assert: { visible: asOptString(value.visible) } }
    }
    default:
      throw new ScoutValidationError(`Unknown step type "${key}" in flow "${flowName}"`)
  }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function asOptString(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined
}

function asOptNumber(v: unknown): number | undefined {
  return typeof v === 'number' ? v : undefined
}
