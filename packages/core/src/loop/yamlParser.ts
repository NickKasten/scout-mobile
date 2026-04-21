/**
 * Minimal YAML parser for Scout's flows.yaml subset.
 * Supports: key:value maps, - item arrays, nested 2-space indentation,
 * quoted/unquoted strings, numbers, booleans, comments, blank lines.
 * Does NOT support: anchors, aliases, multi-line strings, flow []/{} syntax.
 */

type YamlValue = string | number | boolean | null | YamlValue[] | { [key: string]: YamlValue }

export function parseSimpleYaml(input: string): YamlValue {
  const lines = input.split('\n')
  const stripped: { indent: number; text: string }[] = []

  for (const raw of lines) {
    const commentIdx = findUnquotedHash(raw)
    const line = commentIdx >= 0 ? raw.slice(0, commentIdx) : raw
    const trimmed = line.trimEnd()
    if (trimmed.length === 0) continue
    const indent = trimmed.length - trimmed.trimStart().length
    stripped.push({ indent, text: trimmed.trimStart() })
  }

  if (stripped.length === 0) return {}

  const [value] = parseBlock(stripped, 0, 0)
  return value
}

function findUnquotedHash(line: string): number {
  let inSingle = false
  let inDouble = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === "'" && !inDouble) inSingle = !inSingle
    else if (ch === '"' && !inSingle) inDouble = !inDouble
    else if (ch === '#' && !inSingle && !inDouble) {
      if (i === 0 || line[i - 1] === ' ') return i
    }
  }
  return -1
}

function parseBlock(
  lines: { indent: number; text: string }[],
  start: number,
  baseIndent: number,
): [YamlValue, number] {
  if (start >= lines.length) return [{}, start]

  const first = lines[start]
  if (first.text.startsWith('- ') || first.text === '-') {
    return parseArray(lines, start, baseIndent)
  }
  return parseMap(lines, start, baseIndent)
}

function parseArray(
  lines: { indent: number; text: string }[],
  start: number,
  baseIndent: number,
): [YamlValue[], number] {
  const result: YamlValue[] = []
  let i = start

  while (i < lines.length) {
    const { indent, text } = lines[i]
    if (indent < baseIndent) break
    if (indent !== baseIndent) break

    if (!text.startsWith('- ') && text !== '-') break

    const after = text === '-' ? '' : text.slice(2).trim()

    if (after === '') {
      // Bare "- " with block value below
      i++
      if (i < lines.length && lines[i].indent > baseIndent) {
        const [val, next] = parseBlock(lines, i, lines[i].indent)
        result.push(val)
        i = next
      } else {
        result.push(null)
      }
    } else if (after.endsWith(':') && !after.includes(': ')) {
      // "- key:" with block value below (e.g., "- tap:")
      const key = after.slice(0, -1).trim()
      i++
      if (i < lines.length && lines[i].indent > baseIndent) {
        const [val, next] = parseBlock(lines, i, lines[i].indent)
        result.push({ [key]: val })
        i = next
      } else {
        result.push({ [key]: null })
      }
    } else if (after.includes(': ') || after.includes(':')) {
      // Inline map in array item: "- name: login" possibly with more keys below
      const mapIndent = baseIndent + 2
      const fakeLines = [{ indent: mapIndent, text: after }]
      let j = i + 1
      while (j < lines.length && lines[j].indent > baseIndent) {
        fakeLines.push(lines[j])
        j++
      }
      const [val] = parseMap(fakeLines, 0, mapIndent)
      result.push(val)
      i = j
    } else {
      result.push(parseScalar(after))
      i++
    }
  }

  return [result, i]
}


function parseMap(
  lines: { indent: number; text: string }[],
  start: number,
  baseIndent: number,
): [{ [key: string]: YamlValue }, number] {
  const result: { [key: string]: YamlValue } = {}
  let i = start

  while (i < lines.length) {
    const { indent, text } = lines[i]
    if (indent < baseIndent) break
    if (indent !== baseIndent) break

    const colonIdx = text.indexOf(':')
    if (colonIdx < 0) break

    const key = text.slice(0, colonIdx).trim()
    const afterColon = text.slice(colonIdx + 1).trim()

    if (afterColon === '') {
      // Block value
      i++
      if (i < lines.length && lines[i].indent > baseIndent) {
        const [val, next] = parseBlock(lines, i, lines[i].indent)
        result[key] = val
        i = next
      } else {
        result[key] = null
      }
    } else {
      result[key] = parseScalar(afterColon)
      i++
    }
  }

  return [result, i]
}

function parseScalar(value: string): string | number | boolean | null {
  if (value === 'null' || value === '~') return null
  if (value === 'true') return true
  if (value === 'false') return false

  // Quoted strings
  if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1)
  }

  // Numbers
  if (/^-?\d+$/.test(value)) return parseInt(value, 10)
  if (/^-?\d+\.\d+$/.test(value)) return parseFloat(value)

  return value
}
