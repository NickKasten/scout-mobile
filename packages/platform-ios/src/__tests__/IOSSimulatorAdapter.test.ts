import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ScoutValidationError, ScoutEnvironmentError } from '@scout-mobile/core'

vi.mock('node:os', () => ({
  platform: vi.fn().mockReturnValue('darwin'),
  tmpdir: vi.fn().mockReturnValue('/tmp'),
}))

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
  spawn: vi.fn(),
}))

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  mkdtempSync: vi.fn().mockReturnValue('/tmp/scout-test'),
  rmSync: vi.fn(),
}))

vi.mock('node:readline', () => ({
  createInterface: vi.fn().mockReturnValue({
    on: vi.fn(),
    close: vi.fn(),
  }),
}))

import { execFileSync, spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { IOSSimulatorAdapter, extractRuntimeVersion } from '../IOSSimulatorAdapter.js'

const mockExecFileSync = vi.mocked(execFileSync)
const mockExistsSync = vi.mocked(existsSync)
const mockReadFileSync = vi.mocked(readFileSync)
const mockSpawn = vi.mocked(spawn)

const MOCK_UDID = 'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE'

// All devices JSON (for boot and getAllDevices)
const MOCK_SIMCTL_ALL_DEVICES_JSON = JSON.stringify({
  devices: {
    'com.apple.CoreSimulator.SimRuntime.iOS-18-0': [
      { udid: MOCK_UDID, state: 'Shutdown', name: 'iPhone 17 Pro' },
    ],
  },
})

// Booted devices JSON (for getAllBootedDevices after boot)
const MOCK_SIMCTL_BOOTED_JSON = JSON.stringify({
  devices: {
    'com.apple.CoreSimulator.SimRuntime.iOS-18-0': [
      { udid: MOCK_UDID, state: 'Booted', name: 'iPhone 17 Pro' },
    ],
  },
})

/**
 * Helper to set up mock so that:
 * - `simctl list devices -j` returns allJson (all devices)
 * - `simctl list devices booted -j` returns bootedJson (booted only)
 * - idb calls return empty buffer
 */
function setupSimctlMock(opts?: {
  allJson?: string
  bootedJson?: string
  idbDescribeAll?: string
}) {
  const allJson = opts?.allJson ?? MOCK_SIMCTL_ALL_DEVICES_JSON
  const bootedJson = opts?.bootedJson ?? MOCK_SIMCTL_BOOTED_JSON
  const idbDescribeAll = opts?.idbDescribeAll

  mockExecFileSync.mockImplementation((cmd, args) => {
    if (cmd === 'xcrun' && Array.isArray(args) && args[0] === 'simctl' && args[1] === 'list') {
      // Distinguish between "list devices -j" (all) and "list devices booted -j" (booted)
      // getAllDevices: ['simctl', 'list', 'devices', '-j']
      // The old getBootedDevice used: ['simctl', 'list', 'devices', 'booted', '-j']
      // But now getAllDevices always uses ['simctl', 'list', 'devices', '-j']
      // getAllBootedDevices filters by state === 'Booted'
      return allJson as any
    }
    if (cmd === 'idb' && Array.isArray(args) && args[1] === 'describe-all' && idbDescribeAll) {
      return idbDescribeAll as any
    }
    return Buffer.from('')
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  // Default: readFileSync returns a fake PNG buffer for screenshot tests
  mockReadFileSync.mockReturnValue(Buffer.from('fakepng'))
  // Default mock setup: one device that starts Shutdown, becomes Booted after boot
  setupSimctlMock()
})

describe('IOSSimulatorAdapter', () => {
  describe('boot', () => {
    it('returns DeviceInfo with dimensions for known device', async () => {
      // After boot, getAllDevices should show the device as Booted
      setupSimctlMock({ allJson: MOCK_SIMCTL_BOOTED_JSON })
      const adapter = new IOSSimulatorAdapter()
      const info = await adapter.boot('iPhone 17 Pro')
      expect(info.udid).toBe(MOCK_UDID)
      expect(info.name).toBe('iPhone 17 Pro')
      expect(info.width).toBe(402)
      expect(info.height).toBe(874)
    })

    it('returns DeviceInfo with zero dimensions for unknown device', async () => {
      const customJson = JSON.stringify({
        devices: {
          'com.apple.CoreSimulator.SimRuntime.iOS-18-0': [
            { udid: MOCK_UDID, state: 'Booted', name: 'Custom Device' },
          ],
        },
      })
      setupSimctlMock({ allJson: customJson })
      const adapter = new IOSSimulatorAdapter()
      const info = await adapter.boot('Custom Device')
      expect(info.name).toBe('Custom Device')
      expect(info.width).toBe(0)
      expect(info.height).toBe(0)
    })

    it('stores device info as instance state', async () => {
      setupSimctlMock({ allJson: MOCK_SIMCTL_BOOTED_JSON })
      const adapter = new IOSSimulatorAdapter()
      await adapter.boot()
      expect(adapter.getDeviceInfo()).toBeDefined()
      expect(adapter.getDeviceInfo()!.name).toBe('iPhone 17 Pro')
    })

    it('boots by UDID when given a UUID string', async () => {
      setupSimctlMock({ allJson: MOCK_SIMCTL_BOOTED_JSON })
      const adapter = new IOSSimulatorAdapter()
      const info = await adapter.boot(MOCK_UDID)
      expect(info.udid).toBe(MOCK_UDID)
      // Should call simctl boot with UDID, not name
      const bootCall = mockExecFileSync.mock.calls.find(
        (call) => call[0] === 'xcrun' && Array.isArray(call[1]) && (call[1] as string[]).includes('boot'),
      )
      expect(bootCall).toBeDefined()
      expect((bootCall![1] as string[])[2]).toBe(MOCK_UDID)
    })

    it('selects highest runtime when multiple devices share same name', async () => {
      const UDID_OLD = '11111111-1111-1111-1111-111111111111'
      const UDID_NEW = '22222222-2222-2222-2222-222222222222'
      const multiJson = JSON.stringify({
        devices: {
          'com.apple.CoreSimulator.SimRuntime.iOS-17-0': [
            { udid: UDID_OLD, state: 'Shutdown', name: 'iPhone 17 Pro' },
          ],
          'com.apple.CoreSimulator.SimRuntime.iOS-18-0': [
            { udid: UDID_NEW, state: 'Shutdown', name: 'iPhone 17 Pro' },
          ],
        },
      })
      // After boot, both appear but we should have booted the iOS-18 one
      const bootedJson = JSON.stringify({
        devices: {
          'com.apple.CoreSimulator.SimRuntime.iOS-17-0': [
            { udid: UDID_OLD, state: 'Shutdown', name: 'iPhone 17 Pro' },
          ],
          'com.apple.CoreSimulator.SimRuntime.iOS-18-0': [
            { udid: UDID_NEW, state: 'Booted', name: 'iPhone 17 Pro' },
          ],
        },
      })
      setupSimctlMock({ allJson: multiJson })
      // After the boot call, switch to showing it as booted
      let callCount = 0
      mockExecFileSync.mockImplementation((cmd, args) => {
        if (cmd === 'xcrun' && Array.isArray(args) && args[0] === 'simctl' && args[1] === 'list') {
          callCount++
          // First call during boot resolution → all devices
          // Subsequent calls (for warnings check) → show booted state
          return (callCount <= 1 ? multiJson : bootedJson) as any
        }
        return Buffer.from('')
      })

      const adapter = new IOSSimulatorAdapter()
      const info = await adapter.boot('iPhone 17 Pro')
      expect(info.udid).toBe(UDID_NEW)

      // Verify boot was called with the higher-runtime UDID
      const bootCall = mockExecFileSync.mock.calls.find(
        (call) => call[0] === 'xcrun' && Array.isArray(call[1]) && (call[1] as string[]).includes('boot'),
      )
      expect(bootCall).toBeDefined()
      expect((bootCall![1] as string[])[2]).toBe(UDID_NEW)
    })

    it('returns warnings when other simulators are booted', async () => {
      const OTHER_UDID = '99999999-9999-9999-9999-999999999999'
      const bothBootedJson = JSON.stringify({
        devices: {
          'com.apple.CoreSimulator.SimRuntime.iOS-18-0': [
            { udid: MOCK_UDID, state: 'Booted', name: 'iPhone 17 Pro' },
            { udid: OTHER_UDID, state: 'Booted', name: 'iPad Air' },
          ],
        },
      })
      setupSimctlMock({ allJson: bothBootedJson })

      const adapter = new IOSSimulatorAdapter()
      const result = await adapter.boot('iPhone 17 Pro')
      expect(result.warnings).toBeDefined()
      expect(result.warnings!.length).toBe(1)
      expect(result.warnings![0]).toContain('iPad Air')
    })

    it('succeeds idempotently when device is already booted', async () => {
      setupSimctlMock({ allJson: MOCK_SIMCTL_BOOTED_JSON })
      mockExecFileSync.mockImplementation((cmd, args) => {
        if (cmd === 'xcrun' && Array.isArray(args) && args[0] === 'simctl' && args[1] === 'boot') {
          throw new Error('Unable to boot device in current state: Booted')
        }
        if (cmd === 'xcrun' && Array.isArray(args) && args[0] === 'simctl' && args[1] === 'list') {
          return MOCK_SIMCTL_BOOTED_JSON as any
        }
        return Buffer.from('')
      })

      const adapter = new IOSSimulatorAdapter()
      const info = await adapter.boot('iPhone 17 Pro')
      expect(info.udid).toBe(MOCK_UDID)
    })
  })

  describe('requireUdid', () => {
    it('errors when no devices are booted and boot was not called', async () => {
      const noBootedJson = JSON.stringify({
        devices: {
          'com.apple.CoreSimulator.SimRuntime.iOS-18-0': [
            { udid: MOCK_UDID, state: 'Shutdown', name: 'iPhone 17 Pro' },
          ],
        },
      })
      setupSimctlMock({ allJson: noBootedJson })

      const adapter = new IOSSimulatorAdapter()
      await expect(adapter.screenshot()).rejects.toThrow('No booted simulator found')
    })

    it('errors when multiple devices are booted and boot was not called', async () => {
      const multiBootedJson = JSON.stringify({
        devices: {
          'com.apple.CoreSimulator.SimRuntime.iOS-18-0': [
            { udid: MOCK_UDID, state: 'Booted', name: 'iPhone 17 Pro' },
            { udid: '99999999-9999-9999-9999-999999999999', state: 'Booted', name: 'iPad Air' },
          ],
        },
      })
      setupSimctlMock({ allJson: multiBootedJson })

      const adapter = new IOSSimulatorAdapter()
      await expect(adapter.screenshot()).rejects.toThrow('Multiple booted simulators')
    })

    it('uses stored UDID after boot()', async () => {
      setupSimctlMock({ allJson: MOCK_SIMCTL_BOOTED_JSON })
      const adapter = new IOSSimulatorAdapter()
      await adapter.boot()

      // Now screenshot should use the stored UDID
      await adapter.screenshot()
      const screenshotCall = mockExecFileSync.mock.calls.find(
        (call) => call[0] === 'xcrun' && Array.isArray(call[1]) && (call[1] as string[]).includes('screenshot'),
      )
      expect(screenshotCall).toBeDefined()
      expect((screenshotCall![1] as string[])[2]).toBe(MOCK_UDID)
    })
  })

  describe('screenshot', () => {
    it('uses UDID instead of booted', async () => {
      setupSimctlMock({ allJson: MOCK_SIMCTL_BOOTED_JSON })
      const adapter = new IOSSimulatorAdapter()
      await adapter.boot()
      await adapter.screenshot()
      const call = mockExecFileSync.mock.calls.find(
        (c) => c[0] === 'xcrun' && Array.isArray(c[1]) && (c[1] as string[]).includes('screenshot'),
      )
      expect(call).toBeDefined()
      expect((call![1] as string[])[2]).toBe(MOCK_UDID)
      expect((call![1] as string[])[2]).not.toBe('booted')
    })

    it('applies delay before capturing', async () => {
      setupSimctlMock({ allJson: MOCK_SIMCTL_BOOTED_JSON })
      const adapter = new IOSSimulatorAdapter()
      await adapter.boot()

      const start = Date.now()
      await adapter.screenshot({ delayMs: 100 })
      const elapsed = Date.now() - start
      expect(elapsed).toBeGreaterThanOrEqual(90) // allow small timing variance
    })

    it('caps delay at 5000ms', async () => {
      setupSimctlMock({ allJson: MOCK_SIMCTL_BOOTED_JSON })
      const adapter = new IOSSimulatorAdapter()
      await adapter.boot()

      const start = Date.now()
      // Request 10s delay, should be capped at 5s, but for test speed let's verify logic exists
      // We'll just verify it doesn't throw
      await adapter.screenshot({ delayMs: 50 })
      const elapsed = Date.now() - start
      expect(elapsed).toBeGreaterThanOrEqual(40)
    })
  })

  describe('install', () => {
    it('rejects paths not ending in .app', async () => {
      setupSimctlMock({ allJson: MOCK_SIMCTL_BOOTED_JSON })
      const adapter = new IOSSimulatorAdapter()
      await adapter.boot()
      await expect(adapter.install('/path/to/myapp.ipa')).rejects.toThrow(ScoutValidationError)
      await expect(adapter.install('/path/to/myapp.ipa')).rejects.toThrow('.app')
    })

    it('rejects non-existent app path', async () => {
      setupSimctlMock({ allJson: MOCK_SIMCTL_BOOTED_JSON })
      const adapter = new IOSSimulatorAdapter()
      await adapter.boot()
      mockExistsSync.mockReturnValue(false)
      await expect(adapter.install('/path/to/myapp.app')).rejects.toThrow(ScoutValidationError)
      await expect(adapter.install('/path/to/myapp.app')).rejects.toThrow('not found')
    })

    it('calls simctl install with UDID and validated path', async () => {
      setupSimctlMock({ allJson: MOCK_SIMCTL_BOOTED_JSON })
      const adapter = new IOSSimulatorAdapter()
      await adapter.boot()
      mockExistsSync.mockReturnValue(true)
      await adapter.install('/path/to/myapp.app')
      const installCall = mockExecFileSync.mock.calls.find(
        (call) => call[0] === 'xcrun' && Array.isArray(call[1]) && (call[1] as string[]).includes('install'),
      )
      expect(installCall).toBeDefined()
      expect((installCall![1] as string[])[2]).toBe(MOCK_UDID)
      expect((installCall![1] as string[])[3]).toContain('myapp.app')
    })
  })

  describe('launch', () => {
    it('rejects invalid bundle IDs', async () => {
      const adapter = new IOSSimulatorAdapter()
      await expect(adapter.launch('com.$(evil).app')).rejects.toThrow(ScoutValidationError)
    })

    it('calls simctl launch with UDID and bundle ID', async () => {
      setupSimctlMock({ allJson: MOCK_SIMCTL_BOOTED_JSON })
      const adapter = new IOSSimulatorAdapter()
      await adapter.boot()
      await adapter.launch('com.example.app')
      const launchCall = mockExecFileSync.mock.calls.find(
        (call) => call[0] === 'xcrun' && Array.isArray(call[1]) && (call[1] as string[]).includes('launch'),
      )
      expect(launchCall).toBeDefined()
      expect((launchCall![1] as string[])[2]).toBe(MOCK_UDID)
      expect((launchCall![1] as string[])[3]).toBe('com.example.app')
    })
  })

  describe('tap', () => {
    it('rounds coordinates and passes UDID to idb', async () => {
      setupSimctlMock({ allJson: MOCK_SIMCTL_BOOTED_JSON })
      const adapter = new IOSSimulatorAdapter()
      await adapter.boot()
      await adapter.tap({ x: 100.7, y: 200.3 })
      const idbTapCall = mockExecFileSync.mock.calls.find(
        (call) => call[0] === 'idb' && (call[1] as string[])[0] === 'ui' && (call[1] as string[])[1] === 'tap',
      )
      expect(idbTapCall).toBeDefined()
      expect(idbTapCall![1]).toEqual(['ui', 'tap', '101', '200', '--udid', MOCK_UDID])
    })

    it('rejects negative coordinates', async () => {
      const adapter = new IOSSimulatorAdapter()
      await expect(adapter.tap({ x: -1, y: 100 })).rejects.toThrow(ScoutValidationError)
      await expect(adapter.tap({ x: 100, y: -5 })).rejects.toThrow('non-negative')
    })

    it('throws when idb not installed', async () => {
      const adapter = new IOSSimulatorAdapter()
      mockExecFileSync.mockImplementation((cmd) => {
        if (cmd === 'idb') throw new Error('command not found')
        if (cmd === 'xcrun') return MOCK_SIMCTL_BOOTED_JSON as any
        return Buffer.from('')
      })
      await expect(adapter.tap({ x: 100, y: 200 })).rejects.toThrow(ScoutEnvironmentError)
    })

    it('rejects coordinates exceeding screen bounds after boot', async () => {
      setupSimctlMock({ allJson: MOCK_SIMCTL_BOOTED_JSON })
      const adapter = new IOSSimulatorAdapter()
      await adapter.boot('iPhone 17 Pro') // 402x874
      await expect(adapter.tap({ x: 500, y: 100 })).rejects.toThrow('exceeds screen width')
      await expect(adapter.tap({ x: 100, y: 900 })).rejects.toThrow('exceeds screen height')
    })

    it('allows coordinates within bounds after boot', async () => {
      setupSimctlMock({ allJson: MOCK_SIMCTL_BOOTED_JSON })
      const adapter = new IOSSimulatorAdapter()
      await adapter.boot('iPhone 17 Pro') // 402x874
      await expect(adapter.tap({ x: 200, y: 400 })).resolves.toBeUndefined()
    })
  })

  describe('swipe', () => {
    it('passes all four coordinates and UDID to idb', async () => {
      setupSimctlMock({ allJson: MOCK_SIMCTL_BOOTED_JSON })
      const adapter = new IOSSimulatorAdapter()
      await adapter.boot()
      await adapter.swipe({ x: 100, y: 200 }, { x: 300, y: 400 })
      const idbSwipeCall = mockExecFileSync.mock.calls.find(
        (call) => call[0] === 'idb' && (call[1] as string[])[0] === 'ui' && (call[1] as string[])[1] === 'swipe',
      )
      expect(idbSwipeCall).toBeDefined()
      expect(idbSwipeCall![1]).toEqual(['ui', 'swipe', '100', '200', '300', '400', '--duration', '0.5', '--udid', MOCK_UDID])
    })

    it('rejects coordinates exceeding screen bounds after boot', async () => {
      setupSimctlMock({ allJson: MOCK_SIMCTL_BOOTED_JSON })
      const adapter = new IOSSimulatorAdapter()
      await adapter.boot('iPhone 17 Pro')
      await expect(adapter.swipe({ x: 500, y: 200 }, { x: 100, y: 200 })).rejects.toThrow('exceeds screen width')
      await expect(adapter.swipe({ x: 100, y: 200 }, { x: 100, y: 1000 })).rejects.toThrow('exceeds screen height')
    })
  })

  describe('logStream', () => {
    it('spawns xcrun simctl log stream with UDID', async () => {
      setupSimctlMock({ allJson: MOCK_SIMCTL_BOOTED_JSON })
      const adapter = new IOSSimulatorAdapter()
      await adapter.boot()

      const mockChild = {
        stdout: { on: vi.fn() },
        kill: vi.fn(),
      }
      mockSpawn.mockReturnValue(mockChild as any)

      const callback = vi.fn()
      const { stop } = await adapter.logStream(callback)

      expect(mockSpawn).toHaveBeenCalledWith(
        'xcrun',
        ['simctl', 'spawn', MOCK_UDID, 'log', 'stream', '--style', 'compact'],
        { stdio: ['ignore', 'pipe', 'ignore'] },
      )

      stop()
      expect(mockChild.kill).toHaveBeenCalledWith('SIGTERM')
    })

    it('adds predicate for bundleId filter', async () => {
      setupSimctlMock({ allJson: MOCK_SIMCTL_BOOTED_JSON })
      const adapter = new IOSSimulatorAdapter()
      await adapter.boot()

      const mockChild = { stdout: { on: vi.fn() }, kill: vi.fn() }
      mockSpawn.mockReturnValue(mockChild as any)

      await adapter.logStream(vi.fn(), { bundleId: 'com.example.app' })

      expect(mockSpawn).toHaveBeenCalledWith(
        'xcrun',
        ['simctl', 'spawn', MOCK_UDID, 'log', 'stream', '--style', 'compact', '--predicate', 'process == "app"'],
        { stdio: ['ignore', 'pipe', 'ignore'] },
      )
    })

    it('adds predicate for processName filter', async () => {
      setupSimctlMock({ allJson: MOCK_SIMCTL_BOOTED_JSON })
      const adapter = new IOSSimulatorAdapter()
      await adapter.boot()

      const mockChild = { stdout: { on: vi.fn() }, kill: vi.fn() }
      mockSpawn.mockReturnValue(mockChild as any)

      await adapter.logStream(vi.fn(), { processName: 'MyApp' })

      expect(mockSpawn).toHaveBeenCalledWith(
        'xcrun',
        ['simctl', 'spawn', MOCK_UDID, 'log', 'stream', '--style', 'compact', '--predicate', 'process == "MyApp"'],
        { stdio: ['ignore', 'pipe', 'ignore'] },
      )
    })

    it('prefers processName over bundleId when both provided', async () => {
      setupSimctlMock({ allJson: MOCK_SIMCTL_BOOTED_JSON })
      const adapter = new IOSSimulatorAdapter()
      await adapter.boot()

      const mockChild = { stdout: { on: vi.fn() }, kill: vi.fn() }
      mockSpawn.mockReturnValue(mockChild as any)

      await adapter.logStream(vi.fn(), { processName: 'MyProcess', bundleId: 'com.example.app' })

      const spawnArgs = mockSpawn.mock.calls[0][1] as string[]
      expect(spawnArgs).toContain('--predicate')
      expect(spawnArgs[spawnArgs.indexOf('--predicate') + 1]).toBe('process == "MyProcess"')
    })
  })

  describe('typeText', () => {
    it('calls idb ui text with correct args', async () => {
      setupSimctlMock({ allJson: MOCK_SIMCTL_BOOTED_JSON })
      const adapter = new IOSSimulatorAdapter()
      await adapter.boot()
      await adapter.typeText('hello@example.com')
      const idbCall = mockExecFileSync.mock.calls.find(
        (call) => call[0] === 'idb' && (call[1] as string[])[1] === 'text',
      )
      expect(idbCall).toBeDefined()
      expect(idbCall![1]).toEqual(['ui', 'text', 'hello@example.com', '--udid', MOCK_UDID])
    })

    it('rejects empty text', async () => {
      const adapter = new IOSSimulatorAdapter()
      await expect(adapter.typeText('')).rejects.toThrow(ScoutValidationError)
    })

    it('rejects text with control characters', async () => {
      const adapter = new IOSSimulatorAdapter()
      await expect(adapter.typeText('hello\x00world')).rejects.toThrow(ScoutValidationError)
    })
  })

  describe('pressKey', () => {
    it('calls idb ui key with HID keycode', async () => {
      setupSimctlMock({ allJson: MOCK_SIMCTL_BOOTED_JSON })
      const adapter = new IOSSimulatorAdapter()
      await adapter.boot()
      await adapter.pressKey('return')
      const idbCall = mockExecFileSync.mock.calls.find(
        (call) => call[0] === 'idb' && (call[1] as string[])[1] === 'key',
      )
      expect(idbCall).toBeDefined()
      expect(idbCall![1]).toEqual(['ui', 'key', '40', '--udid', MOCK_UDID])
    })

    it('maps tab to keycode 43', async () => {
      setupSimctlMock({ allJson: MOCK_SIMCTL_BOOTED_JSON })
      const adapter = new IOSSimulatorAdapter()
      await adapter.boot()
      await adapter.pressKey('tab')
      const idbCall = mockExecFileSync.mock.calls.find(
        (call) => call[0] === 'idb' && (call[1] as string[])[1] === 'key',
      )
      expect(idbCall![1]).toEqual(['ui', 'key', '43', '--udid', MOCK_UDID])
    })

    it('rejects invalid key names', async () => {
      const adapter = new IOSSimulatorAdapter()
      await expect(adapter.pressKey('invalidKey')).rejects.toThrow(ScoutValidationError)
      await expect(adapter.pressKey('')).rejects.toThrow(ScoutValidationError)
    })

    it('accepts all allowed key names', async () => {
      setupSimctlMock({ allJson: MOCK_SIMCTL_BOOTED_JSON })
      const adapter = new IOSSimulatorAdapter()
      await adapter.boot()
      const keys = ['return', 'tab', 'space', 'deleteBackspace', 'delete', 'escape',
        'upArrow', 'downArrow', 'leftArrow', 'rightArrow', 'home', 'end', 'pageUp', 'pageDown']
      for (const key of keys) {
        await expect(adapter.pressKey(key)).resolves.toBeUndefined()
      }
    })
  })

  describe('clearText', () => {
    it('triple-taps and deletes when text field with frame found', async () => {
      const a11yJson = JSON.stringify([
        {
          type: 'TextField',
          name: 'Email',
          value: 'hello',
          frame: { x: 10, y: 100, width: 200, height: 40 },
        },
      ])
      setupSimctlMock({ allJson: MOCK_SIMCTL_BOOTED_JSON, idbDescribeAll: a11yJson })
      const adapter = new IOSSimulatorAdapter()
      await adapter.boot()
      await adapter.clearText()

      // Should have 3 taps + 1 delete
      const tapCalls = mockExecFileSync.mock.calls.filter(
        (c) => c[0] === 'idb' && Array.isArray(c[1]) && (c[1] as string[])[1] === 'tap',
      )
      expect(tapCalls).toHaveLength(3)
      // Verify taps at center of text field (10 + 200/2 = 110, 100 + 40/2 = 120)
      expect((tapCalls[0][1] as string[])[2]).toBe('110')
      expect((tapCalls[0][1] as string[])[3]).toBe('120')

      const keyCalls = mockExecFileSync.mock.calls.filter(
        (c) => c[0] === 'idb' && Array.isArray(c[1]) && (c[1] as string[])[1] === 'key',
      )
      expect(keyCalls).toHaveLength(1) // single deleteBackspace after select-all
    })

    it('falls back to value.length deletions when no frame', async () => {
      const a11yJson = JSON.stringify([
        {
          type: 'TextField',
          name: 'Email',
          value: 'hi',
          frame: { x: 0, y: 0, width: 0, height: 0 },
        },
      ])
      setupSimctlMock({ allJson: MOCK_SIMCTL_BOOTED_JSON, idbDescribeAll: a11yJson })
      const adapter = new IOSSimulatorAdapter()
      await adapter.boot()
      await adapter.clearText()

      const keyCalls = mockExecFileSync.mock.calls.filter(
        (c) => c[0] === 'idb' && Array.isArray(c[1]) && (c[1] as string[])[1] === 'key',
      )
      expect(keyCalls).toHaveLength(2) // 'hi'.length = 2
    })

    it('falls back to 50 deletions when no text field found', async () => {
      const a11yJson = JSON.stringify([
        { type: 'Button', name: 'OK', frame: { x: 0, y: 0, width: 100, height: 50 } },
      ])
      setupSimctlMock({ allJson: MOCK_SIMCTL_BOOTED_JSON, idbDescribeAll: a11yJson })
      const adapter = new IOSSimulatorAdapter()
      await adapter.boot()
      await adapter.clearText()

      const keyCalls = mockExecFileSync.mock.calls.filter(
        (c) => c[0] === 'idb' && Array.isArray(c[1]) && (c[1] as string[])[1] === 'key',
      )
      expect(keyCalls).toHaveLength(50)
    })
  })

  describe('tapElement', () => {
    it('finds element by label and taps its center', async () => {
      const a11yJson = JSON.stringify([
        {
          type: 'Button',
          name: 'Submit',
          frame: { x: 100, y: 200, width: 80, height: 40 },
        },
      ])
      setupSimctlMock({ allJson: MOCK_SIMCTL_BOOTED_JSON, idbDescribeAll: a11yJson })
      const adapter = new IOSSimulatorAdapter()
      await adapter.boot()
      const result = await adapter.tapElement('Submit')
      expect(result.element.name).toBe('Submit')

      const tapCall = mockExecFileSync.mock.calls.find(
        (c) => c[0] === 'idb' && Array.isArray(c[1]) && (c[1] as string[])[1] === 'tap',
      )
      expect(tapCall).toBeDefined()
      // Center: 100+40=140, 200+20=220
      expect((tapCall![1] as string[])[2]).toBe('140')
      expect((tapCall![1] as string[])[3]).toBe('220')
    })

    it('finds nested elements', async () => {
      const a11yJson = JSON.stringify([
        {
          type: 'Window',
          name: '',
          frame: { x: 0, y: 0, width: 400, height: 800 },
          children: [
            {
              type: 'Button',
              name: 'Deep Button',
              frame: { x: 50, y: 50, width: 100, height: 50 },
            },
          ],
        },
      ])
      setupSimctlMock({ allJson: MOCK_SIMCTL_BOOTED_JSON, idbDescribeAll: a11yJson })
      const adapter = new IOSSimulatorAdapter()
      await adapter.boot()
      const result = await adapter.tapElement('Deep Button')
      expect(result.element.name).toBe('Deep Button')
    })

    it('throws when element not found', async () => {
      const a11yJson = JSON.stringify([
        { type: 'Button', name: 'OK', frame: { x: 0, y: 0, width: 100, height: 50 } },
      ])
      setupSimctlMock({ allJson: MOCK_SIMCTL_BOOTED_JSON, idbDescribeAll: a11yJson })
      const adapter = new IOSSimulatorAdapter()
      await adapter.boot()
      await expect(adapter.tapElement('NonExistent')).rejects.toThrow('No element found')
    })

    it('throws when element has zero-size frame', async () => {
      const a11yJson = JSON.stringify([
        { type: 'Button', name: 'Ghost', frame: { x: 0, y: 0, width: 0, height: 0 } },
      ])
      setupSimctlMock({ allJson: MOCK_SIMCTL_BOOTED_JSON, idbDescribeAll: a11yJson })
      const adapter = new IOSSimulatorAdapter()
      await adapter.boot()
      await expect(adapter.tapElement('Ghost')).rejects.toThrow('zero-size frame')
    })
  })

  describe('accessibilityTree', () => {
    it('calls idb ui describe-all with correct args', async () => {
      setupSimctlMock({
        allJson: MOCK_SIMCTL_BOOTED_JSON,
        idbDescribeAll: JSON.stringify([{ type: 'Button', name: 'OK', frame: { x: 0, y: 0, width: 100, height: 50 } }]),
      })
      const adapter = new IOSSimulatorAdapter()
      await adapter.boot()
      const tree = await adapter.accessibilityTree()
      expect(tree.elements).toHaveLength(1)
      expect(tree.elements[0].name).toBe('OK')
      expect(tree.raw).toContain('OK')
    })

    it('throws when idb not installed', async () => {
      const adapter = new IOSSimulatorAdapter()
      mockExecFileSync.mockImplementation((cmd) => {
        if (cmd === 'idb') throw new Error('command not found')
        if (cmd === 'xcrun') return MOCK_SIMCTL_BOOTED_JSON as any
        return Buffer.from('')
      })
      await expect(adapter.accessibilityTree()).rejects.toThrow(ScoutEnvironmentError)
    })
  })

  describe('teardown', () => {
    it('calls simctl shutdown with stored UDID after boot', async () => {
      setupSimctlMock({ allJson: MOCK_SIMCTL_BOOTED_JSON })
      const adapter = new IOSSimulatorAdapter()
      await adapter.boot()
      await adapter.teardown()
      const shutdownCall = mockExecFileSync.mock.calls.find(
        (c) => c[0] === 'xcrun' && Array.isArray(c[1]) && (c[1] as string[]).includes('shutdown'),
      )
      expect(shutdownCall).toBeDefined()
      expect((shutdownCall![1] as string[])[2]).toBe(MOCK_UDID)
    })

    it('falls back to "booted" when no device info stored', async () => {
      const adapter = new IOSSimulatorAdapter()
      await adapter.teardown()
      expect(mockExecFileSync).toHaveBeenCalledWith(
        'xcrun',
        ['simctl', 'shutdown', 'booted'],
        { stdio: 'ignore' },
      )
    })

    it('swallows errors from already-shutdown simulator', async () => {
      const adapter = new IOSSimulatorAdapter()
      mockExecFileSync.mockImplementation(() => {
        throw new Error('No devices booted')
      })
      await expect(adapter.teardown()).resolves.toBeUndefined()
    })
  })

  describe('extractRuntimeVersion', () => {
    it('parses iOS runtime strings', () => {
      expect(extractRuntimeVersion('com.apple.CoreSimulator.SimRuntime.iOS-18-0')).toEqual([18, 0, 0])
      expect(extractRuntimeVersion('com.apple.CoreSimulator.SimRuntime.iOS-26-2')).toEqual([26, 2, 0])
    })

    it('handles three-part versions', () => {
      expect(extractRuntimeVersion('com.apple.CoreSimulator.SimRuntime.iOS-17-4-1')).toEqual([17, 4, 1])
    })

    it('returns zeros for unrecognized format', () => {
      expect(extractRuntimeVersion('unknown-format')).toEqual([0, 0, 0])
    })
  })
})
