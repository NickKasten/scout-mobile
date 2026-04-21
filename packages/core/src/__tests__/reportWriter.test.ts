import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { TestReport, Issue } from '../report/reportWriter.js'

vi.mock('node:fs', () => ({
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(),
  appendFileSync: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
}))

import { writeFileSync, readFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  generateReport,
  generateSummary,
  writeReport,
  ensureGitignore,
} from '../report/reportWriter.js'

const mockWriteFileSync = vi.mocked(writeFileSync)
const mockReadFileSync = vi.mocked(readFileSync)
const mockAppendFileSync = vi.mocked(appendFileSync)
const mockExistsSync = vi.mocked(existsSync)
const mockMkdirSync = vi.mocked(mkdirSync)

beforeEach(() => {
  vi.clearAllMocks()
})

function makeReport(overrides: Partial<TestReport> = {}): TestReport {
  return {
    timestamp: '2026-04-01T12:00:00.000Z',
    device: 'iPhone 17 Pro',
    issues: [],
    logs: [],
    ...overrides,
  }
}

describe('generateReport', () => {
  it('generates clean report with no issues', () => {
    const report = makeReport()
    const output = generateReport(report)
    expect(output).toContain('# Scout Test Report')
    expect(output).toContain('**Issues:** 0')
    expect(output).toContain('No Issues Found')
    expect(output).not.toContain('undefined')
    expect(output).not.toContain('[object Object]')
  })

  it('formats errors with severity tag', () => {
    const report = makeReport({
      issues: [{ severity: 'error', category: 'Red Screen', message: 'App crashed' }],
    })
    const output = generateReport(report)
    expect(output).toContain('[ERROR]')
    expect(output).toContain('Red Screen')
    expect(output).toContain('App crashed')
  })

  it('formats warnings with severity tag', () => {
    const report = makeReport({
      issues: [{ severity: 'warning', category: 'Deprecation', message: 'Old API used' }],
    })
    const output = generateReport(report)
    expect(output).toContain('[WARNING]')
  })

  it('includes log excerpts in code blocks', () => {
    const report = makeReport({
      issues: [
        {
          severity: 'error',
          category: 'Crash',
          message: 'Fatal crash',
          logExcerpt: ['line1', 'line2', 'CRASH HERE', 'line4'],
        },
      ],
    })
    const output = generateReport(report)
    expect(output).toContain('```')
    expect(output).toContain('CRASH HERE')
  })

  it('includes suggested fix', () => {
    const report = makeReport({
      issues: [
        {
          severity: 'error',
          category: 'Red Screen',
          message: 'Module not found',
          suggestedFix: 'Run npm install',
        },
      ],
    })
    const output = generateReport(report)
    expect(output).toContain('**Suggested fix:** Run npm install')
  })

  it('embeds base64 screenshot', () => {
    const report = makeReport({ screenshot: 'abc123base64data' })
    const output = generateReport(report)
    expect(output).toContain('![Screenshot](data:image/png;base64,abc123base64data)')
  })

  it('truncates log tail to 50 lines', () => {
    const logs = Array.from({ length: 100 }, (_, i) => `log line ${i}`)
    const report = makeReport({ logs })
    const output = generateReport(report)
    expect(output).toContain('log line 50')
    expect(output).toContain('log line 99')
    expect(output).not.toContain('log line 49\n')
  })

  it('does not leak undefined or [object Object]', () => {
    const report = makeReport({
      issues: [
        { severity: 'info', category: 'Test', message: 'info message' },
      ],
    })
    const output = generateReport(report)
    expect(output).not.toContain('undefined')
    expect(output).not.toContain('[object Object]')
  })

  it('includes log tail section when logs present', () => {
    const report = makeReport({ logs: ['app started', 'loaded view'] })
    const output = generateReport(report)
    expect(output).toContain('## Log Tail')
    expect(output).toContain('app started')
  })
})

describe('generateSummary', () => {
  it('returns no-issues message for clean report', () => {
    const report = makeReport()
    expect(generateSummary(report)).toBe('Scout Check — No issues found')
  })

  it('counts errors correctly', () => {
    const report = makeReport({
      issues: [
        { severity: 'error', category: 'Crash', message: 'crash 1' },
        { severity: 'error', category: 'Crash', message: 'crash 2' },
        { severity: 'warning', category: 'Warn', message: 'warn 1' },
      ],
    })
    expect(generateSummary(report)).toBe('Scout Check — 2 errors, 1 warning')
  })

  it('handles single counts without plural', () => {
    const report = makeReport({
      issues: [{ severity: 'error', category: 'Crash', message: 'crash' }],
    })
    expect(generateSummary(report)).toBe('Scout Check — 1 error')
  })
})

describe('writeReport', () => {
  it('creates directory and writes file', () => {
    mockExistsSync.mockReturnValue(false)
    const path = writeReport('scout-reports', '/home/project', makeReport())
    expect(mockMkdirSync).toHaveBeenCalled()
    expect(mockWriteFileSync).toHaveBeenCalled()
    expect(path).toContain('scout-report-')
    expect(path).toContain('.md')
  })

  it('rejects report dir outside project root', () => {
    expect(() => writeReport('../outside', '/home/project', makeReport())).toThrow(
      'Report directory must be within project root',
    )
  })

  it('rejects report dir that is a prefix attack on project root', () => {
    expect(() => writeReport('../project-evil', '/home/project', makeReport())).toThrow(
      'Report directory must be within project root',
    )
  })
})

describe('ensureGitignore', () => {
  it('appends to existing .gitignore if not already present', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue('node_modules/\n')
    ensureGitignore('/project', 'scout-reports')
    expect(mockAppendFileSync).toHaveBeenCalledWith(
      join('/project', '.gitignore'),
      expect.stringContaining('scout-reports'),
    )
  })

  it('does not duplicate if already present', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue('node_modules/\nscout-reports/\n')
    ensureGitignore('/project', 'scout-reports')
    expect(mockAppendFileSync).not.toHaveBeenCalled()
  })

  it('creates .gitignore if missing', () => {
    mockExistsSync.mockReturnValue(false)
    ensureGitignore('/project', 'scout-reports')
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      join('/project', '.gitignore'),
      expect.stringContaining('scout-reports'),
      'utf-8',
    )
  })
})
