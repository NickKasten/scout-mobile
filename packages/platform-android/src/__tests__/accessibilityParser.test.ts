import { describe, it, expect } from 'vitest'
import {
  parseUiAutomatorXml,
  parseAttributes,
  parseBounds,
  findElementByLabel,
  formatAccessibilityTree,
} from '../accessibilityParser.js'

const SAMPLE_XML = `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>
<hierarchy rotation="0">
  <node index="0" class="android.widget.FrameLayout" bounds="[0,0][1080,2400]">
    <node index="0" class="android.widget.Button" text="Submit" content-desc="" bounds="[100,200][300,280]" />
    <node index="1" class="android.widget.EditText" text="hello@example.com" content-desc="Email field" bounds="[50,400][1030,480]" />
  </node>
</hierarchy>`

describe('parseBounds', () => {
  it('parses standard bounds strings', () => {
    expect(parseBounds('[0,0][1080,2400]')).toEqual({ x: 0, y: 0, width: 1080, height: 2400 })
    expect(parseBounds('[100,200][300,280]')).toEqual({ x: 100, y: 200, width: 200, height: 80 })
  })

  it('handles negative coordinates', () => {
    expect(parseBounds('[-10,-20][30,40]')).toEqual({ x: -10, y: -20, width: 40, height: 60 })
  })

  it('returns zero frame for unparseable input', () => {
    expect(parseBounds('')).toEqual({ x: 0, y: 0, width: 0, height: 0 })
    expect(parseBounds('garbage')).toEqual({ x: 0, y: 0, width: 0, height: 0 })
  })
})

describe('parseAttributes', () => {
  it('extracts key/value attributes', () => {
    const attrs = parseAttributes('class="android.widget.Button" text="OK" bounds="[0,0][1,1]"')
    expect(attrs['class']).toBe('android.widget.Button')
    expect(attrs['text']).toBe('OK')
    expect(attrs['bounds']).toBe('[0,0][1,1]')
  })

  it('unescapes XML entities', () => {
    const attrs = parseAttributes('text="Tom &amp; Jerry &lt;3&gt;"')
    expect(attrs['text']).toBe('Tom & Jerry <3>')
  })

  it('handles content-desc with hyphen in attribute name', () => {
    const attrs = parseAttributes('content-desc="Email field"')
    expect(attrs['content-desc']).toBe('Email field')
  })
})

describe('parseUiAutomatorXml', () => {
  it('returns empty array for empty input', () => {
    expect(parseUiAutomatorXml('')).toEqual([])
    expect(parseUiAutomatorXml('   ')).toEqual([])
  })

  it('parses a nested hierarchy', () => {
    const tree = parseUiAutomatorXml(SAMPLE_XML)
    expect(tree).toHaveLength(1)
    const frame = tree[0]
    expect(frame.type).toBe('FrameLayout')
    expect(frame.frame).toEqual({ x: 0, y: 0, width: 1080, height: 2400 })
    expect(frame.children).toHaveLength(2)
  })

  it('maps class to last dotted segment', () => {
    const tree = parseUiAutomatorXml(SAMPLE_XML)
    const button = tree[0].children![0]
    expect(button.type).toBe('Button')
  })

  it('prefers content-desc over text for name, keeps text as value', () => {
    const tree = parseUiAutomatorXml(SAMPLE_XML)
    const editText = tree[0].children![1]
    expect(editText.name).toBe('Email field') // content-desc wins
    expect(editText.value).toBe('hello@example.com') // text → value
  })

  it('falls back to text for name when content-desc empty', () => {
    const tree = parseUiAutomatorXml(SAMPLE_XML)
    const button = tree[0].children![0]
    expect(button.name).toBe('Submit')
  })

  it('parses self-closing and container nodes alike', () => {
    const xml = `<hierarchy><node class="a.b.Outer" bounds="[0,0][10,10]"><node class="a.b.Inner" text="x" bounds="[1,1][2,2]"/></node></hierarchy>`
    const tree = parseUiAutomatorXml(xml)
    expect(tree[0].type).toBe('Outer')
    expect(tree[0].children![0].type).toBe('Inner')
  })
})

describe('findElementByLabel', () => {
  it('finds a top-level element', () => {
    const tree = parseUiAutomatorXml(SAMPLE_XML)
    const found = findElementByLabel(tree, 'Submit')
    expect(found?.type).toBe('Button')
  })

  it('finds a nested element by content-desc', () => {
    const tree = parseUiAutomatorXml(SAMPLE_XML)
    const found = findElementByLabel(tree, 'Email field')
    expect(found?.type).toBe('EditText')
  })

  it('returns undefined when not found', () => {
    const tree = parseUiAutomatorXml(SAMPLE_XML)
    expect(findElementByLabel(tree, 'Nope')).toBeUndefined()
  })
})

describe('formatAccessibilityTree', () => {
  it('renders indented element lines', () => {
    const tree = parseUiAutomatorXml(SAMPLE_XML)
    const out = formatAccessibilityTree(tree)
    expect(out).toContain('[FrameLayout]')
    expect(out).toContain('[Button] "Submit"')
    expect(out).toContain('value="hello@example.com"')
  })
})
