import { describe, it, expect } from 'vitest'
import { platform } from 'node:os'
import { IOSSimulatorAdapter } from '../IOSSimulatorAdapter.js'

const IS_MACOS = platform() === 'darwin'

describe.skipIf(!IS_MACOS)('IOSSimulatorAdapter (integration)', () => {
  const adapter = new IOSSimulatorAdapter()

  it('boots a simulator and returns valid DeviceInfo', async () => {
    const result = await adapter.boot()
    expect(result.udid).toMatch(/^[0-9A-Fa-f-]+$/)
    expect(result.name).toBeTruthy()
    expect(result.width).toBeGreaterThan(0)
    expect(result.height).toBeGreaterThan(0)
  }, 60_000)

  it('takes a screenshot returning valid PNG base64', async () => {
    const { data, mimeType } = await adapter.screenshot()
    expect(mimeType).toBe('image/png')
    expect(data.length).toBeGreaterThan(100)
    // Verify it's valid base64 by checking PNG header bytes
    const buf = Buffer.from(data, 'base64')
    expect(buf[0]).toBe(0x89) // PNG signature
    expect(buf[1]).toBe(0x50) // 'P'
  }, 10_000)

  it('captures log lines via log stream', async () => {
    const lines: string[] = []
    const stream = await adapter.logStream((line) => lines.push(line))

    await new Promise((resolve) => setTimeout(resolve, 2000))
    stream.stop()

    // Simulator should produce some log output
    expect(lines.length).toBeGreaterThan(0)
  }, 10_000)

  it('returns accessibility tree with elements', async () => {
    const tree = await adapter.accessibilityTree()
    expect(tree.elements).toBeDefined()
    expect(Array.isArray(tree.elements)).toBe(true)
  }, 10_000)

  it('taps at valid coordinates without error', async () => {
    await expect(adapter.tap({ x: 200, y: 400 })).resolves.not.toThrow()
  }, 10_000)
})
