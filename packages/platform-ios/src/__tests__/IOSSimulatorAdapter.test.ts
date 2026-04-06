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
import { existsSync } from 'node:fs'
import { IOSSimulatorAdapter } from '../IOSSimulatorAdapter.js'

const mockExecFileSync = vi.mocked(execFileSync)
const mockExistsSync = vi.mocked(existsSync)
const mockSpawn = vi.mocked(spawn)

const MOCK_UDID = 'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE'
const MOCK_SIMCTL_DEVICES_JSON = JSON.stringify({
  devices: {
    'com.apple.CoreSimulator.SimRuntime.iOS-18-0': [
      { udid: MOCK_UDID, state: 'Booted', name: 'iPhone 16 Pro' },
    ],
  },
})

beforeEach(() => {
  vi.clearAllMocks()
  // Default: idb is installed (assertIdbInstalled passes), simctl list returns booted device
  mockExecFileSync.mockImplementation((cmd, args) => {
    if (cmd === 'xcrun' && Array.isArray(args) && args[0] === 'simctl' && args[1] === 'list') {
      return MOCK_SIMCTL_DEVICES_JSON as any
    }
    return Buffer.from('')
  })
})

describe('IOSSimulatorAdapter', () => {
  const adapter = new IOSSimulatorAdapter()

  describe('install', () => {
    it('rejects paths not ending in .app', async () => {
      await expect(adapter.install('/path/to/myapp.ipa')).rejects.toThrow(ScoutValidationError)
      await expect(adapter.install('/path/to/myapp.ipa')).rejects.toThrow('.app')
    })

    it('rejects non-existent app path', async () => {
      mockExistsSync.mockReturnValue(false)
      await expect(adapter.install('/path/to/myapp.app')).rejects.toThrow(ScoutValidationError)
      await expect(adapter.install('/path/to/myapp.app')).rejects.toThrow('not found')
    })

    it('calls simctl install with validated path', async () => {
      mockExistsSync.mockReturnValue(true)
      await adapter.install('/path/to/myapp.app')
      expect(mockExecFileSync).toHaveBeenCalledWith(
        'xcrun',
        ['simctl', 'install', 'booted', expect.stringContaining('myapp.app')],
        { stdio: 'ignore' },
      )
    })
  })

  describe('launch', () => {
    it('rejects invalid bundle IDs', async () => {
      await expect(adapter.launch('com.$(evil).app')).rejects.toThrow(ScoutValidationError)
    })

    it('calls simctl launch with bundle ID', async () => {
      await adapter.launch('com.example.app')
      expect(mockExecFileSync).toHaveBeenCalledWith(
        'xcrun',
        ['simctl', 'launch', 'booted', 'com.example.app'],
        { stdio: 'ignore' },
      )
    })
  })

  describe('tap', () => {
    it('rounds coordinates and passes UDID to idb', async () => {
      await adapter.tap({ x: 100.7, y: 200.3 })
      // Find the idb call (after assertIdbInstalled call)
      const idbTapCall = mockExecFileSync.mock.calls.find(
        (call) => call[0] === 'idb' && (call[1] as string[])[0] === 'ui',
      )
      expect(idbTapCall).toBeDefined()
      expect(idbTapCall![1]).toEqual(['ui', 'tap', '101', '200', '--udid', MOCK_UDID])
    })

    it('rejects negative coordinates', async () => {
      await expect(adapter.tap({ x: -1, y: 100 })).rejects.toThrow(ScoutValidationError)
      await expect(adapter.tap({ x: 100, y: -5 })).rejects.toThrow('non-negative')
    })

    it('throws when idb not installed', async () => {
      mockExecFileSync.mockImplementation((cmd) => {
        if (cmd === 'idb') throw new Error('command not found')
        if (cmd === 'xcrun') return MOCK_SIMCTL_DEVICES_JSON as any
        return Buffer.from('')
      })
      await expect(adapter.tap({ x: 100, y: 200 })).rejects.toThrow(ScoutEnvironmentError)
    })
  })

  describe('swipe', () => {
    it('passes all four coordinates and UDID to idb', async () => {
      await adapter.swipe({ x: 100, y: 200 }, { x: 300, y: 400 })
      const idbSwipeCall = mockExecFileSync.mock.calls.find(
        (call) => call[0] === 'idb' && (call[1] as string[])[0] === 'ui' && (call[1] as string[])[1] === 'swipe',
      )
      expect(idbSwipeCall).toBeDefined()
      expect(idbSwipeCall![1]).toEqual(['ui', 'swipe', '100', '200', '300', '400', '--udid', MOCK_UDID])
    })
  })

  describe('logStream', () => {
    it('spawns xcrun simctl log stream', async () => {
      const mockChild = {
        stdout: { on: vi.fn() },
        kill: vi.fn(),
      }
      mockSpawn.mockReturnValue(mockChild as any)

      const callback = vi.fn()
      const { stop } = await adapter.logStream(callback)

      expect(mockSpawn).toHaveBeenCalledWith(
        'xcrun',
        ['simctl', 'spawn', 'booted', 'log', 'stream', '--style', 'compact'],
        { stdio: ['ignore', 'pipe', 'ignore'] },
      )

      stop()
      expect(mockChild.kill).toHaveBeenCalledWith('SIGTERM')
    })
  })

  describe('teardown', () => {
    it('calls simctl shutdown', async () => {
      await adapter.teardown()
      expect(mockExecFileSync).toHaveBeenCalledWith(
        'xcrun',
        ['simctl', 'shutdown', 'booted'],
        { stdio: 'ignore' },
      )
    })

    it('swallows errors from already-shutdown simulator', async () => {
      mockExecFileSync.mockImplementation(() => {
        throw new Error('No devices booted')
      })
      await expect(adapter.teardown()).resolves.toBeUndefined()
    })
  })
})
