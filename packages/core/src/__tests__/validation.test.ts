import { describe, it, expect } from 'vitest'
import {
  validateBundleId,
  validateDeviceName,
  validateFlowName,
  safeResolvePath,
  validateTextInput,
  validateKeyName,
  isUdid,
  validateDeviceIdentifier,
  validateAccessibilityLabel,
} from '../validation.js'
import { resolve } from 'node:path'
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
    expect(validateDeviceName('iPhone 17 Pro')).toBe('iPhone 17 Pro')
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
    expect(result).toBe(resolve('/home/user/project', 'reports/test.png'))
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

describe('validateTextInput', () => {
  it('accepts normal printable text', () => {
    expect(validateTextInput('hello@example.com')).toBe('hello@example.com')
    expect(validateTextInput('Test 123!')).toBe('Test 123!')
  })

  it('accepts tabs and newlines', () => {
    expect(validateTextInput('line1\nline2')).toBe('line1\nline2')
    expect(validateTextInput('col1\tcol2')).toBe('col1\tcol2')
  })

  it('rejects empty string', () => {
    expect(() => validateTextInput('')).toThrow(ScoutValidationError)
    expect(() => validateTextInput('')).toThrow('empty')
  })

  it('rejects text exceeding 1000 chars', () => {
    const long = 'a'.repeat(1001)
    expect(() => validateTextInput(long)).toThrow(ScoutValidationError)
    expect(() => validateTextInput(long)).toThrow('too long')
  })

  it('accepts text at exactly 1000 chars', () => {
    const exact = 'a'.repeat(1000)
    expect(validateTextInput(exact)).toBe(exact)
  })

  it('rejects control characters', () => {
    expect(() => validateTextInput('hello\x00world')).toThrow(ScoutValidationError)
    expect(() => validateTextInput('test\x07bell')).toThrow(ScoutValidationError)
    expect(() => validateTextInput('\x1b[31mred')).toThrow(ScoutValidationError)
  })
})

describe('validateKeyName', () => {
  it('accepts all valid key names', () => {
    const validKeys = ['return', 'tab', 'space', 'deleteBackspace', 'delete', 'escape',
      'upArrow', 'downArrow', 'leftArrow', 'rightArrow', 'home', 'end', 'pageUp', 'pageDown']
    for (const key of validKeys) {
      expect(validateKeyName(key)).toBe(key)
    }
  })

  it('rejects invalid key names', () => {
    expect(() => validateKeyName('enter')).toThrow(ScoutValidationError)
    expect(() => validateKeyName('ctrl+c')).toThrow(ScoutValidationError)
    expect(() => validateKeyName('F1')).toThrow(ScoutValidationError)
  })

  it('rejects empty string', () => {
    expect(() => validateKeyName('')).toThrow(ScoutValidationError)
  })
})

describe('isUdid', () => {
  it('returns true for valid UUIDs', () => {
    expect(isUdid('AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE')).toBe(true)
    expect(isUdid('12345678-1234-1234-1234-123456789abc')).toBe(true)
    expect(isUdid('abcdef01-2345-6789-abcd-ef0123456789')).toBe(true)
  })

  it('returns false for non-UUID strings', () => {
    expect(isUdid('iPhone 17 Pro')).toBe(false)
    expect(isUdid('not-a-uuid')).toBe(false)
    expect(isUdid('')).toBe(false)
    expect(isUdid('AAAAAAAA-BBBB-CCCC-DDDD')).toBe(false)
  })
})

describe('validateDeviceIdentifier', () => {
  it('accepts valid UUIDs', () => {
    const udid = 'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE'
    expect(validateDeviceIdentifier(udid)).toBe(udid)
  })

  it('accepts valid device names', () => {
    expect(validateDeviceIdentifier('iPhone 17 Pro')).toBe('iPhone 17 Pro')
  })

  it('rejects empty string', () => {
    expect(() => validateDeviceIdentifier('')).toThrow(ScoutValidationError)
  })

  it('rejects invalid names/UUIDs', () => {
    expect(() => validateDeviceIdentifier('iPhone;rm -rf /')).toThrow(ScoutValidationError)
  })
})

describe('validateAccessibilityLabel', () => {
  it('accepts valid labels', () => {
    expect(validateAccessibilityLabel('Submit')).toBe('Submit')
    expect(validateAccessibilityLabel('OK Button')).toBe('OK Button')
    expect(validateAccessibilityLabel('Save & Continue')).toBe('Save & Continue')
  })

  it('rejects empty string', () => {
    expect(() => validateAccessibilityLabel('')).toThrow(ScoutValidationError)
  })

  it('rejects labels over 200 chars', () => {
    const long = 'a'.repeat(201)
    expect(() => validateAccessibilityLabel(long)).toThrow('too long')
  })

  it('accepts labels at exactly 200 chars', () => {
    const exact = 'a'.repeat(200)
    expect(validateAccessibilityLabel(exact)).toBe(exact)
  })

  it('rejects control characters', () => {
    expect(() => validateAccessibilityLabel('hello\x00world')).toThrow(ScoutValidationError)
    expect(() => validateAccessibilityLabel('test\nline')).toThrow(ScoutValidationError)
  })
})
