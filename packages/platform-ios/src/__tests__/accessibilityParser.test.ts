import { describe, it, expect } from 'vitest'
import { parseAccessibilityOutput } from '../IOSSimulatorAdapter.js'

describe('parseAccessibilityOutput', () => {
  it('parses a JSON array of elements', () => {
    const raw = JSON.stringify([
      { type: 'Button', name: 'Log In', frame: { x: 100, y: 700, width: 180, height: 44 } },
      { type: 'TextField', name: 'Email', value: '', frame: { x: 50, y: 400, width: 300, height: 44 } },
    ])
    const elements = parseAccessibilityOutput(raw)
    expect(elements).toHaveLength(2)
    expect(elements[0].type).toBe('Button')
    expect(elements[0].name).toBe('Log In')
    expect(elements[0].frame).toEqual({ x: 100, y: 700, width: 180, height: 44 })
    expect(elements[1].value).toBe('')
  })

  it('parses newline-delimited JSON', () => {
    const raw = [
      JSON.stringify({ type: 'StaticText', name: 'Hello', frame: { x: 10, y: 20, width: 100, height: 30 } }),
      JSON.stringify({ type: 'Button', name: 'OK', frame: { x: 50, y: 80, width: 60, height: 40 } }),
    ].join('\n')
    const elements = parseAccessibilityOutput(raw)
    expect(elements).toHaveLength(2)
    expect(elements[0].name).toBe('Hello')
    expect(elements[1].name).toBe('OK')
  })

  it('handles nested children', () => {
    const raw = JSON.stringify([
      {
        type: 'View',
        name: 'Container',
        frame: { x: 0, y: 0, width: 393, height: 852 },
        children: [
          { type: 'Button', name: 'Submit', frame: { x: 100, y: 400, width: 200, height: 50 } },
        ],
      },
    ])
    const elements = parseAccessibilityOutput(raw)
    expect(elements).toHaveLength(1)
    expect(elements[0].children).toHaveLength(1)
    expect(elements[0].children![0].name).toBe('Submit')
  })

  it('normalizes AX-prefixed field names', () => {
    const raw = JSON.stringify([
      { AXType: 'Button', AXLabel: 'Tap Me', AXValue: 'active', AXFrame: { x: 10, y: 20, width: 100, height: 40 } },
    ])
    const elements = parseAccessibilityOutput(raw)
    expect(elements[0].type).toBe('Button')
    expect(elements[0].name).toBe('Tap Me')
    expect(elements[0].value).toBe('active')
  })

  it('handles missing fields gracefully', () => {
    const raw = JSON.stringify([{ frame: { x: 0, y: 0, width: 50, height: 50 } }])
    const elements = parseAccessibilityOutput(raw)
    expect(elements[0].type).toBe('')
    expect(elements[0].name).toBe('')
    expect(elements[0].value).toBeUndefined()
  })

  it('returns empty array for empty input', () => {
    expect(parseAccessibilityOutput('')).toEqual([])
    expect(parseAccessibilityOutput('  ')).toEqual([])
  })

  it('handles a single JSON object (not array)', () => {
    const raw = JSON.stringify({ type: 'Button', name: 'Solo', frame: { x: 0, y: 0, width: 100, height: 50 } })
    const elements = parseAccessibilityOutput(raw)
    expect(elements).toHaveLength(1)
    expect(elements[0].name).toBe('Solo')
  })

  it('skips unparseable lines in newline-delimited mode', () => {
    const raw = [
      JSON.stringify({ type: 'Button', name: 'Good', frame: { x: 0, y: 0, width: 100, height: 50 } }),
      'not json at all',
      JSON.stringify({ type: 'Text', name: 'Also Good', frame: { x: 0, y: 0, width: 200, height: 30 } }),
    ].join('\n')
    const elements = parseAccessibilityOutput(raw)
    expect(elements).toHaveLength(2)
  })
})
