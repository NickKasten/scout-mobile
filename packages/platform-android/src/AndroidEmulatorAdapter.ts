import { execFileSync, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { createInterface } from 'node:readline'
import type {
  PlatformAdapter,
  AdapterMeta,
  EnvironmentReport,
  Point,
  DeviceInfo,
  BootResult,
  AccessibilityTree,
  AccessibilityElement,
  LogStreamOptions,
} from '@scout-mobile/core'
import {
  ScoutEnvironmentError,
  ScoutValidationError,
  validateBundleId,
  validateAvdName,
  validateAndroidSerial,
  validateTextInput,
  validateKeyName,
  validateAccessibilityLabel,
} from '@scout-mobile/core'
import { resolveTool, assertAdbInstalled, runAllChecks } from './envChecks.js'
import { getDeviceDimensions, lookupFallbackDimensions } from './deviceDimensions.js'
import { parseUiAutomatorXml, findElementByLabel } from './accessibilityParser.js'

const MAX_SCREENSHOT_DELAY_MS = 5000
const BOOT_TIMEOUT_MS = 120_000
const BOOT_POLL_INTERVAL_MS = 2000
const SWIPE_DURATION_MS = 500
// execFileSync defaults to a 1 MB stdout buffer, but a single high-resolution
// PNG screenshot (e.g. a 2208×1840 foldable) or a deep uiautomator XML dump
// easily exceeds that and throws ENOBUFS. Raise the cap for those two binary/
// large-text reads.
const MAX_CAPTURE_BUFFER = 64 * 1024 * 1024 // 64 MB

// Android keyevent codes for `adb shell input keyevent`.
const ANDROID_KEYCODES: Record<string, number> = {
  return: 66, // KEYCODE_ENTER
  tab: 61, // KEYCODE_TAB
  space: 62, // KEYCODE_SPACE
  deleteBackspace: 67, // KEYCODE_DEL
  delete: 112, // KEYCODE_FORWARD_DEL
  escape: 111, // KEYCODE_ESCAPE
  upArrow: 19, // KEYCODE_DPAD_UP
  downArrow: 20, // KEYCODE_DPAD_DOWN
  leftArrow: 21, // KEYCODE_DPAD_LEFT
  rightArrow: 22, // KEYCODE_DPAD_RIGHT
  home: 122, // KEYCODE_MOVE_HOME
  end: 123, // KEYCODE_MOVE_END
  pageUp: 92, // KEYCODE_PAGE_UP
  pageDown: 93, // KEYCODE_PAGE_DOWN
}

function validateCoordinate(value: number, name: string): number {
  if (value < 0) {
    throw new ScoutValidationError(`${name} must be non-negative, got ${value}`)
  }
  return Math.round(value)
}

/**
 * Escape text for `adb shell input text`. adb interprets spaces as argument
 * separators, so they must be encoded as %s. Other shell metacharacters are
 * rejected upstream by validateTextInput's allowlist, but we still encode the
 * handful that `input text` treats specially.
 */
export function escapeAdbText(text: string): string {
  return text.replace(/ /g, '%s')
}

// 8-byte PNG file signature.
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/**
 * Return the PNG portion of a screencap buffer. `adb exec-out screencap -p` can
 * prepend a textual warning (e.g. on multi-display foldables) before the actual
 * image bytes, so we locate the PNG signature and slice from there. If the
 * signature isn't found, the original buffer is returned unchanged.
 */
export function extractPng(buffer: Buffer): Buffer {
  const idx = buffer.indexOf(PNG_SIGNATURE)
  return idx > 0 ? buffer.subarray(idx) : buffer
}

/**
 * Parse `adb devices` output into a list of online device serials.
 * Example:
 *   List of devices attached
 *   emulator-5554   device
 *   emulator-5556   offline
 * → ['emulator-5554']
 */
export function parseAdbDevices(raw: string): string[] {
  const serials: string[] = []
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('List of devices')) continue
    const [serial, state] = trimmed.split(/\s+/)
    if (serial && state === 'device') serials.push(serial)
  }
  return serials
}

