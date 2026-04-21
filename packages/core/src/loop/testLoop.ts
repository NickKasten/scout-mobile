import type { PlatformAdapter } from '../adapters/PlatformAdapter.js'
import type { FrameworkAdapter } from '../adapters/FrameworkAdapter.js'
import type { Issue, TestReport } from '../report/reportWriter.js'
import { detectJank } from './jankDetector.js'

export interface TestLoopOptions {
  adapter: PlatformAdapter
  framework: FrameworkAdapter
  device?: string
  logDurationMs?: number
}

export interface TestLoopResult {
  report: TestReport
  issues: Issue[]
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const ERROR_PATTERNS: { pattern: RegExp; category: string }[] = [
  { pattern: /Red\s*Screen|RedBox/i, category: 'Red Screen' },
  { pattern: /Fatal\s*Exception/i, category: 'Fatal Exception' },
  { pattern: /EXC_BAD_ACCESS/i, category: 'EXC_BAD_ACCESS' },
  { pattern: /SIGABRT/i, category: 'SIGABRT' },
  { pattern: /Uncaught\s*Error/i, category: 'Uncaught Error' },
  { pattern: /Unhandled\s*promise\s*rejection/i, category: 'Unhandled Promise Rejection' },
  { pattern: /Invariant\s*Violation/i, category: 'Invariant Violation' },
  { pattern: /\bcrash(?:ed)?\b/i, category: 'Crash' },
]

export function analyzeLogLines(lines: string[]): Issue[] {
  const seen = new Map<string, Issue>()

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    for (const { pattern, category } of ERROR_PATTERNS) {
      if (pattern.test(line)) {
        const dedupeKey = `${category}:${line.slice(0, 80)}`
        if (seen.has(dedupeKey)) continue

        const start = Math.max(0, i - 3)
        const end = Math.min(lines.length, i + 4)
        const excerpt = lines.slice(start, end)

        const issue: Issue = {
          severity: 'error',
          category,
          message: line.trim(),
          logExcerpt: excerpt,
        }
        seen.set(dedupeKey, issue)
        break
      }
    }
  }

  return Array.from(seen.values())
}

export async function runTestLoop(options: TestLoopOptions): Promise<TestLoopResult> {
  const { adapter, framework, device, logDurationMs = 5000 } = options
  const timestamp = new Date().toISOString()

  try {
    // Boot simulator
    const deviceInfo = await adapter.boot(device)

    // Build app
    const appPath = await framework.build()

    // Install and launch
    await adapter.install(appPath)
    const bundleId = framework.getBundleId()
    await adapter.launch(bundleId)

    // Wait for app to settle
    await sleep(2000)

    // Take screenshot
    let screenshot: string | undefined
    try {
      const result = await adapter.screenshot()
      screenshot = result.data
    } catch {
      // Screenshot failure is non-fatal
    }

    // Collect logs
    const logLines: string[] = []
    const stream = await adapter.logStream((line) => {
      logLines.push(line)
    })

    await sleep(logDurationMs)
    stream.stop()

    // Analyze
    const issues = analyzeLogLines(logLines)
    const jankIssues = detectJank(logLines)
    issues.push(...jankIssues)

    const report: TestReport = {
      timestamp,
      device: deviceInfo.name,
      issues,
      screenshot,
      logs: logLines,
    }

    return { report, issues }
  } finally {
    await adapter.teardown()
  }
}
