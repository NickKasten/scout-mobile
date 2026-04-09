import { execFileSync, spawn } from 'node:child_process'
import { readFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import type { PlatformAdapter, EnvironmentReport, Point, DeviceInfo, BootResult, AccessibilityTree, AccessibilityElement, LogStreamOptions } from '@scout-mobile/core'
import { ScoutEnvironmentError, ScoutValidationError, validateBundleId, validateDeviceName, validateTextInput, validateKeyName, isUdid, validateAccessibilityLabel } from '@scout-mobile/core'
import { assertMacOS, assertIdbInstalled, runAllChecks } from './envChecks.js'
import { lookupDimensions } from './deviceDimensions.js'

const DEFAULT_DEVICE = 'iPhone 17 Pro'
const MAX_SCREENSHOT_DELAY_MS = 5000

// HID usage keycodes for idb ui key (takes integer codes, not string names)
const HID_KEYCODES: Record<string, number> = {
  return: 40,
  tab: 43,
  space: 44,
  deleteBackspace: 42,
  delete: 76,
  escape: 41,
  upArrow: 82,
  downArrow: 81,
  leftArrow: 80,
  rightArrow: 79,
  home: 74,
  end: 77,
  pageUp: 75,
  pageDown: 78,
}

interface SimctlDevice {
  udid: string
  state: string
  name: string
}

function validateCoordinate(value: number, name: string): number {
  if (value < 0) {
    throw new ScoutValidationError(`${name} must be non-negative, got ${value}`)
  }
  return Math.round(value)
}

/**
 * Query all devices from simctl (booted and shutdown) with their runtime keys.
 */
function getAllDevices(): Array<SimctlDevice & { runtime: string }> {
  const json = execFileSync('xcrun', ['simctl', 'list', 'devices', '-j'], {
    encoding: 'utf-8',
  })
  const data = JSON.parse(json)
  const result: Array<SimctlDevice & { runtime: string }> = []
  for (const [runtime, devices] of Object.entries(data.devices) as Array<[string, SimctlDevice[]]>) {
    for (const device of devices) {
      result.push({ ...device, runtime })
    }
  }
  return result
}

/**
 * Query only booted devices.
 */
function getAllBootedDevices(): Array<SimctlDevice & { runtime: string }> {
  return getAllDevices().filter((d) => d.state === 'Booted')
}

/**
 * Parse runtime version from simctl runtime string.
 * e.g. "com.apple.CoreSimulator.SimRuntime.iOS-18-0" → [18, 0, 0]
 */
export function extractRuntimeVersion(runtime: string): [number, number, number] {
  // Match trailing version numbers like "iOS-18-0" or "iOS-26-2"
  const match = runtime.match(/(\d+)-(\d+)(?:-(\d+))?$/)
  if (!match) return [0, 0, 0]
  return [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)]
}

/**
 * Select the device with the highest runtime version from a list.
 */
function selectHighestRuntime<T extends { runtime: string }>(devices: T[]): T {
  return devices.sort((a, b) => {
    const va = extractRuntimeVersion(a.runtime)
    const vb = extractRuntimeVersion(b.runtime)
    for (let i = 0; i < 3; i++) {
      if (va[i] !== vb[i]) return vb[i] - va[i]
    }
    return 0
  })[0]
}

export function parseAccessibilityOutput(raw: string): AccessibilityElement[] {
  if (!raw.trim()) return []

  // Try parsing as a single JSON array first
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      return parsed.map(normalizeElement)
    }
    // Single object
    return [normalizeElement(parsed)]
  } catch {
    // Fall through to newline-delimited JSON
  }

  // Newline-delimited JSON (some idb versions output one object per line)
  const elements: AccessibilityElement[] = []
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      elements.push(normalizeElement(JSON.parse(trimmed)))
    } catch {
      // Skip unparseable lines
    }
  }
  return elements
}

function normalizeElement(obj: Record<string, unknown>): AccessibilityElement {
  const name = String(obj['AXLabel'] ?? obj['label'] ?? obj['name'] ?? obj['accessibilityLabel'] ?? '')
  const type = String(obj['AXType'] ?? obj['type'] ?? obj['role'] ?? '')
  const value = obj['AXValue'] ?? obj['value']

  // Prefer 'frame' (object) over 'AXFrame' (often a string like "{{0,0},{w,h}}")
  const frame = normalizeFrame(obj['frame'] ?? obj['rect'] ?? obj['AXFrame'] ?? {})

  let children: AccessibilityElement[] | undefined
  const rawChildren = obj['AXChildren'] ?? obj['children']
  if (Array.isArray(rawChildren) && rawChildren.length > 0) {
    children = rawChildren.map(normalizeElement)
  }

  return {
    type,
    name,
    ...(value !== undefined && value !== null ? { value: String(value) } : {}),
    frame,
    ...(children ? { children } : {}),
  }
}

