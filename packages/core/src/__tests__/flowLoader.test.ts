import { describe, it, expect, vi, beforeEach } from 'vitest'
import { loadFlows, findFlow } from '../loop/flowLoader.js'
import { ScoutValidationError } from '../errors.js'
import * as fs from 'node:fs'

vi.mock('node:fs')

const VALID_YAML = `flows:
  - name: login
    steps:
      - tap:
          element: Username
      - type:
          text: admin
      - assert:
          visible: Welcome`

const MULTI_FLOW_YAML = `flows:
  - name: login
    steps:
      - tap:
          element: Login
  - name: logout
    steps:
      - tap:
          element: Logout`

beforeEach(() => {
  vi.clearAllMocks()
})

describe('loadFlows', () => {
  it('loads and parses a valid flows.yaml', () => {
    vi.mocked(fs.readFileSync).mockReturnValue(VALID_YAML)
    const flows = loadFlows('flows.yaml', '/project')
    expect(flows).toHaveLength(1)
    expect(flows[0].name).toBe('login')
    expect(flows[0].steps).toHaveLength(3)
  })

  it('loads multiple flows', () => {
    vi.mocked(fs.readFileSync).mockReturnValue(MULTI_FLOW_YAML)
    const flows = loadFlows('flows.yaml', '/project')
    expect(flows).toHaveLength(2)
    expect(flows[0].name).toBe('login')
    expect(flows[1].name).toBe('logout')
  })

  it('throws on missing flows key', () => {
    vi.mocked(fs.readFileSync).mockReturnValue('name: test')
    expect(() => loadFlows('flows.yaml', '/project')).toThrow(ScoutValidationError)
    expect(() => loadFlows('flows.yaml', '/project')).toThrow('top-level "flows" array')
  })

  it('throws on invalid flow name', () => {
    vi.mocked(fs.readFileSync).mockReturnValue(`flows:
  - name: invalid name!
    steps:
      - tap:
          element: X`)
    expect(() => loadFlows('flows.yaml', '/project')).toThrow(ScoutValidationError)
  })

  it('throws on missing steps array', () => {
    vi.mocked(fs.readFileSync).mockReturnValue(`flows:
  - name: test`)
    expect(() => loadFlows('flows.yaml', '/project')).toThrow('"steps" array')
  })

  it('throws on invalid step key', () => {
    vi.mocked(fs.readFileSync).mockReturnValue(`flows:
  - name: test
    steps:
      - click:
          element: X`)
    expect(() => loadFlows('flows.yaml', '/project')).toThrow('must have one of')
  })

  it('throws on path traversal', () => {
    expect(() => loadFlows('../../../etc/passwd', '/project')).toThrow(ScoutValidationError)
  })

  it('parses tap with coordinates', () => {
    vi.mocked(fs.readFileSync).mockReturnValue(`flows:
  - name: coords
    steps:
      - tap:
          x: 100
          y: 200`)
    const flows = loadFlows('flows.yaml', '/project')
    const step = flows[0].steps[0]
    expect('tap' in step && step.tap.x).toBe(100)
    expect('tap' in step && step.tap.y).toBe(200)
  })

  it('parses swipe with direction', () => {
    vi.mocked(fs.readFileSync).mockReturnValue(`flows:
  - name: swiper
    steps:
      - swipe:
          direction: up`)
    const flows = loadFlows('flows.yaml', '/project')
    const step = flows[0].steps[0]
    expect('swipe' in step && step.swipe.direction).toBe('up')
  })

  it('parses press step', () => {
    vi.mocked(fs.readFileSync).mockReturnValue(`flows:
  - name: keys
    steps:
      - press:
          key: return`)
    const flows = loadFlows('flows.yaml', '/project')
    const step = flows[0].steps[0]
    expect('press' in step && step.press.key).toBe('return')
  })
})

describe('findFlow', () => {
  const flows = [
    { name: 'login', steps: [{ tap: { element: 'Login' } }] },
    { name: 'logout', steps: [{ tap: { element: 'Logout' } }] },
  ]

  it('finds a flow by name', () => {
    const flow = findFlow(flows, 'login')
    expect(flow.name).toBe('login')
  })

  it('throws on unknown flow name', () => {
    expect(() => findFlow(flows, 'signup')).toThrow(ScoutValidationError)
    expect(() => findFlow(flows, 'signup')).toThrow('Flow not found')
  })

  it('throws on invalid flow name characters', () => {
    expect(() => findFlow(flows, 'bad name!')).toThrow(ScoutValidationError)
  })
})
