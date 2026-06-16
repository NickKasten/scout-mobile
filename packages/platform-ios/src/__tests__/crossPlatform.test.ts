import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ScoutEnvironmentError } from '@scout-mobile/core'

// The iOS adapter is per-adapter OS-gated: every device operation calls
// assertMacOS() first, so on Windows/Linux users get a clean ScoutEnvironmentError
// rather than a confusing xcrun/idb failure. These tests pin that contract by
// mocking node:os to report non-macOS platforms.
vi.mock('node:os', () => ({
  platform: vi.fn(),
  tmpdir: vi.fn(() => '/tmp'),
}))

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
  spawn: vi.fn(),
}))

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  mkdtempSync: vi.fn(() => '/tmp/scout-xyz'),
  rmSync: vi.fn(),
  existsSync: vi.fn(() => true),
}))

import { platform } from 'node:os'
import { IOSSimulatorAdapter } from '../IOSSimulatorAdapter.js'

const mockPlatform = vi.mocked(platform)

beforeEach(() => {
  vi.clearAllMocks()
})

for (const os of ['win32', 'linux'] as const) {
  describe(`IOSSimulatorAdapter on ${os}`, () => {
    beforeEach(() => {
      mockPlatform.mockReturnValue(os)
    })

    it('boot() throws ScoutEnvironmentError', async () => {
      const adapter = new IOSSimulatorAdapter()
      await expect(adapter.boot()).rejects.toThrow(ScoutEnvironmentError)
    })

    it('screenshot() throws ScoutEnvironmentError', async () => {
      const adapter = new IOSSimulatorAdapter()
      await expect(adapter.screenshot()).rejects.toThrow(ScoutEnvironmentError)
    })

    it('launch() throws ScoutEnvironmentError', async () => {
      const adapter = new IOSSimulatorAdapter()
      await expect(adapter.launch('com.example.app')).rejects.toThrow(ScoutEnvironmentError)
    })

    it('tap() throws ScoutEnvironmentError', async () => {
      const adapter = new IOSSimulatorAdapter()
      await expect(adapter.tap({ x: 10, y: 10 })).rejects.toThrow(ScoutEnvironmentError)
    })

    it('accessibilityTree() throws ScoutEnvironmentError', async () => {
      const adapter = new IOSSimulatorAdapter()
      await expect(adapter.accessibilityTree()).rejects.toThrow(ScoutEnvironmentError)
    })
  })
}

describe('IOSSimulatorAdapter on darwin', () => {
  it('does not throw an OS gate error before doing real work', () => {
    mockPlatform.mockReturnValue('darwin')
    // Constructing the adapter must never throw regardless of OS.
    expect(() => new IOSSimulatorAdapter()).not.toThrow()
  })
})
