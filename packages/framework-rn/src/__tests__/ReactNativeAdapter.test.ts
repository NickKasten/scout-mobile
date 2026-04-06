import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ScoutEnvironmentError } from '@scout-mobile/core'

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}))

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
}))

import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { ReactNativeAdapter } from '../ReactNativeAdapter.js'

const mockExecFileSync = vi.mocked(execFileSync)
const mockExistsSync = vi.mocked(existsSync)
const mockReaddirSync = vi.mocked(readdirSync)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ReactNativeAdapter', () => {
  it('returns the configured bundle ID', () => {
    const adapter = new ReactNativeAdapter({
      projectRoot: '/tmp/test-project',
      bundleId: 'com.example.testapp',
    })
    expect(adapter.getBundleId()).toBe('com.example.testapp')
  })

  describe('build', () => {
    it('throws on missing ios/ directory', async () => {
      mockExistsSync.mockReturnValue(false)
      const adapter = new ReactNativeAdapter({
        projectRoot: '/tmp/test-project',
        bundleId: 'com.example.app',
      })
      await expect(adapter.build()).rejects.toThrow(ScoutEnvironmentError)
      await expect(adapter.build()).rejects.toThrow('ios/')
    })

    it('throws on missing workspace', async () => {
      mockExistsSync.mockReturnValue(true)
      mockReaddirSync.mockReturnValue([] as any)
      const adapter = new ReactNativeAdapter({
        projectRoot: '/tmp/test-project',
        bundleId: 'com.example.app',
      })
      await expect(adapter.build()).rejects.toThrow(ScoutEnvironmentError)
      await expect(adapter.build()).rejects.toThrow('.xcworkspace')
    })

    it('calls xcodebuild with correct args', async () => {
      // ios/ exists
      mockExistsSync.mockImplementation((p) => {
        const path = String(p)
        if (path.endsWith('/ios')) return true
        if (path.includes('Debug-iphonesimulator')) return true
        return false
      })
      // workspace found
      mockReaddirSync.mockImplementation((p) => {
        const path = String(p)
        if (path.endsWith('/ios')) return ['MyApp.xcworkspace', 'Podfile'] as any
        if (path.includes('Debug-iphonesimulator')) return ['MyApp.app'] as any
        return [] as any
      })

      const adapter = new ReactNativeAdapter({
        projectRoot: '/tmp/test-project',
        bundleId: 'com.example.app',
      })
      const result = await adapter.build()

      expect(mockExecFileSync).toHaveBeenCalledWith(
        'xcodebuild',
        expect.arrayContaining([
          '-workspace', expect.stringContaining('MyApp.xcworkspace'),
          '-scheme', 'MyApp',
          '-sdk', 'iphonesimulator',
          'build',
        ]),
        expect.objectContaining({ timeout: 300000 }),
      )
      expect(result).toContain('MyApp.app')
    })

    it('uses explicit scheme when provided', async () => {
      mockExistsSync.mockImplementation((p) => {
        const path = String(p)
        if (path.endsWith('/ios')) return true
        if (path.includes('Debug-iphonesimulator')) return true
        return false
      })
      mockReaddirSync.mockImplementation((p) => {
        const path = String(p)
        if (path.endsWith('/ios')) return ['MyApp.xcworkspace'] as any
        if (path.includes('Debug-iphonesimulator')) return ['MyApp.app'] as any
        return [] as any
      })

      const adapter = new ReactNativeAdapter({
        projectRoot: '/tmp/test-project',
        bundleId: 'com.example.app',
        scheme: 'MyCustomScheme',
      })
      await adapter.build()

      expect(mockExecFileSync).toHaveBeenCalledWith(
        'xcodebuild',
        expect.arrayContaining(['-scheme', 'MyCustomScheme']),
        expect.any(Object),
      )
    })
  })
})