export class AndroidEmulatorAdapter implements PlatformAdapter {
  private deviceInfo: DeviceInfo | undefined
  private emulatorProc: ReturnType<typeof spawn> | undefined

  readonly meta: AdapterMeta = {
    displayName: 'Android Emulator',
    installArtifact: '.apk',
    gestureToolingNote: '',
  }

  getDeviceInfo(): DeviceInfo | undefined {
    return this.deviceInfo
  }

  private adb(): string {
    return resolveTool('adb')
  }

  /**
   * Resolve the target serial. If boot() was called, return the stored serial.
   * Otherwise query `adb devices` — error on 0 or >1 online devices.
   */
  private requireSerial(): string {
    if (this.deviceInfo) return this.deviceInfo.udid

    const serials = this.listDevices()
    if (serials.length === 0) {
      throw new ScoutEnvironmentError(
        'No running Android device found. Call boot() first or start an emulator manually.',
      )
    }
    if (serials.length > 1) {
      throw new ScoutEnvironmentError(
        `Multiple running devices found: ${serials.join(', ')}. Call boot() with a specific AVD/serial to target one.`,
      )
    }
    return serials[0]
  }

  private listDevices(): string[] {
    const out = execFileSync(this.adb(), ['devices'], { encoding: 'utf-8' })
    return parseAdbDevices(out)
  }

  async checkEnvironment(): Promise<EnvironmentReport> {
    return runAllChecks()
  }

  async boot(device?: string): Promise<BootResult> {
    assertAdbInstalled()

    // If `device` looks like a serial we already recognize, attach to it;
    // otherwise treat it as an AVD name and launch a fresh emulator.
    const before = this.listDevices()

    if (device && /^(emulator-\d+|[A-Za-z0-9._:-]*:\d+|[A-Za-z0-9]{6,})$/.test(device) && before.includes(device)) {
      // Already-running serial — just attach.
      validateAndroidSerial(device)
      return this.attachToSerial(device, device)
    }

    const avdName = validateAvdName(device ?? this.firstAvdOrThrow())

    // Launch the emulator (long-running → spawn, detached from our stdout).
    this.emulatorProc = spawn(
      resolveTool('emulator'),
      ['-avd', avdName, '-no-snapshot', '-no-boot-anim'],
      { stdio: 'ignore', detached: false },
    )

    // Poll for a newly-appeared, fully-booted device.
    const serial = await this.waitForBoot(before)
    return this.attachToSerial(serial, avdName)
  }

  private firstAvdOrThrow(): string {
    try {
      const out = execFileSync(resolveTool('emulator'), ['-list-avds'], { encoding: 'utf-8' })
      const avds = out.split('\n').map((l) => l.trim()).filter(Boolean)
      if (avds.length > 0) return avds[0]
    } catch {
      // Fall through
    }
    throw new ScoutEnvironmentError('No AVD specified and none could be discovered. Create one with avdmanager.')
  }

  /**
   * Wait until a device that was not in `before` reports sys.boot_completed=1.
   */
  private async waitForBoot(before: string[]): Promise<string> {
    const deadline = Date.now() + BOOT_TIMEOUT_MS
    while (Date.now() < deadline) {
      const now = this.listDevices()
      const candidates = now.filter((s) => !before.includes(s))
      // If exactly one new device appeared, prefer it; else consider all online.
      const pool = candidates.length > 0 ? candidates : now
      for (const serial of pool) {
        if (this.isBootCompleted(serial)) return serial
      }
      await new Promise((r) => setTimeout(r, BOOT_POLL_INTERVAL_MS))
    }
    throw new ScoutEnvironmentError(`Emulator did not finish booting within ${BOOT_TIMEOUT_MS / 1000}s`)
  }