function normalizeFrame(raw: unknown): { x: number; y: number; width: number; height: number } {
  if (typeof raw === 'object' && raw !== null) {
    const f = raw as Record<string, unknown>
    return {
      x: Number(f['x'] ?? f['X'] ?? 0),
      y: Number(f['y'] ?? f['Y'] ?? 0),
      width: Number(f['width'] ?? f['Width'] ?? f['w'] ?? 0),
      height: Number(f['height'] ?? f['Height'] ?? f['h'] ?? 0),
    }
  }
  return { x: 0, y: 0, width: 0, height: 0 }
}

function formatAccessibilityTree(elements: AccessibilityElement[], indent: number = 0): string {
  const lines: string[] = []
  const prefix = '  '.repeat(indent)
  for (const el of elements) {
    const label = el.name ? ` "${el.name}"` : ''
    const val = el.value ? ` value="${el.value}"` : ''
    const pos = `at (${el.frame.x}, ${el.frame.y}) size ${el.frame.width}x${el.frame.height}`
    lines.push(`${prefix}[${el.type}]${label}${val} ${pos}`)
    if (el.children) {
      lines.push(formatAccessibilityTree(el.children, indent + 1))
    }
  }
  return lines.join('\n')
}

/**
 * Depth-first search for an element matching a label.
 */
function findElementByLabel(elements: AccessibilityElement[], label: string): AccessibilityElement | undefined {
  for (const el of elements) {
    if (el.name === label) return el
    if (el.children) {
      const found = findElementByLabel(el.children, label)
      if (found) return found
    }
  }
  return undefined
}

export class IOSSimulatorAdapter implements PlatformAdapter {
  private deviceInfo: DeviceInfo | undefined

  getDeviceInfo(): DeviceInfo | undefined {
    return this.deviceInfo
  }

  /**
   * Resolve the UDID for the target device.
   * If boot() was called, returns the stored UDID.
   * Otherwise queries simctl — errors if 0 or >1 booted devices.
   */
  private requireUdid(): string {
    if (this.deviceInfo) return this.deviceInfo.udid

    const booted = getAllBootedDevices()
    if (booted.length === 0) {
      throw new ScoutEnvironmentError('No booted simulator found. Call boot() first or boot a simulator manually.')
    }
    if (booted.length > 1) {
      const names = booted.map((d) => `${d.name} (${d.udid})`).join(', ')
      throw new ScoutEnvironmentError(
        `Multiple booted simulators found: ${names}. Call boot() with a specific device name or UDID to target one.`,
      )
    }
    return booted[0].udid
  }

  async checkEnvironment(): Promise<EnvironmentReport> {
    return runAllChecks()
  }

  async boot(device?: string): Promise<BootResult> {
    assertMacOS()
    const identifier = device ?? DEFAULT_DEVICE

    let targetUdid: string
    let targetName: string

    if (isUdid(identifier)) {
      // Boot by UDID directly
      targetUdid = identifier
      try {
        execFileSync('xcrun', ['simctl', 'boot', targetUdid], { stdio: 'ignore' })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (!message.includes('current state: Booted')) {
          throw error
        }
      }
      // Look up the device name from simctl
      const all = getAllDevices()
      const found = all.find((d) => d.udid === targetUdid)
      targetName = found?.name ?? 'Unknown Device'
    } else {
      // Boot by name — validate and resolve
      const deviceName = validateDeviceName(identifier)
      const allDevices = getAllDevices()
      const matches = allDevices.filter((d) => d.name === deviceName)

      if (matches.length === 0) {
        // Let simctl handle the error for unknown device names
        try {
          execFileSync('xcrun', ['simctl', 'boot', deviceName], { stdio: 'ignore' })
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          if (!message.includes('current state: Booted')) {
            throw error
          }
        }
        // Re-query to get UDID
        const booted = getAllBootedDevices().filter((d) => d.name === deviceName)
        if (booted.length === 0) {
          throw new ScoutEnvironmentError(`Device "${deviceName}" not found`)
        }
        targetUdid = booted[0].udid
        targetName = booted[0].name
      } else if (matches.length === 1) {
        targetUdid = matches[0].udid
        targetName = matches[0].name
        try {
          execFileSync('xcrun', ['simctl', 'boot', targetUdid], { stdio: 'ignore' })
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          if (!message.includes('current state: Booted')) {
            throw error
          }
        }
      } else {
        // Multiple devices with same name — pick highest runtime
        const best = selectHighestRuntime(matches)
        targetUdid = best.udid
        targetName = best.name
        try {
          execFileSync('xcrun', ['simctl', 'boot', targetUdid], { stdio: 'ignore' })
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          if (!message.includes('current state: Booted')) {
            throw error
          }
        }
      }
    }

    const dims = lookupDimensions(targetName)
    this.deviceInfo = {
      udid: targetUdid,
      name: targetName,
      width: dims?.width ?? 0,
      height: dims?.height ?? 0,
    }

    // Check for other booted devices and warn
    const warnings: string[] = []
    const allBooted = getAllBootedDevices()
    const otherBooted = allBooted.filter((d) => d.udid !== targetUdid)
    if (otherBooted.length > 0) {
      const names = otherBooted.map((d) => `${d.name} (${d.udid})`).join(', ')
      warnings.push(
        `${otherBooted.length} other simulator(s) also booted: ${names}. Scout will target ${targetName} (${targetUdid}).`,
      )
    }

    return { ...this.deviceInfo, ...(warnings.length > 0 ? { warnings } : {}) }
  }

