import { describe, it, expect, vi, beforeEach } from 'vitest'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { createScoutServer } from '../server.js'
import type { PlatformAdapter, AdapterMeta } from '../adapters/PlatformAdapter.js'

/**
 * Build a stub PlatformAdapter. Methods are vi.fn() — the server tests only care
 * about tool *registration* (names + descriptions), not handler behavior.
 */
function makeAdapter(meta?: AdapterMeta): PlatformAdapter {
  const adapter: Partial<PlatformAdapter> = {
    checkEnvironment: vi.fn(),
    boot: vi.fn(),
    install: vi.fn(),
    launch: vi.fn(),
    screenshot: vi.fn(),
    tap: vi.fn(),
    swipe: vi.fn(),
    logStream: vi.fn(),
    typeText: vi.fn(),
    pressKey: vi.fn(),
    clearText: vi.fn(),
    tapElement: vi.fn(),
    accessibilityTree: vi.fn(),
    teardown: vi.fn(),
  }
  if (meta) {
    Object.defineProperty(adapter, 'meta', { value: meta, enumerable: true })
  }
  return adapter as PlatformAdapter
}

// Capture every tool registration: name -> description
function captureTools(): { calls: Array<{ name: string; description: string }>; restore: () => void } {
  const calls: Array<{ name: string; description: string }> = []
  const spy = vi
    .spyOn(McpServer.prototype, 'tool')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .mockImplementation(function (this: any, name: string, description: string) {
      calls.push({ name, description })
      // Return a minimal RegisteredTool-like object; server.ts ignores the return value
      return {} as any
    })
  return { calls, restore: () => spy.mockRestore() }
}

const IOS_META: AdapterMeta = {
  displayName: 'iOS Simulator',
  installArtifact: '.app bundle',
  gestureToolingNote: 'requires idb',
}

const ANDROID_META: AdapterMeta = {
  displayName: 'Android Emulator',
  installArtifact: '.apk',
  gestureToolingNote: '',
}

// The 13 dual-registered tools (canonical device_* + simulator_* alias)
const DUAL_TOOLS = [
  'boot',
  'screenshot',
  'install',
  'launch',
  'tap',
  'swipe',
  'log_stream',
  'type_text',
  'press_key',
  'clear_text',
  'tap_element',
  'accessibility_tree',
  'run_flow',
]

describe('createScoutServer tool registration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('registers scout_check_environment exactly once (no alias)', () => {
    const { calls, restore } = captureTools()
    createScoutServer(makeAdapter(IOS_META))
    restore()
    const envCalls = calls.filter((c) => c.name === 'scout_check_environment')
    expect(envCalls).toHaveLength(1)
  })

  it('registers both device_* canonical and simulator_* alias for every dual tool', () => {
    const { calls, restore } = captureTools()
    createScoutServer(makeAdapter(IOS_META))
    restore()
    const names = calls.map((c) => c.name)
    for (const tool of DUAL_TOOLS) {
      expect(names).toContain(`device_${tool}`)
      expect(names).toContain(`simulator_${tool}`)
    }
  })

  it('registers exactly 27 tools (1 env + 13 canonical + 13 aliases)', () => {
    const { calls, restore } = captureTools()
    createScoutServer(makeAdapter(IOS_META))
    restore()
    expect(calls).toHaveLength(1 + DUAL_TOOLS.length * 2)
  })

  it('marks alias descriptions as DEPRECATED and points to the canonical name', () => {
    const { calls, restore } = captureTools()
    createScoutServer(makeAdapter(IOS_META))
    restore()
    const alias = calls.find((c) => c.name === 'simulator_tap')!
    expect(alias.description).toContain('[DEPRECATED alias for device_tap]')
  })

  it('derives descriptions from adapter meta (iOS: .app bundle, requires idb)', () => {
    const { calls, restore } = captureTools()
    createScoutServer(makeAdapter(IOS_META))
    restore()
    const install = calls.find((c) => c.name === 'device_install')!
    const tap = calls.find((c) => c.name === 'device_tap')!
    expect(install.description).toContain('.app bundle')
    expect(install.description).toContain('iOS Simulator')
    expect(tap.description).toContain('requires idb')
  })

  it('derives descriptions from adapter meta (Android: .apk, no tooling note)', () => {
    const { calls, restore } = captureTools()
    createScoutServer(makeAdapter(ANDROID_META))
    restore()
    const install = calls.find((c) => c.name === 'device_install')!
    const tap = calls.find((c) => c.name === 'device_tap')!
    expect(install.description).toContain('.apk')
    expect(install.description).toContain('Android Emulator')
    // Empty gestureToolingNote => no parenthetical note appended
    expect(tap.description).not.toContain('requires idb')
    expect(tap.description).not.toContain('()')
  })

  it('falls back to neutral defaults when adapter has no meta', () => {
    const { calls, restore } = captureTools()
    createScoutServer(makeAdapter()) // no meta
    restore()
    const install = calls.find((c) => c.name === 'device_install')!
    expect(install.description).toContain('app bundle')
    expect(install.description).toContain('device')
  })
})
