import { platform } from 'node:os'
import { execFileSync } from 'node:child_process'
import type { EnvironmentCheck, EnvironmentReport } from '@scout-mobile/core'
import { ScoutEnvironmentError } from '@scout-mobile/core'

export function checkMacOS(): EnvironmentCheck {
  const isDarwin = platform() === 'darwin'
  return {
    name: 'macOS',
    ok: isDarwin,
    message: isDarwin ? 'Running on macOS' : `Running on ${platform()}`,
    hint: isDarwin ? undefined : 'Scout iOS requires macOS with Xcode',
  }
}

export function checkXcodeTools(): EnvironmentCheck {
  try {
    execFileSync('xcrun', ['simctl', 'help'], { stdio: 'ignore' })
    return {
      name: 'Xcode CLI Tools',
      ok: true,
      message: 'xcrun simctl available',
    }
  } catch {
    return {
      name: 'Xcode CLI Tools',
      ok: false,
      message: 'xcrun simctl not found',
      hint: 'Install Xcode and run: xcode-select --install',
    }
  }
}

export function checkIdb(): EnvironmentCheck {
  try {
    execFileSync('idb', ['--help'], { stdio: 'ignore' })
    return {
      name: 'idb',
      ok: true,
      message: 'idb installed',
    }
  } catch {
    return {
      name: 'idb',
      ok: false,
      message: 'idb not found',
      hint: 'Required for tap/swipe. Install with: brew tap facebook/fb && brew install idb-companion && pip3 install fb-idb',
    }
  }
}

export function assertMacOS(): void {
  if (platform() !== 'darwin') {
    throw new ScoutEnvironmentError('Scout iOS requires macOS')
  }
}

export function assertIdbInstalled(): void {
  try {
    execFileSync('idb', ['--help'], { stdio: 'ignore' })
  } catch {
    throw new ScoutEnvironmentError(
      'idb is required for tap/swipe. Install with: brew tap facebook/fb && brew install idb-companion && pip3 install fb-idb',
    )
  }
}

export function runAllChecks(): EnvironmentReport {
  const checks = [checkMacOS(), checkXcodeTools(), checkIdb()]
  const requiredChecks = checks.filter((c) => c.name !== 'idb')
  const ok = requiredChecks.every((c) => c.ok)
  return { ok, checks }
}
