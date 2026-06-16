import { describe, it, expect } from 'vitest'
import { resolveTarget } from '../targetSelection.js'

describe('resolveTarget', () => {
  it('honors SCOUT_TARGET=ios over the OS default', () => {
    expect(resolveTarget({ SCOUT_TARGET: 'ios' }, 'linux')).toBe('ios')
    expect(resolveTarget({ SCOUT_TARGET: 'ios' }, 'win32')).toBe('ios')
  })

  it('honors SCOUT_TARGET=android over the OS default', () => {
    expect(resolveTarget({ SCOUT_TARGET: 'android' }, 'darwin')).toBe('android')
  })

  it('is case-insensitive and trims the env value', () => {
    expect(resolveTarget({ SCOUT_TARGET: '  Android  ' }, 'darwin')).toBe('android')
    expect(resolveTarget({ SCOUT_TARGET: 'IOS' }, 'linux')).toBe('ios')
  })

  it('ignores an unrecognized SCOUT_TARGET and falls back to OS default', () => {
    expect(resolveTarget({ SCOUT_TARGET: 'web' }, 'darwin')).toBe('ios')
    expect(resolveTarget({ SCOUT_TARGET: '' }, 'linux')).toBe('android')
  })

  it('defaults darwin to ios', () => {
    expect(resolveTarget({}, 'darwin')).toBe('ios')
  })

  it('defaults non-darwin platforms to android', () => {
    expect(resolveTarget({}, 'win32')).toBe('android')
    expect(resolveTarget({}, 'linux')).toBe('android')
  })
})
