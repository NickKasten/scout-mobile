import { describe, it, expect } from 'vitest'
import { detectJank } from '../loop/jankDetector.js'

describe('detectJank', () => {
  it('detects CADisplayLink missed frames', () => {
    const lines = ['normal log', 'CADisplayLink callback missed 12 frames', 'more logs']
    const issues = detectJank(lines)
    expect(issues).toHaveLength(1)
    expect(issues[0].category).toBe('Jank')
    expect(issues[0].message).toContain('12')
  })

  it('detects hitch duration in ms', () => {
    const lines = ['hitch duration: 200ms']
    const issues = detectJank(lines)
    expect(issues).toHaveLength(1)
    expect(issues[0].message).toContain('dropped frames')
  })

  it('detects hang duration in seconds', () => {
    const lines = ['hang duration: 2.5s']
    const issues = detectJank(lines)
    expect(issues).toHaveLength(1)
    expect(issues[0].severity).toBe('error') // 2.5s * 60 = 150 frames
  })

  it('returns empty for clean logs', () => {
    const lines = ['app loaded', 'view rendered', 'data fetched']
    const issues = detectJank(lines)
    expect(issues).toHaveLength(0)
  })

  it('ignores frames below threshold', () => {
    const lines = ['CADisplayLink callback missed 2 frames']
    const issues = detectJank(lines)
    expect(issues).toHaveLength(0) // default threshold is 5
  })

  it('respects custom threshold', () => {
    const lines = ['CADisplayLink callback missed 3 frames']
    const issues = detectJank(lines, 2)
    expect(issues).toHaveLength(1)
  })

  it('accumulates frames across multiple events', () => {
    const lines = [
      'CADisplayLink callback missed 3 frames',
      'normal log',
      'CADisplayLink callback missed 4 frames',
    ]
    const issues = detectJank(lines)
    expect(issues).toHaveLength(1)
    expect(issues[0].message).toContain('7') // 3 + 4
  })

  it('reports warning for 5-19 dropped frames', () => {
    const lines = ['CADisplayLink callback missed 10 frames']
    const issues = detectJank(lines)
    expect(issues).toHaveLength(1)
    expect(issues[0].severity).toBe('warning')
  })

  it('reports error for 20+ dropped frames', () => {
    const lines = ['CADisplayLink callback missed 25 frames']
    const issues = detectJank(lines)
    expect(issues).toHaveLength(1)
    expect(issues[0].severity).toBe('error')
  })

  it('includes log excerpts', () => {
    const lines = ['CADisplayLink callback missed 8 frames']
    const issues = detectJank(lines)
    expect(issues[0].logExcerpt).toBeDefined()
    expect(issues[0].logExcerpt!.length).toBeGreaterThan(0)
  })

  it('includes suggested fix', () => {
    const lines = ['CADisplayLink callback missed 8 frames']
    const issues = detectJank(lines)
    expect(issues[0].suggestedFix).toBeDefined()
  })

  it('limits excerpts to 10 entries', () => {
    const lines: string[] = []
    for (let i = 0; i < 15; i++) {
      lines.push(`CADisplayLink callback missed 1 frames`)
    }
    const issues = detectJank(lines, 1)
    expect(issues[0].logExcerpt!.length).toBeLessThanOrEqual(10)
  })
})