  async screenshot(options?: { delayMs?: number }): Promise<{ data: string; mimeType: string }> {
    assertMacOS()
    const udid = this.requireUdid()

    if (options?.delayMs && options.delayMs > 0) {
      const delay = Math.min(options.delayMs, MAX_SCREENSHOT_DELAY_MS)
      await new Promise((resolve) => setTimeout(resolve, delay))
    }

    const tmpDir = mkdtempSync(join(tmpdir(), 'scout-'))
    const tmpPath = join(tmpDir, 'screenshot.png')
    try {
      execFileSync('xcrun', ['simctl', 'io', udid, 'screenshot', tmpPath], {
        stdio: 'ignore',
      })
      const buffer = readFileSync(tmpPath)
      return { data: buffer.toString('base64'), mimeType: 'image/png' }
    } finally {
      rmSync(tmpDir, { recursive: true, force: true })
    }
  }

  async install(appPath: string): Promise<void> {
    assertMacOS()
    const udid = this.requireUdid()
    if (!appPath.endsWith('.app')) {
      throw new ScoutValidationError(`App path must end with .app, got: ${appPath}`)
    }
    const resolvedPath = resolve(appPath)
    if (!existsSync(resolvedPath)) {
      throw new ScoutValidationError(`App not found at path: ${resolvedPath}`)
    }
    execFileSync('xcrun', ['simctl', 'install', udid, resolvedPath], { stdio: 'ignore' })
  }

  async launch(bundleId: string): Promise<void> {
    assertMacOS()
    validateBundleId(bundleId)
    const udid = this.requireUdid()
    execFileSync('xcrun', ['simctl', 'launch', udid, bundleId], { stdio: 'ignore' })
  }

  private validateBounds(x: number, y: number): void {
    if (this.deviceInfo && this.deviceInfo.width > 0 && this.deviceInfo.height > 0) {
      if (x > this.deviceInfo.width) {
        throw new ScoutValidationError(
          `x coordinate ${x} exceeds screen width ${this.deviceInfo.width} for ${this.deviceInfo.name}`,
        )
      }
      if (y > this.deviceInfo.height) {
        throw new ScoutValidationError(
          `y coordinate ${y} exceeds screen height ${this.deviceInfo.height} for ${this.deviceInfo.name}`,
        )
      }
    }
  }

  async tap(point: Point): Promise<void> {
    assertMacOS()
    assertIdbInstalled()
    const x = validateCoordinate(point.x, 'x')
    const y = validateCoordinate(point.y, 'y')
    this.validateBounds(x, y)
    const udid = this.requireUdid()
    execFileSync('idb', ['ui', 'tap', String(x), String(y), '--udid', udid], { stdio: 'ignore' })
  }

  async swipe(from: Point, to: Point): Promise<void> {
    assertMacOS()
    assertIdbInstalled()
    const x1 = validateCoordinate(from.x, 'startX')
    const y1 = validateCoordinate(from.y, 'startY')
    const x2 = validateCoordinate(to.x, 'endX')
    const y2 = validateCoordinate(to.y, 'endY')
    this.validateBounds(x1, y1)
    this.validateBounds(x2, y2)
    const udid = this.requireUdid()
    execFileSync(
      'idb',
      ['ui', 'swipe', String(x1), String(y1), String(x2), String(y2), '--duration', '0.5', '--udid', udid],
      { stdio: 'ignore' },
    )
  }

