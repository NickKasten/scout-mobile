import { platform } from 'node:os'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import type { EnvironmentCheck, EnvironmentReport } from '@scout-mobile/core'
import { ScoutEnvironmentError } from '@scout-mobile/core'

/**
 * The Android SDK root, from ANDROID_HOME (preferred) or ANDROID_SDK_ROOT.
 */
export function androidHome(): string | undefined {
  return process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT
}

/**
 * Resolve a tool ("adb" | "emulator") to an absolute path inside the SDK when
 * ANDROID_HOME is set, otherwise fall back to the bare command (PATH lookup).
 *
 * On Windows the binaries carry a `.exe` extension and live under the same
 * subdirectories (platform-tools/ for adb, emulator/ for emulator).
 */
export function resolveTool(name: 'adb' | 'emulator'): string {
  const home = androidHome()
  const isWin = platform() === 'win32'
  const exe = isWin ? `${name}.exe` : name
  const subdir = name === 'adb' ? 'platform-tools' : 'emulator'

  if (home) {
    const candidate = join(home, subdir, exe)
    if (existsSync(candidate)) {
      return candidate
    }
  }
  // Fall back to PATH resolution
  return name
}

export function checkAndroidSdk(): EnvironmentCheck {
  const home = androidHome()
  if (home && existsSync(home)) {
    return {
      name: 'Android SDK',
      ok: true,
      message: `Android SDK found at ${home}`,
    }
  }
  return {
    name: 'Android SDK',
    ok: false,
    message: home ? `ANDROID_HOME points to a missing directory: ${home}` : 'ANDROID_HOME / ANDROID_SDK_ROOT not set',
    hint: 'Install the Android SDK and set ANDROID_HOME to its location',
  }
}

export function checkAdb(): EnvironmentCheck {
  try {
    execFileSync(resolveTool('adb'), ['version'], { stdio: 'ignore' })
    return {
      name: 'adb',
      ok: true,
      message: 'adb available',
    }
  } catch {
    return {
      name: 'adb',
      ok: false,
      message: 'adb not found',
      hint: 'Install Android platform-tools and ensure adb is on PATH or under ANDROID_HOME/platform-tools',
    }
  }
}

export function checkEmulator(): EnvironmentCheck {
  try {
    execFileSync(resolveTool('emulator'), ['-version'], { stdio: 'ignore' })
    return {
      name: 'emulator',
      ok: true,
      message: 'emulator available',
    }
  } catch {
    return {
      name: 'emulator',
      ok: false,
      message: 'emulator not found',
      hint: 'Required to boot AVDs. Install the Android Emulator package via the SDK Manager',
    }
  }
}

export function checkAvd(): EnvironmentCheck {
  try {
    const out = execFileSync(resolveTool('emulator'), ['-list-avds'], { encoding: 'utf-8' })
    // The emulator binary interleaves diagnostic lines (e.g. "INFO | Storing
    // crashdata...") with the actual AVD names. AVD names are a restricted
    // charset, so keep only lines that match it and drop the log noise.
    const avds = out
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => /^[a-zA-Z0-9._-]+$/.test(l))
    if (avds.length > 0) {
      return {
        name: 'AVD',
        ok: true,
        message: `${avds.length} AVD(s) available: ${avds.join(', ')}`,
      }
    }
    return {
      name: 'AVD',
      ok: false,
      message: 'No AVDs found',
      hint: 'Create an AVD via Android Studio or `avdmanager create avd`',
    }
  } catch {
    return {
      name: 'AVD',
      ok: false,
      message: 'Could not list AVDs',
      hint: 'Ensure the emulator tool is installed and ANDROID_HOME is set',
    }
  }
}

export function assertAdbInstalled(): void {
  try {
    execFileSync(resolveTool('adb'), ['version'], { stdio: 'ignore' })
  } catch {
    throw new ScoutEnvironmentError(
      'adb is required. Install Android platform-tools and ensure adb is on PATH or under ANDROID_HOME/platform-tools',
    )
  }
}

export function runAllChecks(): EnvironmentReport {
  const checks = [checkAndroidSdk(), checkAdb(), checkEmulator(), checkAvd()]
  // Required: SDK + adb. emulator/avd are warnings (mirrors idb's optional
  // status on iOS — useful but not strictly required for every operation).
  const requiredNames = new Set(['Android SDK', 'adb'])
  const ok = checks.filter((c) => requiredNames.has(c.name)).every((c) => c.ok)
  return { ok, checks }
}
