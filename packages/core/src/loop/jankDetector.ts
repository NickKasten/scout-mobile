import type { Issue } from '../report/reportWriter.js'

interface JankPattern {
  pattern: RegExp
  extract: (match: RegExpMatchArray) => number // returns dropped frame count or equivalent
  category: string
}

const JANK_PATTERNS: JankPattern[] = [
  {
    // "CADisplayLink missed N frames"
    pattern: /CADisplayLink.*missed\s+(\d+)\s+frame/i,
    extract: (m) => parseInt(m[1], 10),
    category: 'Dropped Frames',
  },
  {
    // "hitch duration Xms" or "hitch_duration: X ms"
    pattern: /hitch.*?duration[:\s]+(\d+)\s*ms/i,
    extract: (m) => Math.round(parseInt(m[1], 10) / 16.67), // ~frames at 60fps
    category: 'Hitch',
  },
  {
    // "hang duration Xs" or "hang_duration: X.Xs"
    pattern: /hang.*?duration[:\s]+(\d+(?:\.\d+)?)\s*s/i,
    extract: (m) => Math.round(parseFloat(m[1]) * 60), // seconds → frames at 60fps
    category: 'Hang',
  },
]

export function detectJank(lines: string[], threshold: number = 5): Issue[] {
  let totalDropped = 0
  const excerpts: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    for (const { pattern, extract, category } of JANK_PATTERNS) {
      const match = line.match(pattern)
      if (match) {
        const frames = extract(match)
        totalDropped += frames
        excerpts.push(`[${category}] ${line.trim()} (~${frames} frames)`)
        break
      }
    }
  }

  if (totalDropped < threshold) return []

  const severity = totalDropped >= 20 ? 'error' : 'warning'
  const issue: Issue = {
    severity,
    category: 'Jank',
    message: `Detected ~${totalDropped} dropped frames across ${excerpts.length} event(s)`,
    logExcerpt: excerpts.slice(0, 10),
    suggestedFix: totalDropped >= 20
      ? 'Significant jank detected. Profile with Instruments (Time Profiler / Animation Hitches) to identify the bottleneck.'
      : 'Minor jank detected. Consider profiling with Instruments if user-facing.',
  }

  return [issue]
}