  private isBootCompleted(serial: string): boolean {
    try {
      const out = execFileSync(this.adb(), ['-s', serial, 'shell', 'getprop', 'sys.boot_completed'], {
        encoding: 'utf-8',
      })
      return out.trim() === '1'
    } catch {
      return false
    }
  }

  private attachToSerial(serial: string, name: string): BootResult {
    validateAndroidSerial(serial)
    let dims = getDeviceDimensions(serial, this.adb())
    if (dims.width === 0 && dims.height === 0) {
      const fallback = lookupFallbackDimensions(name)
      if (fallback) dims = fallback
    }
    this.deviceInfo = { udid: serial, name, width: dims.width, height: dims.height }

    const warnings: string[] = []
    const allDevices = this.listDevices().filter((s) => s !== serial)
    if (allDevices.length > 0) {
      warnings.push(
        `${allDevices.length} other device(s) also running: ${allDevices.join(', ')}. Scout will target ${serial}.`,
      )
    }
    return { ...this.deviceInfo, ...(warnings.length > 0 ? { warnings } : {}) }
  }

  async screenshot(options?: { delayMs?: number }): Promise<{ data: string; mimeType: string }> {
    assertAdbInstalled()
    const serial = this.requireSerial()

    if (options?.delayMs && options.delayMs > 0) {
      const delay = Math.min(options.delayMs, MAX_SCREENSHOT_DELAY_MS)
      await new Promise((r) => setTimeout(r, delay))
    }

    // No `encoding` → raw Buffer (binary-safe on Windows; avoids CRLF mangling).
    const raw = execFileSync(this.adb(), ['-s', serial, 'exec-out', 'screencap', '-p'], {
      maxBuffer: MAX_CAPTURE_BUFFER,
    })
    // Some devices (e.g. foldables with multiple displays) prepend a textual
    // warning to stdout before the PNG bytes. Slice from the PNG signature so we
    // always return clean image data.
    const png = extractPng(raw)
    return { data: png.toString('base64'), mimeType: 'image/png' }
  }

  async install(appPath: string): Promise<void> {
    assertAdbInstalled()
    const serial = this.requireSerial()
    if (!appPath.endsWith('.apk')) {
      throw new ScoutValidationError(`App path must end with .apk, got: ${appPath}`)
    }
    const resolvedPath = resolve(appPath)
    if (!existsSync(resolvedPath)) {
      throw new ScoutValidationError(`APK not found at path: ${resolvedPath}`)
    }
    execFileSync(this.adb(), ['-s', serial, 'install', '-r', resolvedPath], { stdio: 'ignore' })
  }

  async launch(bundleId: string): Promise<void> {
    assertAdbInstalled()
    validateBundleId(bundleId)
    const serial = this.requireSerial()
    execFileSync(
      this.adb(),
      ['-s', serial, 'shell', 'monkey', '-p', bundleId, '-c', 'android.intent.category.LAUNCHER', '1'],
      { stdio: 'ignore' },
    )
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
    assertAdbInstalled()
    const x = validateCoordinate(point.x, 'x')
    const y = validateCoordinate(point.y, 'y')
    this.validateBounds(x, y)
    const serial = this.requireSerial()
    execFileSync(this.adb(), ['-s', serial, 'shell', 'input', 'tap', String(x), String(y)], {
      stdio: 'ignore',
    })
  }

  async swipe(from: Point, to: Point): Promise<void> {
    assertAdbInstalled()
    const x1 = validateCoordinate(from.x, 'startX')
    const y1 = validateCoordinate(from.y, 'startY')
    const x2 = validateCoordinate(to.x, 'endX')
    const y2 = validateCoordinate(to.y, 'endY')
    this.validateBounds(x1, y1)
    this.validateBounds(x2, y2)
    const serial = this.requireSerial()
    execFileSync(
      this.adb(),
      ['-s', serial, 'shell', 'input', 'swipe', String(x1), String(y1), String(x2), String(y2), String(SWIPE_DURATION_MS)],
      { stdio: 'ignore' },
    )
  }

