import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PlatformAdapter, EnvironmentReport, Point, DeviceInfo, BootResult, AccessibilityTree, AccessibilityElement, LogStreamOptions } from '../adapters/PlatformAdapter.js'
import type { FrameworkAdapter } from '../adapters/FrameworkAdapter.js'
import { analyzeLogLines, runTestLoop } from '../loop/testLoop.js'

const MOCK_DEVICE_INFO: DeviceInfo = {
  udid: 'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE',
  name: 'iPhone 17 Pro',
  width: 402,
  height: 874,
}

const MOCK_A11Y_TREE: AccessibilityTree = {
  elements: [{ type: 'Button', name: 'OK', frame: { x: 0, y: 0, width: 100, height: 50 } }],
  raw: '[]',
}

const MOCK_ELEMENT: AccessibilityElement = { type: 'Button', name: 'OK', frame: { x: 0, y: 0, width: 100, height: 50 } }

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

function createMockFramework(): FrameworkAdapter {
  return {
    getBundleId: vi.fn().mockReturnValue('com.example.app'),
    build: vi.fn<() => Promise<string>>().mockResolvedValue('/path/to/app.app'),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('analyzeLogLines', () => {
  it('detects red screen errors', () => {
    const lines = ['app started', 'Red Screen: something went wrong', 'more logs']
    const issues = analyzeLogLines(lines)
    expect(issues).toHaveLength(1)
    expect(issues[0].category).toBe('Red Screen')
    expect(issues[0].severity).toBe('error')
  })

  it('detects fatal exception', () => {
    const lines = ['loading', 'Fatal Exception: null pointer', 'bye']
    const issues = analyzeLogLines(lines)
    expect(issues).toHaveLength(1)
    expect(issues[0].category).toBe('Fatal Exception')
  })

  it('detects unhandled promise rejection', () => {
    const lines = ['Unhandled promise rejection: network error']
    const issues = analyzeLogLines(lines)
    expect(issues).toHaveLength(1)
    expect(issues[0].category).toBe('Unhandled Promise Rejection')
  })

  it('deduplicates by category + message prefix', () => {
    const lines = [
      'Invariant Violation: expected X',
      'other log',
      'Invariant Violation: expected X',
    ]
    const issues = analyzeLogLines(lines)
    expect(issues).toHaveLength(1)
  })

  it('returns empty for clean logs', () => {
    const lines = ['app loaded', 'view rendered', 'data fetched']
    const issues = analyzeLogLines(lines)
    expect(issues).toHaveLength(0)
  })

  it('extracts ±3 lines context', () => {
    const lines = ['line0', 'line1', 'line2', 'line3', 'SIGABRT received', 'line5', 'line6', 'line7', 'line8']
    const issues = analyzeLogLines(lines)
    expect(issues).toHaveLength(1)
    expect(issues[0].logExcerpt).toHaveLength(7) // 3 before + match + 3 after
    expect(issues[0].logExcerpt![0]).toBe('line1')
    expect(issues[0].logExcerpt![6]).toBe('line7')
  })

  it('detects EXC_BAD_ACCESS', () => {
    const lines = ['EXC_BAD_ACCESS (code=1)']
    const issues = analyzeLogLines(lines)
    expect(issues).toHaveLength(1)
    expect(issues[0].category).toBe('EXC_BAD_ACCESS')
  })

  it('detects crash keyword', () => {
    const lines = ['Application crashed unexpectedly']
    const issues = analyzeLogLines(lines)
    expect(issues).toHaveLength(1)
    expect(issues[0].category).toBe('Crash')
  })
})

describe('runTestLoop', () => {
  it('calls adapter methods in correct order', async () => {
    const adapter = createMockAdapter()
    const framework = createMockFramework()
    const callOrder: string[] = []

    vi.mocked(adapter.boot).mockImplementation(async () => { callOrder.push('boot'); return MOCK_DEVICE_INFO })
    vi.mocked(framework.build).mockImplementation(async () => { callOrder.push('build'); return '/app.app' })
    vi.mocked(adapter.install).mockImplementation(async () => { callOrder.push('install') })
    vi.mocked(adapter.launch).mockImplementation(async () => { callOrder.push('launch') })
    vi.mocked(adapter.screenshot).mockImplementation(async () => { callOrder.push('screenshot'); return { data: 'x', mimeType: 'image/png' } })
    vi.mocked(adapter.logStream).mockImplementation(async () => { callOrder.push('logStream'); return { stop: vi.fn() } })

    await runTestLoop({ adapter, framework, logDurationMs: 10 })

    expect(callOrder).toEqual(['boot', 'build', 'install', 'launch', 'screenshot', 'logStream'])
  })

  it('uses device name from DeviceInfo in report', async () => {
    const adapter = createMockAdapter()
    const framework = createMockFramework()

    const result = await runTestLoop({ adapter, framework, logDurationMs: 10 })

    expect(result.report.device).toBe('iPhone 17 Pro')
  })

  it('calls teardown on success', async () => {
    const adapter = createMockAdapter()
    const framework = createMockFramework()

    await runTestLoop({ adapter, framework, logDurationMs: 10 })

    expect(adapter.teardown).toHaveBeenCalledOnce()
  })

  it('calls teardown on failure', async () => {
    const adapter = createMockAdapter()
    const framework = createMockFramework()
    vi.mocked(framework.build).mockRejectedValue(new Error('Build failed'))

    await expect(runTestLoop({ adapter, framework, logDurationMs: 10 })).rejects.toThrow('Build failed')
    expect(adapter.teardown).toHaveBeenCalledOnce()
  })
})
