import type { AccessibilityElement } from '@scout-mobile/core'

/**
 * Parse the XML produced by `adb exec-out uiautomator dump /dev/tty` into Scout's
 * AccessibilityElement tree. Dependency-free: a small hand-rolled scanner walks
 * the `<node .../>` and `<node ...>...</node>` structure (uiautomator XML is
 * flat, attribute-only nodes — no text content, no namespaces).
 *
 * Mapping per node:
 *   type   ← last dotted segment of `class` (e.g. android.widget.Button → Button)
 *   name   ← `content-desc` || `text`
 *   value  ← `text`
 *   frame  ← parse `bounds="[x1,y1][x2,y2]"` → {x, y, width, height}
 *   children ← nested <node> elements
 */
export function parseUiAutomatorXml(raw: string): AccessibilityElement[] {
  if (!raw || !raw.trim()) return []

  // Strip the XML declaration if present.
  const xml = raw.replace(/<\?xml[^>]*\?>/, '')

  const { children } = parseChildren(xml, 0)
  // The top-level <hierarchy> wraps the real nodes; unwrap it if present so the
  // caller sees the actual node tree.
  return children
}

interface ParseState {
  children: AccessibilityElement[]
  index: number
}

/**
 * Parse all sibling elements starting at `start`, stopping at a closing tag of
 * the enclosing element (or end of input).
 */
function parseChildren(xml: string, start: number): ParseState {
  const children: AccessibilityElement[] = []
  let i = start

  while (i < xml.length) {
    const lt = xml.indexOf('<', i)
    if (lt === -1) break

    // Closing tag of the parent — stop here.
    if (xml[lt + 1] === '/') {
      const gt = xml.indexOf('>', lt)
      return { children, index: gt === -1 ? xml.length : gt + 1 }
    }

    const gt = xml.indexOf('>', lt)
    if (gt === -1) break

    const isSelfClosing = xml[gt - 1] === '/'
    const tagInner = xml.slice(lt + 1, isSelfClosing ? gt - 1 : gt)
    const spaceIdx = tagInner.search(/\s/)
    const tagName = (spaceIdx === -1 ? tagInner : tagInner.slice(0, spaceIdx)).trim()
    const attrs = spaceIdx === -1 ? '' : tagInner.slice(spaceIdx + 1)

    if (tagName === 'hierarchy') {
      // Unwrap: descend into the hierarchy's children directly.
      const inner = parseChildren(xml, gt + 1)
      children.push(...inner.children)
      i = inner.index
      continue
    }

    if (tagName !== 'node') {
      // Unknown tag — skip past it.
      i = gt + 1
      continue
    }

    if (isSelfClosing) {
      children.push(buildElement(attrs, []))
      i = gt + 1
    } else {
      const nested = parseChildren(xml, gt + 1)
      children.push(buildElement(attrs, nested.children))
      i = nested.index
    }
  }

  return { children, index: i }
}

function buildElement(attrs: string, childEls: AccessibilityElement[]): AccessibilityElement {
  const map = parseAttributes(attrs)
  const className = map['class'] ?? ''
  const type = className.includes('.') ? className.slice(className.lastIndexOf('.') + 1) : className
  const text = map['text'] ?? ''
  const contentDesc = map['content-desc'] ?? ''
  const name = contentDesc || text
  const frame = parseBounds(map['bounds'] ?? '')

  const el: AccessibilityElement = {
    type,
    name,
    frame,
    ...(text ? { value: text } : {}),
    ...(childEls.length > 0 ? { children: childEls } : {}),
  }
  return el
}

/**
 * Parse XML attributes (key="value") into a map. Handles standard XML entity
 * escapes that uiautomator emits inside attribute values.
 */
export function parseAttributes(attrs: string): Record<string, string> {
  const map: Record<string, string> = {}
  const re = /([\w:-]+)\s*=\s*"([^"]*)"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(attrs)) !== null) {
    map[m[1]] = unescapeXml(m[2])
  }
  return map
}

function unescapeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

/**
 * Parse a uiautomator bounds string "[x1,y1][x2,y2]" into a frame.
 * Returns a zero frame if it cannot be parsed.
 */
export function parseBounds(bounds: string): { x: number; y: number; width: number; height: number } {
  const m = bounds.match(/\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]/)
  if (!m) return { x: 0, y: 0, width: 0, height: 0 }
  const x1 = Number(m[1])
  const y1 = Number(m[2])
  const x2 = Number(m[3])
  const y2 = Number(m[4])
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 }
}

/**
 * Depth-first search for the first element whose name matches `label`.
 */
export function findElementByLabel(
  elements: AccessibilityElement[],
  label: string,
): AccessibilityElement | undefined {
  for (const el of elements) {
    if (el.name === label) return el
    if (el.children) {
      const found = findElementByLabel(el.children, label)
      if (found) return found
    }
  }
  return undefined
}

/**
 * Render an element tree as indented text (mirrors the iOS formatter).
 */
export function formatAccessibilityTree(elements: AccessibilityElement[], indent = 0): string {
  const lines: string[] = []
  const prefix = '  '.repeat(indent)
  for (const el of elements) {
    const label = el.name ? ` "${el.name}"` : ''
    const val = el.value ? ` value="${el.value}"` : ''
    const pos = `at (${el.frame.x}, ${el.frame.y}) size ${el.frame.width}x${el.frame.height}`
    lines.push(`${prefix}[${el.type}]${label}${val} ${pos}`)
    if (el.children) {
      lines.push(formatAccessibilityTree(el.children, indent + 1))
    }
  }
  return lines.join('\n')
}
