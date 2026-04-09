import { resolve } from 'node:path'
import { ScoutValidationError } from './errors.js'

const BUNDLE_ID_RE = /^[a-zA-Z0-9\-\.]+$/
const DEVICE_NAME_RE = /^[a-zA-Z0-9 ()\.\-]+$/
const FLOW_NAME_RE = /^[a-zA-Z0-9_\-]+$/

export function validateBundleId(id: string): string {
  if (!BUNDLE_ID_RE.test(id)) {
    throw new ScoutValidationError(`Invalid bundle ID: ${id}`)
  }
  return id
}

export function validateDeviceName(name: string): string {
  if (!DEVICE_NAME_RE.test(name)) {
    throw new ScoutValidationError(`Invalid device name: ${name}`)
  }
  return name
}

export function validateFlowName(name: string): string {
  if (!FLOW_NAME_RE.test(name)) {
    throw new ScoutValidationError(`Invalid flow name: ${name}`)
  }
  return name
}

export function safeResolvePath(baseDir: string, filename: string): string {
  const resolved = resolve(baseDir, filename)
  if (!resolved.startsWith(resolve(baseDir))) {
    throw new ScoutValidationError(`Path traversal detected: ${filename}`)
  }
  return resolved
}

// Printable ASCII (0x20-0x7E) plus tab (0x09) and newline (0x0A)
const PRINTABLE_RE = /^[\x09\x0A\x20-\x7E]+$/

export function validateTextInput(text: string): string {
  if (text.length === 0) {
    throw new ScoutValidationError('Text input must not be empty')
  }
  if (text.length > 1000) {
    throw new ScoutValidationError(`Text input too long (${text.length} chars, max 1000)`)
  }
  if (!PRINTABLE_RE.test(text)) {
    throw new ScoutValidationError('Text input contains invalid characters (printable ASCII, tab, and newline only)')
  }
  return text
}

const ALLOWED_KEYS = new Set([
  'return', 'tab', 'space', 'deleteBackspace', 'delete', 'escape',
  'upArrow', 'downArrow', 'leftArrow', 'rightArrow',
  'home', 'end', 'pageUp', 'pageDown',
])

export function validateKeyName(key: string): string {
  if (!ALLOWED_KEYS.has(key)) {
    throw new ScoutValidationError(
      `Invalid key name: "${key}". Allowed: ${[...ALLOWED_KEYS].join(', ')}`,
    )
  }
  return key
}

const UDID_RE = /^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/

export function isUdid(value: string): boolean {
  return UDID_RE.test(value)
}

export function validateDeviceIdentifier(value: string): string {
  if (!value) {
    throw new ScoutValidationError('Device identifier must not be empty')
  }
  if (isUdid(value)) return value
  return validateDeviceName(value)
}

const LABEL_RE = /^[\x20-\x7E]+$/

export function validateAccessibilityLabel(label: string): string {
  if (!label || label.length === 0) {
    throw new ScoutValidationError('Accessibility label must not be empty')
  }
  if (label.length > 200) {
    throw new ScoutValidationError(`Accessibility label too long (${label.length} chars, max 200)`)
  }
  if (!LABEL_RE.test(label)) {
    throw new ScoutValidationError('Accessibility label contains invalid characters (printable ASCII only)')
  }
  return label
}
