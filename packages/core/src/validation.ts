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
