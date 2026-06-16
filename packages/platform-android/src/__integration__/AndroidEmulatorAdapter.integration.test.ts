import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { AndroidEmulatorAdapter, parseAdbDevices } from '../AndroidEmulatorAdapter.js'
import { resolveTool } from '../envChecks.js'

/**
 * Self-skip unless a real, online Android device is reachable via adb. This lets
 * the suite run in CI (with an emulator) and pass cleanly everywhere else.
 */
function hasOnlineDevice(): boolean {
  try {
    const out = execFileSync(resolveTool('adb'), ['devices'], { encoding: 'utf-8' })
    return parseAdbDevices(out).length > 0
  } catch {
    return false
  }
}

const HAS_DEVICE = hasOnlineDevice()

describe.skipIf(!HAS_DEVICE)('AndroidEmulatorAdapter (integration)', () => {
  const adapter = new AndroidEmulatorAdapter()

  it('attaches to a running device and returns valid DeviceInfo', async () => {
    const serials = parseAdbDevices(
      execFileSync(resolveTool('adb'), ['devices'], { encoding: 'utf-8' }),
    )
    const result = await adapter.boot(serials[0])
    expect(result.udid).toBeTruthy()
    expect(result.width).toBeGreaterThan(0)
    expect(result.height).toBeGreaterThan(0)
  }, 120_000)

  it('takes a screenshot returning valid PNG base64', async () => {
    const { data, mimeType } = await adapter.screenshot()
    expect(mimeType).toBe('image/png')
    expect(data.length).toBeGreaterThan(100)
    const buf = Buffer.from(data, 'base64')
    expect(buf[0]).toBe(0x89) // PNG signature
    expect(buf[1]).toBe(0x50) // 'P'
  }, 30_000)

  it('captures log lines via logcat', async () => {
    const lines: string[] = []
    const stream = await adapter.logStream((line) => lines.push(line))
    await new Promise((resolve) => setTimeout(resolve, 2000))
    stream.stop()
    expect(lines.length).toBeGreaterThan(0)
  }, 30_000)

  it('returns an accessibility tree', async () => {
    const tree = await adapter.accessibilityTree()
    expect(Array.isArray(tree.elements)).toBe(true)
  }, 30_000)
})