  async logStream(callback: (line: string) => void, options?: LogStreamOptions): Promise<{ stop: () => void }> {
    assertMacOS()
    const udid = this.requireUdid()

    const args = ['simctl', 'spawn', udid, 'log', 'stream', '--style', 'compact']

    if (options?.processName) {
      // Validate process name has safe characters (reuse device name regex pattern)
      validateDeviceName(options.processName)
      args.push('--predicate', `process == "${options.processName}"`)
    } else if (options?.bundleId) {
      validateBundleId(options.bundleId)
      // Derive process name from last component of bundle ID
      const parts = options.bundleId.split('.')
      const processName = parts[parts.length - 1]
      args.push('--predicate', `process == "${processName}"`)
    }

    const child = spawn('xcrun', args, {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    const rl = createInterface({ input: child.stdout! })
    rl.on('line', callback)

    return {
      stop: () => {
        rl.close()
        child.kill('SIGTERM')
      },
    }
  }

  async typeText(text: string): Promise<void> {
    assertMacOS()
    assertIdbInstalled()
    validateTextInput(text)
    const udid = this.requireUdid()
    execFileSync('idb', ['ui', 'text', text, '--udid', udid], { stdio: 'ignore' })
  }

  async pressKey(key: string): Promise<void> {
    assertMacOS()
    assertIdbInstalled()
    validateKeyName(key)
    const keycode = HID_KEYCODES[key]
    const udid = this.requireUdid()
    execFileSync('idb', ['ui', 'key', String(keycode), '--udid', udid], { stdio: 'ignore' })
  }

  async clearText(): Promise<void> {
    assertMacOS()
    assertIdbInstalled()
    const udid = this.requireUdid()

    // Try to find a focused text field via accessibility tree
    let deleteCount = 50 // conservative default
    try {
      const tree = await this.accessibilityTree()
      const textField = findTextFieldWithValue(tree.elements)
      if (textField) {
        if (textField.frame.width > 0 && textField.frame.height > 0) {
          // Triple-tap to select all, then delete
          const cx = Math.round(textField.frame.x + textField.frame.width / 2)
          const cy = Math.round(textField.frame.y + textField.frame.height / 2)
          this.validateBounds(cx, cy)
          for (let i = 0; i < 3; i++) {
            execFileSync('idb', ['ui', 'tap', String(cx), String(cy), '--udid', udid], { stdio: 'ignore' })
          }
          execFileSync('idb', ['ui', 'key', String(HID_KEYCODES['deleteBackspace']), '--udid', udid], { stdio: 'ignore' })
          return
        }
        // Has value but no valid frame — use value length
        if (textField.value) {
          deleteCount = textField.value.length
        }
      }
    } catch {
      // Accessibility query failed — fall through to blind delete
    }

    // Fallback: press deleteBackspace N times
    const deleteKeycode = String(HID_KEYCODES['deleteBackspace'])
    for (let i = 0; i < deleteCount; i++) {
      execFileSync('idb', ['ui', 'key', deleteKeycode, '--udid', udid], { stdio: 'ignore' })
    }
  }

  async tapElement(label: string): Promise<{ element: AccessibilityElement }> {
    assertMacOS()
    assertIdbInstalled()
    validateAccessibilityLabel(label)
    const udid = this.requireUdid()

    const tree = await this.accessibilityTree()
    const element = findElementByLabel(tree.elements, label)
    if (!element) {
      throw new ScoutValidationError(`No element found with label "${label}"`)
    }

    if (element.frame.width === 0 && element.frame.height === 0) {
      throw new ScoutValidationError(`Element "${label}" has zero-size frame and cannot be tapped`)
    }

    const cx = Math.round(element.frame.x + element.frame.width / 2)
    const cy = Math.round(element.frame.y + element.frame.height / 2)
    this.validateBounds(cx, cy)

    execFileSync('idb', ['ui', 'tap', String(cx), String(cy), '--udid', udid], { stdio: 'ignore' })
    return { element }
  }

  async accessibilityTree(): Promise<AccessibilityTree> {
    assertMacOS()
    assertIdbInstalled()
    const udid = this.requireUdid()
    const raw = execFileSync('idb', ['ui', 'describe-all', '--json', '--nested', '--udid', udid], {
      encoding: 'utf-8',
    })
    return { elements: parseAccessibilityOutput(raw), raw }
  }

  async teardown(): Promise<void> {
    const udid = this.deviceInfo?.udid
    try {
      execFileSync('xcrun', ['simctl', 'shutdown', udid ?? 'booted'], { stdio: 'ignore' })
    } catch {
      // Already shut down — swallow
    }
  }
}

/**
 * Find the first text field (TextField/SecureTextField/SearchField/TextArea) that has a value.
 */
function findTextFieldWithValue(elements: AccessibilityElement[]): AccessibilityElement | undefined {
  const textTypes = new Set(['TextField', 'SecureTextField', 'SearchField', 'TextArea', 'textField', 'secureTextField', 'searchField', 'textArea'])
  for (const el of elements) {
    if (textTypes.has(el.type) && el.value) return el
    if (el.children) {
      const found = findTextFieldWithValue(el.children)
      if (found) return found
    }
  }
  return undefined
}

export { formatAccessibilityTree }
