import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ScoutValidationError } from '@scout-mobile/core'

vi.mock('node:os', () => ({
  platform: vi.fn().mockReturnValue('darwin'),
}))

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
  spawn: vi.fn(),
}))

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
}))

vi.mock('node:readline', () => ({
  createInterface: vi.fn().mockReturnValue({
    on: vi.fn(),
    close: vi.fn(),
  }),
}))

import { execFileSync, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import {
  AndroidEmulatorAdapter,
  escapeAdbText,
  parseAdbDevices,
  extractPng,
} from '../AndroidEmulatorAdapter.js'

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

const mockExecFileSync = vi.mocked(execFileSync)
const mockSpawn = vi.mocked(spawn)
const mockExistsSync = vi.mocked(existsSync)

const SERIAL = 'emulator-5554'

/**
 * Route adb invocations by their argument signature. Because resolveTool() may
 * return either a bare "adb" or an absolute SDK path, we match on the args
 * array (which is stable) rather than the command string.
 */
function setupAdbMock(opts?: {
  devices?: string
  wmSize?: string
  bootCompleted?: string
  uiXml?: string
  screenshot?: Buffer
}) {
  const devices = opts?.devices ?? `List of devices attached\n${SERIAL}\tdevice\n`
  const wmSize = opts?.wmSize ?? 'Physical size: 1080x2400'
  const bootCompleted = opts?.bootCompleted ?? '1'
  const uiXml = opts?.uiXml
  const screenshot = opts?.screenshot ?? Buffer.from('fakepng')

  mockExecFileSync.mockImplementation((_cmd, args) => {
    const a = (args as string[]) ?? []
    if (a.includes('devices')) return devices as never
    if (a.includes('getprop')) return bootCompleted as never
    if (a.includes('wm') && a.includes('size')) return wmSize as never
    if (a.includes('screencap')) return screenshot as never
    if (a.includes('uiautomator') && uiXml) return uiXml as never
    return Buffer.from('') as never
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  setupAdbMock()
})

describe('parseAdbDevices', () => {
  it('extracts online serials only', () => {
    const raw = 'List of devices attached\nemulator-5554\tdevice\nemulator-5556\toffline\n127.0.0.1:5555\tdevice\n'
    expect(parseAdbDevices(raw)).toEqual(['emulator-5554', '127.0.0.1:5555'])
  })

  it('returns empty for no devices', () => {
    expect(parseAdbDevices('List of devices attached\n')).toEqual([])
  })
})

describe('escapeAdbText', () => {
  it('encodes spaces as %s', () => {
    expect(escapeAdbText('hello world')).toBe('hello%sworld')
  })

  it('leaves text without spaces unchanged', () => {
    expect(escapeAdbText('hello@example.com')).toBe('hello@example.com')
  })
})

describe('extractPng', () => {
  it('returns the buffer unchanged when it already starts with the PNG signature', () => {
    const buf = Buffer.concat([PNG_SIG, Buffer.from('imagedata')])
    expect(extractPng(buf)).toEqual(buf)
  })

  it('strips a leading textual warning before the PNG signature', () => {
    const warning = Buffer.from('[Warning] Multiple displays were found...\n')
    const png = Buffer.concat([PNG_SIG, Buffer.from('imagedata')])
    const result = extractPng(Buffer.concat([warning, png]))
    expect(result).toEqual(png)
    expect(result[0]).toBe(0x89)
  })

  it('returns the original buffer when no PNG signature is present', () => {
    const buf = Buffer.from('not an image')
    expect(extractPng(buf)).toEqual(buf)
  })
})

describe('AndroidEmulatorAdapter meta', () => {
  it('reports Android Emulator / .apk / no tooling note', () => {
    const adapter = new AndroidEmulatorAdapter()
    expect(adapter.meta.displayName).toBe('Android Emulator')
    expect(adapter.meta.installArtifact).toBe('.apk')
    expect(adapter.meta.gestureToolingNote).toBe('')
  })
})

describe('boot', () => {
  it('attaches to an already-running serial and populates dimensions', async () => {
    setupAdbMock()
    const adapter = new AndroidEmulatorAdapter()
    const info = await adapter.boot(SERIAL)
    expect(info.udid).toBe(SERIAL)
    expect(info.width).toBe(1080)
    expect(info.height).toBe(2400)
  })

  it('stores device info as instance state', async () => {
    setupAdbMock()
    const adapter = new AndroidEmulatorAdapter()
    await adapter.boot(SERIAL)
    expect(adapter.getDeviceInfo()?.udid).toBe(SERIAL)
  })

  it('launches the emulator for an AVD name and waits for boot', async () => {
    // No device present initially; after spawn, a device appears + boots.
    let devicesCall = 0
    mockExecFileSync.mockImplementation((_cmd, args) => {
      const a = (args as string[]) ?? []
      if (a.includes('devices')) {
        devicesCall++
        // First call (before): empty. Subsequent: device present.
        return (devicesCall <= 1
          ? 'List of devices attached\n'
          : `List of devices attached\n${SERIAL}\tdevice\n`) as never
      }
      if (a.includes('getprop')) return '1' as never
      if (a.includes('wm') && a.includes('size')) return 'Physical size: 1080x2400' as never
      return Buffer.from('') as never
    })
    mockSpawn.mockReturnValue({ kill: vi.fn() } as never)

    const adapter = new AndroidEmulatorAdapter()
    const info = await adapter.boot('Pixel_Fold_API_35')
    expect(info.udid).toBe(SERIAL)
    expect(info.name).toBe('Pixel_Fold_API_35')
    // emulator spawned with -avd
    const spawnArgs = mockSpawn.mock.calls[0][1] as string[]
    expect(spawnArgs).toEqual(['-avd', 'Pixel_Fold_API_35', '-no-snapshot', '-no-boot-anim'])
  })

  it('rejects invalid AVD names', async () => {
    const adapter = new AndroidEmulatorAdapter()
    await expect(adapter.boot('bad;name')).rejects.toThrow(ScoutValidationError)
  })
})

describe('requireSerial', () => {
  it('errors when no device running and boot not called', async () => {
    setupAdbMock({ devices: 'List of devices attached\n' })
    const adapter = new AndroidEmulatorAdapter()
    await expect(adapter.screenshot()).rejects.toThrow('No running Android device')
  })

  it('errors when multiple devices running and boot not called', async () => {
    setupAdbMock({
      devices: `List of devices attached\n${SERIAL}\tdevice\nemulator-5556\tdevice\n`,
    })
    const adapter = new AndroidEmulatorAdapter()
    await expect(adapter.screenshot()).rejects.toThrow('Multiple running devices')
  })
})

describe('screenshot', () => {
  it('captures screencap as base64 PNG with serial threaded', async () => {
    const png = Buffer.concat([PNG_SIG, Buffer.from('DATA')])
    setupAdbMock({ screenshot: png })
    const adapter = new AndroidEmulatorAdapter()
    await adapter.boot(SERIAL)
    const shot = await adapter.screenshot()
    expect(shot.mimeType).toBe('image/png')
    expect(shot.data).toBe(png.toString('base64'))

    const call = mockExecFileSync.mock.calls.find(
      (c) => Array.isArray(c[1]) && (c[1] as string[]).includes('screencap'),
    )
    expect(call![1]).toEqual(['-s', SERIAL, 'exec-out', 'screencap', '-p'])
    // maxBuffer must be raised above the 1 MB default to avoid ENOBUFS on
    // high-resolution screenshots.
    expect((call![2] as { maxBuffer?: number }).maxBuffer).toBeGreaterThan(1024 * 1024)
  })

  it('strips a leading multi-display warning from screencap output', async () => {
    const png = Buffer.concat([PNG_SIG, Buffer.from('DATA')])
    const noisy = Buffer.concat([Buffer.from('[Warning] Multiple displays...\n'), png])
    setupAdbMock({ screenshot: noisy })
    const adapter = new AndroidEmulatorAdapter()
    await adapter.boot(SERIAL)
    const shot = await adapter.screenshot()
    expect(shot.data).toBe(png.toString('base64'))
    expect(Buffer.from(shot.data, 'base64')[0]).toBe(0x89)
  })
})

describe('install', () => {
  it('rejects non-.apk paths', async () => {
    const adapter = new AndroidEmulatorAdapter()
    await adapter.boot(SERIAL)
    await expect(adapter.install('/path/app.ipa')).rejects.toThrow('.apk')
  })

  it('rejects missing APK', async () => {
    const adapter = new AndroidEmulatorAdapter()
    await adapter.boot(SERIAL)
    mockExistsSync.mockReturnValue(false)
    await expect(adapter.install('/path/app.apk')).rejects.toThrow('not found')
  })

  it('calls adb install -r with serial', async () => {
    const adapter = new AndroidEmulatorAdapter()
    await adapter.boot(SERIAL)
    mockExistsSync.mockReturnValue(true)
    await adapter.install('/path/app.apk')
    const call = mockExecFileSync.mock.calls.find(
      (c) => Array.isArray(c[1]) && (c[1] as string[]).includes('install'),
    )
    expect((call![1] as string[]).slice(0, 4)).toEqual(['-s', SERIAL, 'install', '-r'])
    expect((call![1] as string[])[4]).toContain('app.apk')
  })
})

describe('launch', () => {
  it('rejects invalid bundle IDs', async () => {
    const adapter = new AndroidEmulatorAdapter()
    await expect(adapter.launch('com.$(evil).app')).rejects.toThrow(ScoutValidationError)
  })

  it('uses monkey launcher intent with serial and package', async () => {
    const adapter = new AndroidEmulatorAdapter()
    await adapter.boot(SERIAL)
    await adapter.launch('com.example.app')
    const call = mockExecFileSync.mock.calls.find(
      (c) => Array.isArray(c[1]) && (c[1] as string[]).includes('monkey'),
    )
    expect(call![1]).toEqual([
      '-s', SERIAL, 'shell', 'monkey', '-p', 'com.example.app',
      '-c', 'android.intent.category.LAUNCHER', '1',
    ])
  })
})

describe('tap', () => {
  it('rounds coordinates and threads serial', async () => {
    const adapter = new AndroidEmulatorAdapter()
    await adapter.boot(SERIAL)
    await adapter.tap({ x: 100.7, y: 200.3 })
    const call = mockExecFileSync.mock.calls.find(
      (c) => Array.isArray(c[1]) && (c[1] as string[]).includes('tap'),
    )
    expect(call![1]).toEqual(['-s', SERIAL, 'shell', 'input', 'tap', '101', '200'])
  })

  it('rejects negative coordinates', async () => {
    const adapter = new AndroidEmulatorAdapter()
    await expect(adapter.tap({ x: -1, y: 100 })).rejects.toThrow('non-negative')
  })

  it('rejects coordinates exceeding bounds after boot', async () => {
    const adapter = new AndroidEmulatorAdapter()
    await adapter.boot(SERIAL) // 1080x2400
    await expect(adapter.tap({ x: 2000, y: 100 })).rejects.toThrow('exceeds screen width')
    await expect(adapter.tap({ x: 100, y: 3000 })).rejects.toThrow('exceeds screen height')
  })
})

describe('swipe', () => {
  it('passes four coordinates + duration with serial', async () => {
    const adapter = new AndroidEmulatorAdapter()
    await adapter.boot(SERIAL)
    await adapter.swipe({ x: 100, y: 200 }, { x: 300, y: 400 })
    const call = mockExecFileSync.mock.calls.find(
      (c) => Array.isArray(c[1]) && (c[1] as string[]).includes('swipe'),
    )
    expect(call![1]).toEqual(['-s', SERIAL, 'shell', 'input', 'swipe', '100', '200', '300', '400', '500'])
  })
})

describe('logStream', () => {
  it('spawns adb logcat with serial and stops cleanly', async () => {
    const adapter = new AndroidEmulatorAdapter()
    await adapter.boot(SERIAL)
    const mockChild = { stdout: { on: vi.fn() }, kill: vi.fn() }
    mockSpawn.mockReturnValue(mockChild as never)

    const { stop } = await adapter.logStream(vi.fn())
    const spawnArgs = mockSpawn.mock.calls[0][1] as string[]
    expect(spawnArgs).toEqual(['-s', SERIAL, 'logcat', '-v', 'brief'])

    stop()
    expect(mockChild.kill).toHaveBeenCalledWith('SIGTERM')
  })
})

describe('typeText', () => {
  it('escapes spaces and threads serial', async () => {
    const adapter = new AndroidEmulatorAdapter()
    await adapter.boot(SERIAL)
    await adapter.typeText('hello world')
    const call = mockExecFileSync.mock.calls.find(
      (c) => Array.isArray(c[1]) && (c[1] as string[]).includes('text'),
    )
    expect(call![1]).toEqual(['-s', SERIAL, 'shell', 'input', 'text', 'hello%sworld'])
  })

  it('rejects empty text', async () => {
    const adapter = new AndroidEmulatorAdapter()
    await expect(adapter.typeText('')).rejects.toThrow(ScoutValidationError)
  })
})

describe('pressKey', () => {
  it('maps return to keyevent 66', async () => {
    const adapter = new AndroidEmulatorAdapter()
    await adapter.boot(SERIAL)
    await adapter.pressKey('return')
    const call = mockExecFileSync.mock.calls.find(
      (c) => Array.isArray(c[1]) && (c[1] as string[]).includes('keyevent'),
    )
    expect(call![1]).toEqual(['-s', SERIAL, 'shell', 'input', 'keyevent', '66'])
  })

  it('maps deleteBackspace to 67', async () => {
    const adapter = new AndroidEmulatorAdapter()
    await adapter.boot(SERIAL)
    await adapter.pressKey('deleteBackspace')
    const call = mockExecFileSync.mock.calls.find(
      (c) => Array.isArray(c[1]) && (c[1] as string[]).includes('keyevent'),
    )
    expect((call![1] as string[])[5]).toBe('67')
  })

  it('rejects invalid key names', async () => {
    const adapter = new AndroidEmulatorAdapter()
    await expect(adapter.pressKey('enter')).rejects.toThrow(ScoutValidationError)
  })

  it('accepts all allowed keys', async () => {
    const adapter = new AndroidEmulatorAdapter()
    await adapter.boot(SERIAL)
    const keys = ['return', 'tab', 'space', 'deleteBackspace', 'delete', 'escape',
      'upArrow', 'downArrow', 'leftArrow', 'rightArrow', 'home', 'end', 'pageUp', 'pageDown']
    for (const key of keys) {
      await expect(adapter.pressKey(key)).resolves.toBeUndefined()
    }
  })
})

const UI_XML = `<hierarchy rotation="0">
  <node class="android.widget.Button" text="Submit" content-desc="" bounds="[100,200][300,280]" />
  <node class="android.widget.EditText" text="typedvalue" content-desc="Email" bounds="[50,400][1030,480]" />
</hierarchy>`

describe('clearText', () => {
  it('deletes value.length times when an EditText with value is found', async () => {
    setupAdbMock({ uiXml: UI_XML })
    const adapter = new AndroidEmulatorAdapter()
    await adapter.boot(SERIAL)
    await adapter.clearText()
    const keyCalls = mockExecFileSync.mock.calls.filter(
      (c) => Array.isArray(c[1]) && (c[1] as string[]).includes('keyevent'),
    )
    expect(keyCalls).toHaveLength('typedvalue'.length)
  })

  it('falls back to 50 deletions when no text field found', async () => {
    setupAdbMock({ uiXml: '<hierarchy><node class="a.b.Button" text="OK" bounds="[0,0][10,10]"/></hierarchy>' })
    const adapter = new AndroidEmulatorAdapter()
    await adapter.boot(SERIAL)
    await adapter.clearText()
    const keyCalls = mockExecFileSync.mock.calls.filter(
      (c) => Array.isArray(c[1]) && (c[1] as string[]).includes('keyevent'),
    )
    expect(keyCalls).toHaveLength(50)
  })
})

describe('tapElement', () => {
  it('finds element by label and taps its center', async () => {
    setupAdbMock({ uiXml: UI_XML })
    const adapter = new AndroidEmulatorAdapter()
    await adapter.boot(SERIAL)
    const result = await adapter.tapElement('Submit')
    expect(result.element.name).toBe('Submit')
    const tapCall = mockExecFileSync.mock.calls.find(
      (c) => Array.isArray(c[1]) && (c[1] as string[]).includes('tap'),
    )
    // Center of [100,200][300,280] = (200, 240)
    expect((tapCall![1] as string[])[5]).toBe('200')
    expect((tapCall![1] as string[])[6]).toBe('240')
  })

  it('throws when element not found', async () => {
    setupAdbMock({ uiXml: UI_XML })
    const adapter = new AndroidEmulatorAdapter()
    await adapter.boot(SERIAL)
    await expect(adapter.tapElement('Missing')).rejects.toThrow('No element found')
  })
})

describe('accessibilityTree', () => {
  it('dumps uiautomator XML and parses it', async () => {
    setupAdbMock({ uiXml: UI_XML })
    const adapter = new AndroidEmulatorAdapter()
    await adapter.boot(SERIAL)
    const tree = await adapter.accessibilityTree()
    expect(tree.elements.length).toBe(2)
    const dumpCall = mockExecFileSync.mock.calls.find(
      (c) => Array.isArray(c[1]) && (c[1] as string[]).includes('uiautomator'),
    )
    expect(dumpCall![1]).toEqual(['-s', SERIAL, 'exec-out', 'uiautomator', 'dump', '/dev/tty'])
  })
})

describe('teardown', () => {
  it('calls adb emu kill with stored serial', async () => {
    const adapter = new AndroidEmulatorAdapter()
    await adapter.boot(SERIAL)
    await adapter.teardown()
    const killCall = mockExecFileSync.mock.calls.find(
      (c) => Array.isArray(c[1]) && (c[1] as string[]).includes('emu'),
    )
    expect(killCall![1]).toEqual(['-s', SERIAL, 'emu', 'kill'])
  })

  it('is a no-op when no device booted', async () => {
    const adapter = new AndroidEmulatorAdapter()
    await expect(adapter.teardown()).resolves.toBeUndefined()
  })

  it('swallows errors from emu kill', async () => {
    const adapter = new AndroidEmulatorAdapter()
    await adapter.boot(SERIAL)
    mockExecFileSync.mockImplementation(() => {
      throw new Error('already gone')
    })
    await expect(adapter.teardown()).resolves.toBeUndefined()
  })
})
