import { describe, it, expect, vi, beforeEach } from 'vitest'
import { sep } from 'node:path'
import { ScoutEnvironmentError } from '@scout-mobile/core'

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}))

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
}))

vi.mock('node:os', () => ({
  platform: vi.fn(),
}))

import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { platform } from 'node:os'
import { ReactNativeAdapter } from '../ReactNativeAdapter.js'

const mockExecFileSync = vi.mocked(execFileSync)
const mockExistsSync = vi.mocked(existsSync)
const mockReaddirSync = vi.mocked(readdirSync)
const mockPlatform = vi.mocked(platform)

beforeEach(() => {
  vi.clearAllMocks()
  mockPlatform.mockReturnValue('darwin')
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
        if (path.endsWith(`${sep}ios`)) return true
        if (path.includes('Debug-iphonesimulator')) return true
        return false
      })
      // workspace found
      mockReaddirSync.mockImplementation((p) => {
        const path = String(p)
        if (path.endsWith(`${sep}ios`)) return ['MyApp.xcworkspace', 'Podfile'] as any
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
        if (path.endsWith(`${sep}ios`)) return true
        if (path.includes('Debug-iphonesimulator')) return true
        return false
      })
      mockReaddirSync.mockImplementation((p) => {
        const path = String(p)
        if (path.endsWith(`${sep}ios`)) return ['MyApp.xcworkspace'] as any
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

  describe('build (android)', () => {
    it('throws on missing android/ directory', async () => {
      mockExistsSync.mockReturnValue(false)
      const adapter = new ReactNativeAdapter({
        projectRoot: '/tmp/test-project',
        bundleId: 'com.example.app',
        platform: 'android',
      })
      await expect(adapter.build()).rejects.toThrow(ScoutEnvironmentError)
      await expect(adapter.build()).rejects.toThrow('android/')
    })

    it('throws when the Gradle wrapper is missing', async () => {
      mockExistsSync.mockImplementation((p) => String(p).endsWith(`${sep}android`))
      const adapter = new ReactNativeAdapter({
        projectRoot: '/tmp/test-project',
        bundleId: 'com.example.app',
        platform: 'android',
      })
      await expect(adapter.build()).rejects.toThrow(ScoutEnvironmentError)
      await expect(adapter.build()).rejects.toThrow('Gradle wrapper')
    })

    it('runs gradlew assembleDebug in the android dir and returns the apk path', async () => {
      mockExistsSync.mockReturnValue(true)
      const adapter = new ReactNativeAdapter({
        projectRoot: '/tmp/test-project',
        bundleId: 'com.example.app',
        platform: 'android',
      })
      const result = await adapter.build()

      const call = mockExecFileSync.mock.calls[0]
      expect(String(call[0])).toContain('gradlew')
      expect(String(call[0])).not.toContain('.bat')
      expect(call[1]).toEqual(['assembleDebug'])
      expect((call[2] as { cwd?: string }).cwd).toContain(`${sep}android`)
      expect((call[2] as { timeout?: number }).timeout).toBe(300000)
      expect(result).toContain(
        ['app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk'].join(sep),
      )
    })

    it('uses gradlew.bat on win32', async () => {
      mockPlatform.mockReturnValue('win32')
      mockExistsSync.mockReturnValue(true)
      const adapter = new ReactNativeAdapter({
        projectRoot: '/tmp/test-project',
        bundleId: 'com.example.app',
        platform: 'android',
      })
      await adapter.build()

      expect(String(mockExecFileSync.mock.calls[0][0])).toContain('gradlew.bat')
    })

    it('throws when the apk is not produced', async () => {
      // android/ + gradlew exist, but the output apk does not
      mockExistsSync.mockImplementation((p) => {
        const path = String(p)
        return path.endsWith(`${sep}android`) || path.endsWith('gradlew')
      })
      const adapter = new ReactNativeAdapter({
        projectRoot: '/tmp/test-project',
        bundleId: 'com.example.app',
        platform: 'android',
      })
      await expect(adapter.build()).rejects.toThrow('APK not found')
    })

    it('defaults to the ios path when platform is unset', async () => {
      mockExistsSync.mockReturnValue(false)
      const adapter = new ReactNativeAdapter({
        projectRoot: '/tmp/test-project',
        bundleId: 'com.example.app',
      })
      await expect(adapter.build()).rejects.toThrow('ios/')
    })
  })
})
