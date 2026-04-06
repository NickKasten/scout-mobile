import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ScoutEnvironmentError } from '@scout-mobile/core'

vi.mock('node:os', () => ({
  platform: vi.fn(),
}))

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}))

import { platform } from 'node:os'
import { execFileSync } from 'node:child_process'
import { checkMacOS, checkXcodeTools, checkIdb, assertMacOS, assertIdbInstalled } from '../envChecks.js'

const mockPlatform = vi.mocked(platform)
const mockExecFileSync = vi.mocked(execFileSync)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('checkMacOS', () => {
  it('returns ok on darwin', () => {
    mockPlatform.mockReturnValue('darwin')
    const result = checkMacOS()
    expect(result.ok).toBe(true)
    expect(result.name).toBe('macOS')
  })

  it('returns not ok on linux', () => {
    mockPlatform.mockReturnValue('linux')
    const result = checkMacOS()
    expect(result.ok).toBe(false)
    expect(result.hint).toBeDefined()
  })

  it('returns not ok on win32', () => {
    mockPlatform.mockReturnValue('win32')
    const result = checkMacOS()
    expect(result.ok).toBe(false)
  })
})

describe('checkXcodeTools', () => {
  it('returns ok when xcrun simctl succeeds', () => {
    mockExecFileSync.mockReturnValue(Buffer.from(''))
    const result = checkXcodeTools()
    expect(result.ok).toBe(true)
    expect(result.name).toBe('Xcode CLI Tools')
  })

  it('returns not ok when xcrun fails', () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('command not found')
    })
    const result = checkXcodeTools()
    expect(result.ok).toBe(false)
    expect(result.hint).toContain('xcode-select')
  })
})

describe('checkIdb', () => {
  it('returns ok when idb is found', () => {
    mockExecFileSync.mockReturnValue(Buffer.from(''))
    const result = checkIdb()
    expect(result.ok).toBe(true)
    expect(result.message).toBe('idb installed')
    expect(mockExecFileSync).toHaveBeenCalledWith('idb', ['--help'], { stdio: 'ignore' })
  })

  it('returns not ok when idb is not found', () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('command not found')
    })
    const result = checkIdb()
    expect(result.ok).toBe(false)
    expect(result.hint).toContain('Required')
    expect(result.hint).toContain('fb-idb')
  })
})

describe('assertMacOS', () => {
  it('does not throw on darwin', () => {
    mockPlatform.mockReturnValue('darwin')
    expect(() => assertMacOS()).not.toThrow()
  })

  it('throws ScoutEnvironmentError on non-darwin', () => {
    mockPlatform.mockReturnValue('linux')
    expect(() => assertMacOS()).toThrow(ScoutEnvironmentError)
  })
})

describe('assertIdbInstalled', () => {
  it('does not throw when idb is available', () => {
    mockExecFileSync.mockReturnValue(Buffer.from(''))
    expect(() => assertIdbInstalled()).not.toThrow()
    expect(mockExecFileSync).toHaveBeenCalledWith('idb', ['--help'], { stdio: 'ignore' })
  })

  it('throws ScoutEnvironmentError when idb is missing', () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('command not found')
    })
    expect(() => assertIdbInstalled()).toThrow(ScoutEnvironmentError)
    expect(() => {
      mockExecFileSync.mockImplementation(() => { throw new Error('command not found') })
      assertIdbInstalled()
    }).toThrow('fb-idb')
  })
})