  async logStream(callback: (line: string) => void, options?: LogStreamOptions): Promise<{ stop: () => void }> {
    assertAdbInstalled()
    const serial = this.requireSerial()

    const args = ['-s', serial, 'logcat', '-v', 'brief']
    if (options?.processName) {
      // logcat doesn't filter by process name directly; pass a tag-ish filter is
      // unreliable, so we filter in-process below instead. Keep args minimal.
    }

    const child = spawn(this.adb(), args, { stdio: ['ignore', 'pipe', 'ignore'] })
    const rl = createInterface({ input: child.stdout! })

    const filter = options?.processName
    rl.on('line', (line) => {
      if (filter && !line.includes(filter)) return
      callback(line)
    })

    return {
      stop: () => {
        rl.close()
        child.kill('SIGTERM')
      },
    }
  }

  async typeText(text: string): Promise<void> {
    assertAdbInstalled()
    validateTextInput(text)
    const serial = this.requireSerial()
    execFileSync(this.adb(), ['-s', serial, 'shell', 'input', 'text', escapeAdbText(text)], {
      stdio: 'ignore',
    })
  }

  async pressKey(key: string): Promise<void> {
    assertAdbInstalled()
    validateKeyName(key)
    const keycode = ANDROID_KEYCODES[key]
    const serial = this.requireSerial()
    execFileSync(this.adb(), ['-s', serial, 'shell', 'input', 'keyevent', String(keycode)], {
      stdio: 'ignore',
    })
  }

  async clearText(): Promise<void> {
    assertAdbInstalled()
    const serial = this.requireSerial()

    let deleteCount = 50 // conservative default
    try {
      const tree = await this.accessibilityTree()
      const focused = findFocusedTextWithValue(tree.elements)
      if (focused?.value) {
        deleteCount = focused.value.length
      }
    } catch {
      // Accessibility query failed — fall through to blind delete.
    }

    const delKeycode = String(ANDROID_KEYCODES['deleteBackspace'])
    for (let i = 0; i < deleteCount; i++) {
      execFileSync(this.adb(), ['-s', serial, 'shell', 'input', 'keyevent', delKeycode], {
        stdio: 'ignore',
      })
    }
  }

  async tapElement(label: string): Promise<{ element: AccessibilityElement }> {
    assertAdbInstalled()
    validateAccessibilityLabel(label)
    const serial = this.requireSerial()

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
    execFileSync(this.adb(), ['-s', serial, 'shell', 'input', 'tap', String(cx), String(cy)], {
      stdio: 'ignore',
    })
    return { element }
  }

  async accessibilityTree(): Promise<AccessibilityTree> {
    assertAdbInstalled()
    const serial = this.requireSerial()
    const raw = execFileSync(this.adb(), ['-s', serial, 'exec-out', 'uiautomator', 'dump', '/dev/tty'], {
      encoding: 'utf-8',
      maxBuffer: MAX_CAPTURE_BUFFER,
    })
    return { elements: parseUiAutomatorXml(raw), raw }
  }

  async teardown(): Promise<void> {
    const serial = this.deviceInfo?.udid
    if (!serial) return
    try {
      execFileSync(this.adb(), ['-s', serial, 'emu', 'kill'], { stdio: 'ignore' })
    } catch {
      // Already gone — swallow.
    }
  }
}

/**
 * Find the first focused EditText-like node that carries a text value.
 */
function findFocusedTextWithValue(elements: AccessibilityElement[]): AccessibilityElement | undefined {
  const textTypes = new Set(['EditText', 'AutoCompleteTextView', 'MultiAutoCompleteTextView', 'SearchView'])
  for (const el of elements) {
    if (textTypes.has(el.type) && el.value) return el
    if (el.children) {
      const found = findFocusedTextWithValue(el.children)
      if (found) return found
    }
  }
  return undefined
}
