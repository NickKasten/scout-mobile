import { describe, it, expect } from 'vitest'
import { resolve, sep } from 'node:path'
import { safeResolvePath } from '../validation.js'
import { ScoutValidationError } from '../errors.js'

// safeResolvePath guards report/flow file paths against traversal. The check is
// built on node:path so it adapts to the host separator automatically; these
// tests exercise the traversal cases that must hold on every OS (and document
// the posix-style inputs a user is most likely to pass).
describe('safeResolvePath cross-platform', () => {
  const base = resolve('/tmp', 'scout-base')

  it('resolves a simple child filename inside the base', () => {
    const result = safeResolvePath(base, 'report.json')
    expect(result).toBe(resolve(base, 'report.json'))
    expect(result.startsWith(base + sep)).toBe(true)
  })

  it('resolves a nested child path inside the base', () => {
    const result = safeResolvePath(base, 'sub/dir/report.json')
    expect(result.startsWith(base + sep)).toBe(true)
  })

  it('rejects parent-directory traversal with ../', () => {
    expect(() => safeResolvePath(base, '../escape.json')).toThrow(ScoutValidationError)
    expect(() => safeResolvePath(base, '../escape.json')).toThrow('Path traversal')
  })

  it('rejects deep traversal that climbs above the base', () => {
    expect(() => safeResolvePath(base, '../../../../etc/passwd')).toThrow(ScoutValidationError)
  })

  it('rejects an absolute path that points outside the base', () => {
    expect(() => safeResolvePath(base, '/etc/passwd')).toThrow(ScoutValidationError)
  })

  it('rejects a sibling directory sharing the base prefix', () => {
    // `${base}-evil` startswith `${base}` but not `${base}${sep}` — the trailing
    // separator check is what stops this from slipping through.
    expect(() => safeResolvePath(base, '../scout-base-evil/x.json')).toThrow(ScoutValidationError)
  })
})
