import { writeFileSync, readFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

export type Severity = 'error' | 'warning' | 'info'

export interface Issue {
  severity: Severity
  category: string
  message: string
  logExcerpt?: string[]
  suggestedFix?: string
}

export interface TestReport {
  timestamp: string
  device: string
  issues: Issue[]
  screenshot?: string
  logs: string[]
}

const LOG_TAIL_LIMIT = 50

export function generateReport(report: TestReport): string {
  const lines: string[] = []

  lines.push(`# Scout Test Report`)
  lines.push('')
  lines.push(`**Timestamp:** ${report.timestamp}`)
  lines.push(`**Device:** ${report.device}`)
  lines.push(`**Issues:** ${report.issues.length}`)
  lines.push('')

  if (report.issues.length > 0) {
    lines.push('## Issues')
    lines.push('')
    for (const issue of report.issues) {
      const tag = `[${issue.severity.toUpperCase()}]`
      lines.push(`### ${tag} ${issue.category}`)
      lines.push('')
      lines.push(issue.message)
      lines.push('')

      if (issue.logExcerpt && issue.logExcerpt.length > 0) {
        lines.push('**Log excerpt:**')
        lines.push('```')
        for (const line of issue.logExcerpt) {
          lines.push(line)
        }
        lines.push('```')
        lines.push('')
      }

      if (issue.suggestedFix) {
        lines.push(`**Suggested fix:** ${issue.suggestedFix}`)
        lines.push('')
      }
    }
  } else {
    lines.push('## No Issues Found')
    lines.push('')
    lines.push('All checks passed.')
    lines.push('')
  }

  if (report.screenshot) {
    lines.push('## Screenshot')
    lines.push('')
    lines.push(`![Screenshot](data:image/png;base64,${report.screenshot})`)
    lines.push('')
  }

  if (report.logs.length > 0) {
    lines.push('## Log Tail')
    lines.push('')
    lines.push('```')
    const tail = report.logs.slice(-LOG_TAIL_LIMIT)
    for (const line of tail) {
      lines.push(line)
    }
    lines.push('```')
    lines.push('')
  }

  return lines.join('\n')
}

export function generateSummary(report: TestReport): string {
  const errorCount = report.issues.filter((i) => i.severity === 'error').length
  const warningCount = report.issues.filter((i) => i.severity === 'warning').length
  const infoCount = report.issues.filter((i) => i.severity === 'info').length

  if (report.issues.length === 0) {
    return 'Scout Check — No issues found'
  }

  const parts: string[] = []
  if (errorCount > 0) parts.push(`${errorCount} error${errorCount > 1 ? 's' : ''}`)
  if (warningCount > 0) parts.push(`${warningCount} warning${warningCount > 1 ? 's' : ''}`)
  if (infoCount > 0) parts.push(`${infoCount} info`)

  return `Scout Check — ${parts.join(', ')}`
}

export function writeReport(reportDir: string, projectRoot: string, report: TestReport): string {
  const resolvedDir = resolve(projectRoot, reportDir)
  if (!resolvedDir.startsWith(resolve(projectRoot))) {
    throw new Error(`Report directory must be within project root`)
  }

  if (!existsSync(resolvedDir)) {
    mkdirSync(resolvedDir, { recursive: true })
  }

  const filename = `scout-report-${report.timestamp.replace(/[:.]/g, '-')}.md`
  const filePath = join(resolvedDir, filename)
  const content = generateReport(report)
  writeFileSync(filePath, content, 'utf-8')

  return filePath
}

export function ensureGitignore(projectRoot: string, reportDir: string): void {
  const gitignorePath = join(projectRoot, '.gitignore')

  if (existsSync(gitignorePath)) {
    const content = readFileSync(gitignorePath, 'utf-8')
    if (content.includes(reportDir)) {
      return
    }
    appendFileSync(gitignorePath, `\n# Scout reports\n${reportDir}/\n`)
  } else {
    writeFileSync(gitignorePath, `# Scout reports\n${reportDir}/\n`, 'utf-8')
  }
}
