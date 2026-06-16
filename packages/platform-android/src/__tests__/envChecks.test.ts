import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ScoutEnvironmentError } from '@scout-mobile/core'

vi.mock('node:os', () => ({
  platform: vi.fn(),
}))

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
}))

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}))

import { platform } from 'node:os'
import { existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import {
  resolveTool,
  androidHome,
  checkAndroidSdk,
  checkAdb,
  checkEmulator,
  checkAvd,
  assertAdbInstalled,
  runAllChecks,
} from '../envChecks.js'

const mockPlatform = vi.mocked(platform)
const mockExistsSync = vi.mocked(existsSync)
const mockExecFileSync = vi.mocked(execFileSync)

const ORIGINAL_ENV = { ...process.env }

beforeEach(() => {
  vi.clearAllMocks()
  mockPlatform.mockReturnValue('darwin')
  delete process.env.ANDROID_HOME
  delete process.env.ANDROID_SDK_ROOT
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe('androidHome', () => {
  it('prefers ANDROID_HOME', () => {
    process.env.ANDROID_HOME = '/home/sdk'
    process.env.ANDROID_SDK_ROOT = '/other/sdk'
    expect(androidHome()).toBe('/home/sdk')
  })

  it('falls back to ANDROID_SDK_ROOT', () => {
    process.env.ANDROID_SDK_ROOT = '/other/sdk'
    expect(androidHome()).toBe('/other/sdk')
  })

  it('returns undefined when neither set', () => {
    expect(androidHome()).toBeUndefined()
  })
})

describe('resolveTool', () => {
  it('resolves adb under platform-tools when ANDROID_HOME set', () => {
    process.env.ANDROID_HOME = '/home/sdk'
    mockPlatform.mockReturnValue('linux')
    mockExistsSync.mockReturnValue(true)
    // Build the expected value with the real join() so the assertion uses the
    // host separator (resolveTool uses node:path internally) — keeps this green
    // on the Windows CI runner.
    expect(resolveTool('adb')).toBe(join('/home/sdk', 'platform-tools', 'adb'))
  })

  it('resolves emulator under emulator/ dir', () => {
    process.env.ANDROID_HOME = '/home/sdk'
    mockPlatform.mockReturnValue('linux')
    mockExistsSync.mockReturnValue(true)
    expect(resolveTool('emulator')).toBe(join('/home/sdk', 'emulator', 'emulator'))
  })

  it('appends .exe on win32', () => {
    process.env.ANDROID_HOME = 'C:\\sdk'
    mockPlatform.mockReturnValue('win32')
    mockExistsSync.mockReturnValue(true)
    expect(resolveTool('adb')).toContain('adb.exe')
    expect(resolveTool('emulator')).toContain('emulator.exe')
  })

  it('falls back to bare command when SDK path missing', () => {
    process.env.ANDROID_HOME = '/home/sdk'
    mockExistsSync.mockReturnValue(false)
    expect(resolveTool('adb')).toBe('adb')
  })

  it('falls back to bare command when ANDROID_HOME unset', () => {
    expect(resolveTool('adb')).toBe('adb')
  })
})

describe('checkAndroidSdk', () => {
  it('returns ok when ANDROID_HOME exists', () => {
    process.env.ANDROID_HOME = '/home/sdk'
    mockExistsSync.mockReturnValue(true)
    const result = checkAndroidSdk()
    expect(result.ok).toBe(true)
  })

  it('returns not ok when unset', () => {
    const result = checkAndroidSdk()
    expect(result.ok).toBe(false)
    expect(result.hint).toContain('ANDROID_HOME')
  })

  it('returns not ok when path missing', () => {
    process.env.ANDROID_HOME = '/home/sdk'
    mockExistsSync.mockReturnValue(false)
    const result = checkAndroidSdk()
    expect(result.ok).toBe(false)
  })
})

describe('checkAdb', () => {
  it('returns ok when adb version succeeds', () => {
    mockExecFileSync.mockReturnValue(Buffer.from(''))
    expect(checkAdb().ok).toBe(true)
  })

  it('returns not ok when adb missing', () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('not found')
    })
    const result = checkAdb()
    expect(result.ok).toBe(false)
    expect(result.hint).toContain('platform-tools')
  })
})

describe('checkEmulator', () => {
  it('returns ok when emulator -version succeeds', () => {
    mockExecFileSync.mockReturnValue(Buffer.from(''))
    expect(checkEmulator().ok).toBe(true)
  })

  it('returns not ok when emulator missing', () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('not found')
    })
    expect(checkEmulator().ok).toBe(false)
  })
})

describe('checkAvd', () => {
  it('returns ok and lists AVDs', () => {
    mockExecFileSync.mockReturnValue('Pixel_7_API_34\nPixel_Fold_API_35\n' as never)
    const result = checkAvd()
    expect(result.ok).toBe(true)
    expect(result.message).toContain('Pixel_7_API_34')
  })

  it('returns not ok when no AVDs', () => {
    mockExecFileSync.mockReturnValue('' as never)
    expect(checkAvd().ok).toBe(false)
  })

  it('returns not ok when listing throws', () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('no emulator')
    })
    expect(checkAvd().ok).toBe(false)
  })

  it('filters out emulator diagnostic noise from the AVD list', () => {
    mockExecFileSync.mockReturnValue(
      'INFO    | Storing crashdata in: /tmp/x, detection enabled\nPixel_Fold_API_35\n' as never,
    )
    const result = checkAvd()
    expect(result.ok).toBe(true)
    expect(result.message).toContain('Pixel_Fold_API_35')
    expect(result.message).not.toContain('INFO')
    expect(result.message).toContain('1 AVD(s)')
  })
})

describe('assertAdbInstalled', () => {
  it('does not throw when adb available', () => {
    mockExecFileSync.mockReturnValue(Buffer.from(''))
    expect(() => assertAdbInstalled()).not.toThrow()
  })

  it('throws ScoutEnvironmentError when adb missing', () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('not found')
    })
    expect(() => assertAdbInstalled()).toThrow(ScoutEnvironmentError)
  })
})

describe('runAllChecks', () => {
  it('is ok when SDK + adb present (emulator/avd optional)', () => {
    process.env.ANDROID_HOME = '/home/sdk'
    mockExistsSync.mockReturnValue(true)
    // adb ok, emulator/avd fail — should still be overall ok
    mockExecFileSync.mockImplementation((cmd, args) => {
      const a = args as string[]
      if (a[0] === 'version') return Buffer.from('') // adb version
      throw new Error('emulator missing')
    })
    const report = runAllChecks()
    expect(report.ok).toBe(true)
    expect(report.checks.length).toBe(4)
  })

  it('is not ok when adb missing', () => {
    process.env.ANDROID_HOME = '/home/sdk'
    mockExistsSync.mockReturnValue(true)
    mockExecFileSync.mockImplementation(() => {
      throw new Error('missing')
    })
    expect(runAllChecks().ok).toBe(false)
  })

  it('is not ok when SDK missing even if adb on PATH', () => {
    mockExistsSync.mockReturnValue(false)
    mockExecFileSync.mockReturnValue(Buffer.from(''))
    expect(runAllChecks().ok).toBe(false)
  })
})
