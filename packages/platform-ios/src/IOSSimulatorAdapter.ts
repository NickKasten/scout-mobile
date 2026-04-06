import { execFileSync, spawn } from 'node:child_process'
import { readFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import type { PlatformAdapter, EnvironmentReport, Point } from '@scout-mobile/core'
import { ScoutEnvironmentError, ScoutValidationError, validateBundleId, validateDeviceName } from '@scout-mobile/core'
import { assertMacOS, assertIdbInstalled, runAllChecks } from './envChecks.js'

const DEFAULT_DEVICE = 'iPhone 16 Pro'

function validateCoordinate(value: number, name: string): number {
  if (value < 0) {
    throw new ScoutValidationError(`${name} must be non-negative, got ${value}`)
  }
  return Math.round(value)
}

function getBootedUdid(): string {
  const json = execFileSync('xcrun', ['simctl', 'list', 'devices', 'booted', '-j'], {
    encoding: 'utf-8',
  })
  const data = JSON.parse(json)
  for (const devices of Object.values(data.devices) as Array<Array<{ udid: string; state: string }>>) {
    for (const device of devices) {
      if (device.state === 'Booted') return device.udid
    }
  }
  throw new ScoutEnvironmentError('No booted simulator found')
}

export class IOSSimulatorAdapter implements PlatformAdapter {
  async checkEnvironment(): Promise<EnvironmentReport> {
    return runAllChecks()
  }

  async boot(device?: string): Promise<void> {
    assertMacOS()
    const deviceName = device ? validateDeviceName(device) : DEFAULT_DEVICE
    try {
      execFileSync('xcrun', ['simctl', 'boot', deviceName], { stdio: 'ignore' })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (message.includes('current state: Booted')) {
        return // already booted — idempotent success
      }
      throw error
    }
  }

  async screenshot(): Promise<{ data: string; mimeType: string }> {
    assertMacOS()
    const tmpDir = mkdtempSync(join(tmpdir(), 'scout-'))
    const tmpPath = join(tmpDir, 'screenshot.png')
    try {
      execFileSync('xcrun', ['simctl', 'io', 'booted', 'screenshot', tmpPath], {
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
    if (!appPath.endsWith('.app')) {
      throw new ScoutValidationError(`App path must end with .app, got: ${appPath}`)
    }
    const resolvedPath = resolve(appPath)
    if (!existsSync(resolvedPath)) {
      throw new ScoutValidationError(`App not found at path: ${resolvedPath}`)
    }
    execFileSync('xcrun', ['simctl', 'install', 'booted', resolvedPath], { stdio: 'ignore' })
  }

  async launch(bundleId: string): Promise<void> {
    assertMacOS()
    validateBundleId(bundleId)
    execFileSync('xcrun', ['simctl', 'launch', 'booted', bundleId], { stdio: 'ignore' })
  }

  async tap(point: Point): Promise<void> {
    assertMacOS()
    assertIdbInstalled()
    const x = validateCoordinate(point.x, 'x')
    const y = validateCoordinate(point.y, 'y')
    const udid = getBootedUdid()
    execFileSync('idb', ['ui', 'tap', String(x), String(y), '--udid', udid], { stdio: 'ignore' })
  }

  async swipe(from: Point, to: Point): Promise<void> {
    assertMacOS()
    assertIdbInstalled()
    const x1 = validateCoordinate(from.x, 'startX')
    const y1 = validateCoordinate(from.y, 'startY')
    const x2 = validateCoordinate(to.x, 'endX')
    const y2 = validateCoordinate(to.y, 'endY')
    const udid = getBootedUdid()
    execFileSync('idb', ['ui', 'swipe', String(x1), String(y1), String(x2), String(y2), '--udid', udid], {
      stdio: 'ignore',
    })
  }

  async logStream(callback: (line: string) => void): Promise<{ stop: () => void }> {
    assertMacOS()
    const child = spawn('xcrun', ['simctl', 'spawn', 'booted', 'log', 'stream', '--style', 'compact'], {
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

  async accessibilityTree(): Promise<string> {
    throw new ScoutEnvironmentError(
      'accessibilityTree() will be implemented in Phase 2 with full idb accessibility support',
    )
  }

  async teardown(): Promise<void> {
    try {
      execFileSync('xcrun', ['simctl', 'shutdown', 'booted'], { stdio: 'ignore' })
    } catch {
      // Already shut down — swallow
    }
  }
}
