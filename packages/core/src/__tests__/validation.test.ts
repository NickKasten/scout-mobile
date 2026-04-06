import { describe, it, expect } from 'vitest'
import {
  validateBundleId,
  validateDeviceName,
  validateFlowName,
  safeResolvePath,
} from '../validation.js'
import { ScoutValidationError } from '../errors.js'

describe('validateBundleId', () => {
  it('accepts valid bundle IDs', () => {
    expect(validateBundleId('com.example.app')).toBe('com.example.app')
    expect(validateBundleId('com.my-app.test')).toBe('com.my-app.test')
    expect(validateBundleId('org.foo123.bar')).toBe('org.foo123.bar')
  })

  it('rejects bundle IDs with shell metacharacters', () => {
    expect(() => validateBundleId('com.example;rm -rf /')).toThrow(ScoutValidationError)
    expect(() => validateBundleId('com.$(whoami).app')).toThrow(ScoutValidationError)
    expect(() => validateBundleId('com.`id`.app')).toThrow(ScoutValidationError)
    expect(() => validateBundleId('com.example app')).toThrow(ScoutValidationError)
  })

  it('rejects empty string', () => {
    expect(() => validateBundleId('')).toThrow(ScoutValidationError)
  })
})

describe('validateDeviceName', () => {
  it('accepts valid device names', () => {
    expect(validateDeviceName('iPhone 16 Pro')).toBe('iPhone 16 Pro')
    expect(validateDeviceName('iPad Air (5th generation)')).toBe('iPad Air (5th generation)')
    expect(validateDeviceName('iPhone-15')).toBe('iPhone-15')
  })

  it('rejects device names with dangerous characters', () => {
    expect(() => validateDeviceName('iPhone;rm -rf /')).toThrow(ScoutValidationError)
    expect(() => validateDeviceName('iPhone&whoami')).toThrow(ScoutValidationError)
    expect(() => validateDeviceName('iPhone|cat /etc/passwd')).toThrow(ScoutValidationError)
  })

  it('rejects empty string', () => {
    expect(() => validateDeviceName('')).toThrow(ScoutValidationError)
  })
})

describe('validateFlowName', () => {
  it('accepts valid flow names', () => {
    expect(validateFlowName('login-flow')).toBe('login-flow')
    expect(validateFlowName('test_flow_1')).toBe('test_flow_1')
  })

  it('rejects flow names with spaces or special chars', () => {
    expect(() => validateFlowName('my flow')).toThrow(ScoutValidationError)
    expect(() => validateFlowName('flow;hack')).toThrow(ScoutValidationError)
  })
})

describe('safeResolvePath', () => {
  it('resolves valid paths within base dir', () => {
    const result = safeResolvePath('/home/user/project', 'reports/test.png')
    expect(result).toBe('/home/user/project/reports/test.png')
  })

  it('rejects path traversal attempts', () => {
    expect(() => safeResolvePath('/home/user/project', '../etc/passwd')).toThrow(
      ScoutValidationError,
    )
    expect(() => safeResolvePath('/home/user/project', '../../root/.ssh/id_rsa')).toThrow(
      ScoutValidationError,
    )
  })

  it('rejects absolute path escape', () => {
    expect(() => safeResolvePath('/home/user/project', '/etc/passwd')).toThrow(
      ScoutValidationError,
    )
  })
})
