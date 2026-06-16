import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}))

import { execFileSync } from 'node:child_process'
import {
  parseWmSize,
  lookupFallbackDimensions,
  getDeviceDimensions,
} from '../deviceDimensions.js'

const mockExecFileSync = vi.mocked(execFileSync)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('parseWmSize', () => {
  it('parses Physical size output', () => {
    expect(parseWmSize('Physical size: 1080x2400')).toEqual({ width: 1080, height: 2400 })
  })

  it('prefers Override size when present', () => {
    const out = 'Physical size: 1080x2400\nOverride size: 720x1600'
    expect(parseWmSize(out)).toEqual({ width: 720, height: 1600 })
  })

  it('returns undefined for unparseable output', () => {
    expect(parseWmSize('nonsense')).toBeUndefined()
    expect(parseWmSize('')).toBeUndefined()
  })
})

describe('lookupFallbackDimensions', () => {
  it('returns exact match', () => {
    expect(lookupFallbackDimensions('Pixel_7')).toEqual({ width: 1080, height: 2400 })
  })

  it('does longest-substring match', () => {
    expect(lookupFallbackDimensions('Pixel_7_Pro_API_34')).toEqual({ width: 1440, height: 3120 })
  })

  it('returns undefined for unknown AVD', () => {
    expect(lookupFallbackDimensions('Nexus_One')).toBeUndefined()
  })
})

describe('getDeviceDimensions', () => {
  it('queries adb shell wm size with the serial', () => {
    mockExecFileSync.mockReturnValue('Physical size: 1080x2400' as never)
    const dims = getDeviceDimensions('emulator-5554', '/sdk/adb')
    expect(dims).toEqual({ width: 1080, height: 2400 })
    expect(mockExecFileSync).toHaveBeenCalledWith(
      '/sdk/adb',
      ['-s', 'emulator-5554', 'shell', 'wm', 'size'],
      { encoding: 'utf-8' },
    )
  })

  it('returns {0,0} when the command throws', () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('device offline')
    })
    expect(getDeviceDimensions('emulator-5554', 'adb')).toEqual({ width: 0, height: 0 })
  })

  it('returns {0,0} when output is unparseable', () => {
    mockExecFileSync.mockReturnValue('garbage' as never)
    expect(getDeviceDimensions('emulator-5554', 'adb')).toEqual({ width: 0, height: 0 })
  })
})
