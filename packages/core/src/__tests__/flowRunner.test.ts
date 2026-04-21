import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PlatformAdapter, EnvironmentReport, Point, DeviceInfo, BootResult, AccessibilityTree, AccessibilityElement, LogStreamOptions } from '../adapters/PlatformAdapter.js'
import { runFlow } from '../loop/flowRunner.js'
import type { FlowDefinition } from '../loop/flowTypes.js'

const MOCK_DEVICE_INFO: DeviceInfo = {
  udid: 'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE',
  name: 'iPhone 17 Pro',
  width: 402,
  height: 874,
}

const MOCK_A11Y_TREE: AccessibilityTree = {
  elements: [
    {
      type: 'Button',
      name: 'Submit',
      frame: { x: 50, y: 100, width: 100, height: 44 },
    },
    {
      type: 'StaticText',
      name: 'Welcome',
      frame: { x: 0, y: 0, width: 300, height: 30 },
    },
  ],
  raw: '[]',
}

const MOCK_ELEMENT: AccessibilityElement = {
  type: 'Button',
  name: 'Submit',
  frame: { x: 50, y: 100, width: 100, height: 44 },
}

function createMockAdapter(): PlatformAdapter {
  return {
    checkEnvironment: vi.fn<() => Promise<EnvironmentReport>>().mockResolvedValue({ ok: true, checks: [] }),
    boot: vi.fn<(device?: string) => Promise<BootResult>>().mockResolvedValue(MOCK_DEVICE_INFO),
    install: vi.fn<(appPath: string) => Promise<void>>().mockResolvedValue(undefined),
    launch: vi.fn<(bundleId: string) => Promise<void>>().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue({ data: 'base64png', mimeType: 'image/png' }),
    tap: vi.fn<(point: Point) => Promise<void>>().mockResolvedValue(undefined),
    swipe: vi.fn<(from: Point, to: Point) => Promise<void>>().mockResolvedValue(undefined),
    logStream: vi.fn().mockResolvedValue({ stop: vi.fn() }),
    typeText: vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined),
    pressKey: vi.fn<(key: string) => Promise<void>>().mockResolvedValue(undefined),
    clearText: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    tapElement: vi.fn<(label: string) => Promise<{ element: AccessibilityElement }>>().mockResolvedValue({ element: MOCK_ELEMENT }),
    accessibilityTree: vi.fn<() => Promise<AccessibilityTree>>().mockResolvedValue(MOCK_A11Y_TREE),
    teardown: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('runFlow', () => {
  it('executes tap by element', async () => {
    const adapter = createMockAdapter()
    const flow: FlowDefinition = {
      name: 'test',
      steps: [{ tap: { element: 'Submit' } }],
    }

    const result = await runFlow(adapter, flow)

    expect(result.success).toBe(true)
    expect(adapter.tapElement).toHaveBeenCalledWith('Submit')
    expect(result.steps).toHaveLength(1)
    expect(result.steps[0].success).toBe(true)
  })

  it('executes tap by coordinates', async () => {
    const adapter = createMockAdapter()
    const flow: FlowDefinition = {
      name: 'test',
      steps: [{ tap: { x: 100, y: 200 } }],
    }

    const result = await runFlow(adapter, flow)

    expect(result.success).toBe(true)
    expect(adapter.tap).toHaveBeenCalledWith({ x: 100, y: 200 })
  })

  it('executes type step', async () => {
    const adapter = createMockAdapter()
    const flow: FlowDefinition = {
      name: 'test',
      steps: [{ type: { text: 'hello' } }],
    }

    const result = await runFlow(adapter, flow)

    expect(result.success).toBe(true)
    expect(adapter.typeText).toHaveBeenCalledWith('hello')
  })

  it('executes press step', async () => {
    const adapter = createMockAdapter()
    const flow: FlowDefinition = {
      name: 'test',
      steps: [{ press: { key: 'return' } }],
    }

    const result = await runFlow(adapter, flow)

    expect(result.success).toBe(true)
    expect(adapter.pressKey).toHaveBeenCalledWith('return')
  })

  it('executes swipe with explicit coordinates', async () => {
    const adapter = createMockAdapter()
    const flow: FlowDefinition = {
      name: 'test',
      steps: [{ swipe: { startX: 100, startY: 400, endX: 100, endY: 100 } }],
    }

    const result = await runFlow(adapter, flow)

    expect(result.success).toBe(true)
    expect(adapter.swipe).toHaveBeenCalledWith({ x: 100, y: 400 }, { x: 100, y: 100 })
  })

  it('executes swipe with direction', async () => {
    const adapter = createMockAdapter()
    const flow: FlowDefinition = {
      name: 'test',
      steps: [{ swipe: { direction: 'up' } }],
    }

    const result = await runFlow(adapter, flow)

    expect(result.success).toBe(true)
    expect(adapter.swipe).toHaveBeenCalledOnce()
  })

  it('passes assert when element is visible', async () => {
    const adapter = createMockAdapter()
    const flow: FlowDefinition = {
      name: 'test',
      steps: [{ assert: { visible: 'Welcome' } }],
    }

    const result = await runFlow(adapter, flow)

    expect(result.success).toBe(true)
    expect(adapter.accessibilityTree).toHaveBeenCalledOnce()
  })

  it('fails assert when element is not visible', async () => {
    const adapter = createMockAdapter()
    const flow: FlowDefinition = {
      name: 'test',
      steps: [{ assert: { visible: 'NotHere' } }],
    }

    const result = await runFlow(adapter, flow)

    expect(result.success).toBe(false)
    expect(result.steps[0].success).toBe(false)
    expect(result.steps[0].error).toContain('NotHere')
    expect(result.issues).toHaveLength(1)
    expect(result.issues[0].category).toBe('Flow Assertion')
  })

  it('stops on first failure', async () => {
    const adapter = createMockAdapter()
    vi.mocked(adapter.tapElement).mockRejectedValue(new Error('Element not found'))

    const flow: FlowDefinition = {
      name: 'test',
      steps: [
        { tap: { element: 'Missing' } },
        { type: { text: 'should not run' } },
      ],
    }

    const result = await runFlow(adapter, flow)

    expect(result.success).toBe(false)
    expect(result.steps).toHaveLength(1)
    expect(adapter.typeText).not.toHaveBeenCalled()
  })

  it('runs multi-step flow successfully', async () => {
    const adapter = createMockAdapter()
    const flow: FlowDefinition = {
      name: 'login',
      steps: [
        { tap: { element: 'Submit' } },
        { type: { text: 'admin' } },
        { press: { key: 'return' } },
        { assert: { visible: 'Welcome' } },
      ],
    }

    const result = await runFlow(adapter, flow)

    expect(result.success).toBe(true)
    expect(result.steps).toHaveLength(4)
    expect(result.flowName).toBe('login')
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('records duration for each step', async () => {
    const adapter = createMockAdapter()
    const flow: FlowDefinition = {
      name: 'test',
      steps: [{ tap: { element: 'Submit' } }],
    }

    const result = await runFlow(adapter, flow)

    expect(result.steps[0].durationMs).toBeGreaterThanOrEqual(0)
  })

  it('includes suggested fix in issues', async () => {
    const adapter = createMockAdapter()
    vi.mocked(adapter.tapElement).mockRejectedValue(new Error('not found'))

    const flow: FlowDefinition = {
      name: 'test',
      steps: [{ tap: { element: 'Missing' } }],
    }

    const result = await runFlow(adapter, flow)

    expect(result.issues[0].suggestedFix).toContain('accessibility tree')
  })

  it('fails tap without element or coordinates', async () => {
    const adapter = createMockAdapter()
    const flow: FlowDefinition = {
      name: 'test',
      steps: [{ tap: {} }],
    }

    const result = await runFlow(adapter, flow)

    expect(result.success).toBe(false)
    expect(result.steps[0].error).toContain('element')
  })

  it('fails swipe with unknown direction', async () => {
    const adapter = createMockAdapter()
    const flow: FlowDefinition = {
      name: 'test',
      steps: [{ swipe: { direction: 'diagonal' } }],
    }

    const result = await runFlow(adapter, flow)

    expect(result.success).toBe(false)
    expect(result.steps[0].error).toContain('diagonal')
  })

  it('finds nested element for assert', async () => {
    const adapter = createMockAdapter()
    vi.mocked(adapter.accessibilityTree).mockResolvedValue({
      elements: [{
        type: 'View',
        name: 'Container',
        frame: { x: 0, y: 0, width: 400, height: 800 },
        children: [{
          type: 'StaticText',
          name: 'Nested',
          frame: { x: 10, y: 10, width: 100, height: 20 },
        }],
      }],
      raw: '[]',
    })

    const flow: FlowDefinition = {
      name: 'test',
      steps: [{ assert: { visible: 'Nested' } }],
    }

    const result = await runFlow(adapter, flow)

    expect(result.success).toBe(true)
  })

  it('records flow-level duration', async () => {
    const adapter = createMockAdapter()
    const flow: FlowDefinition = {
      name: 'test',
      steps: [
        { tap: { element: 'Submit' } },
        { type: { text: 'hi' } },
      ],
    }

    const result = await runFlow(adapter, flow)

    expect(result.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('returns empty issues on success', async () => {
    const adapter = createMockAdapter()
    const flow: FlowDefinition = {
      name: 'test',
      steps: [{ tap: { element: 'Submit' } }],
    }

    const result = await runFlow(adapter, flow)

    expect(result.issues).toHaveLength(0)
  })

  it('handles swipe without direction or coordinates', async () => {
    const adapter = createMockAdapter()
    const flow: FlowDefinition = {
      name: 'test',
      steps: [{ swipe: {} }],
    }

    const result = await runFlow(adapter, flow)

    expect(result.success).toBe(false)
    expect(result.steps[0].error).toContain('direction')
  })
})
