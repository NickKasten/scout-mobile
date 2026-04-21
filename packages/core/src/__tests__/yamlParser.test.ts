import { describe, it, expect } from 'vitest'
import { parseSimpleYaml } from '../loop/yamlParser.js'

describe('parseSimpleYaml', () => {
  it('parses simple key-value pairs', () => {
    const result = parseSimpleYaml('name: hello\nversion: 1')
    expect(result).toEqual({ name: 'hello', version: 1 })
  })

  it('parses nested maps', () => {
    const yaml = `parent:
  child: value
  other: 42`
    expect(parseSimpleYaml(yaml)).toEqual({ parent: { child: 'value', other: 42 } })
  })

  it('parses simple arrays', () => {
    const yaml = `items:
  - one
  - two
  - three`
    expect(parseSimpleYaml(yaml)).toEqual({ items: ['one', 'two', 'three'] })
  })

  it('parses array of maps', () => {
    const yaml = `steps:
  - tap:
      element: Submit
  - type:
      text: hello`
    expect(parseSimpleYaml(yaml)).toEqual({
      steps: [
        { tap: { element: 'Submit' } },
        { type: { text: 'hello' } },
      ],
    })
  })

  it('parses booleans', () => {
    const result = parseSimpleYaml('enabled: true\ndisabled: false')
    expect(result).toEqual({ enabled: true, disabled: false })
  })

  it('parses null values', () => {
    const result = parseSimpleYaml('empty: null\ntilde: ~')
    expect(result).toEqual({ empty: null, tilde: null })
  })

  it('parses quoted strings', () => {
    const yaml = `single: 'hello world'\ndouble: "foo bar"`
    expect(parseSimpleYaml(yaml)).toEqual({ single: 'hello world', double: 'foo bar' })
  })

  it('parses numbers', () => {
    const yaml = `int: 42\nfloat: 3.14\nneg: -7`
    expect(parseSimpleYaml(yaml)).toEqual({ int: 42, float: 3.14, neg: -7 })
  })

  it('ignores comments', () => {
    const yaml = `# top comment
name: test # inline comment
# another comment
value: 1`
    expect(parseSimpleYaml(yaml)).toEqual({ name: 'test', value: 1 })
  })

  it('ignores blank lines', () => {
    const yaml = `name: test

value: 1

`
    expect(parseSimpleYaml(yaml)).toEqual({ name: 'test', value: 1 })
  })

  it('returns empty object for empty input', () => {
    expect(parseSimpleYaml('')).toEqual({})
    expect(parseSimpleYaml('   \n\n  ')).toEqual({})
  })

  it('parses a realistic flows.yaml', () => {
    const yaml = `flows:
  - name: login
    steps:
      - tap:
          element: Username
      - type:
          text: admin
      - tap:
          element: Password
      - type:
          text: secret
      - tap:
          element: Submit
      - assert:
          visible: Welcome`
    const result = parseSimpleYaml(yaml) as { flows: unknown[] }
    expect(result.flows).toHaveLength(1)
    const flow = result.flows[0] as { name: string; steps: unknown[] }
    expect(flow.name).toBe('login')
    expect(flow.steps).toHaveLength(6)
  })

  it('preserves hash inside quoted strings', () => {
    const yaml = `color: "#ff0000"`
    expect(parseSimpleYaml(yaml)).toEqual({ color: '#ff0000' })
  })

  it('parses deeply nested structure', () => {
    const yaml = `level1:
  level2:
    level3: deep`
    expect(parseSimpleYaml(yaml)).toEqual({ level1: { level2: { level3: 'deep' } } })
  })

  it('parses array with coordinate values', () => {
    const yaml = `steps:
  - tap:
      x: 100
      y: 200`
    expect(parseSimpleYaml(yaml)).toEqual({ steps: [{ tap: { x: 100, y: 200 } }] })
  })
})
