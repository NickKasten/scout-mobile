import { describe, it, expect } from 'vitest'
import { lookupDimensions } from '../deviceDimensions.js'

describe('lookupDimensions', () => {
  it('returns exact match for known device', () => {
    const dims = lookupDimensions('iPhone 17 Pro')
    expect(dims).toEqual({ width: 402, height: 874 })
  })

  it('returns exact match for iPhone SE', () => {
    const dims = lookupDimensions('iPhone SE')
    expect(dims).toEqual({ width: 375, height: 667 })
  })

  it('returns exact match for iPad', () => {
    const dims = lookupDimensions('iPad Pro 13-inch (M4)')
    expect(dims).toEqual({ width: 1024, height: 1366 })
  })

  it('uses longest-substring match for suffixed names', () => {
    // Simulator may report "iPhone 17 Pro (18.0)" or similar
    const dims = lookupDimensions('iPhone 17 Pro (18.0)')
    expect(dims).toEqual({ width: 402, height: 874 })
  })

  it('prefers longest match when multiple substrings match', () => {
    // "iPhone 16 Pro Max" contains both "iPhone 16 Pro" and "iPhone 16 Pro Max"
    const dims = lookupDimensions('iPhone 16 Pro Max')
    expect(dims).toEqual({ width: 440, height: 956 })
  })

  it('returns undefined for unknown device', () => {
    const dims = lookupDimensions('Unknown Device XYZ')
    expect(dims).toBeUndefined()
  })

  it('returns undefined for empty string', () => {
    const dims = lookupDimensions('')
    expect(dims).toBeUndefined()
  })
})
