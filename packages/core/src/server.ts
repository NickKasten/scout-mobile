import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { PlatformAdapter, AdapterMeta, DeviceInfo, BootResult } from './adapters/PlatformAdapter.js'
import type { FrameworkAdapter } from './adapters/FrameworkAdapter.js'
import { loadFlows, findFlow } from './loop/flowLoader.js'
import { runFlow } from './loop/flowRunner.js'

const DEFAULT_META: AdapterMeta = {
  displayName: 'device',
  installArtifact: 'app bundle',
  gestureToolingNote: '',
}

function formatDimensions(info: DeviceInfo): string {
  if (info.width > 0 && info.height > 0) {
    return ` (${info.width}x${info.height} logical points)`
  }
  return ' (unknown dimensions)'
}

/**
 * Append a parenthetical tooling note (e.g. "requires idb") when the adapter
 * declares one. Returns the base text unchanged when there is no note.
 */
function withTooling(base: string, meta: AdapterMeta): string {
  return meta.gestureToolingNote ? `${base} (${meta.gestureToolingNote})` : base
}

export function createScoutServer(adapter: PlatformAdapter, framework?: FrameworkAdapter): McpServer {
  const server = new McpServer({
    name: 'scout',
    version: '0.0.1',
  })

  const meta: AdapterMeta = adapter.meta ?? DEFAULT_META

  /**
   * Register a tool under its canonical `device_*` name and a deprecated
   * `simulator_*` alias that shares the same schema and handler. The alias keeps
   * existing `.mcp.json` configs and early adopters working.
   */
  const registerDual = (
    canonical: string,
    alias: string,
    description: string,
    schema: Record<string, z.ZodType>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    handler: (args: any) => Promise<any>,
  ): void => {
    server.tool(canonical, description, schema, handler)
    server.tool(alias, `[DEPRECATED alias for ${canonical}] ${description}`, schema, handler)
  }

  // Track device info for enriching responses
  let lastDeviceInfo: DeviceInfo | undefined

  server.tool(
    'scout_check_environment',
    `Check if the current environment has the required tools to run Scout (${meta.displayName})`,
    {},
    async () => {
      try {
        const report = await adapter.checkEnvironment()
        const lines = report.checks.map((c) => {
          const status = c.ok ? '✓' : '✗'
          const hint = c.hint ? ` (${c.hint})` : ''
          return `${status} ${c.name}: ${c.message}${hint}`
        })
        lines.unshift(report.ok ? 'Environment OK' : 'Environment issues detected')
        return { content: [{ type: 'text', text: lines.join('\n') }] }
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        }
      }
    },
  )

  registerDual(
    'device_boot',
    'simulator_boot',
    `Boot a ${meta.displayName} device. Defaults to the standard device if none is specified.`,
    { device: z.string().optional().describe('Device name or identifier (e.g. "iPhone 17 Pro" / "Pixel_Fold_API_35")') },
    async ({ device }) => {
      try {
        const result: BootResult = await adapter.boot(device)
        lastDeviceInfo = result
        const dims = formatDimensions(result)
        const lines = [`${meta.displayName} booted: ${result.name}${dims}`, `UDID: ${result.udid}`]
        if (result.warnings && result.warnings.length > 0) {
          for (const warning of result.warnings) {
            lines.push(`⚠️ ${warning}`)
          }
          lines.push('Tip: Use the UDID above with device_boot to always target this specific device.')
        }
        return { content: [{ type: 'text', text: lines.join('\n') }] }
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        }
      }
    },
  )

  registerDual(
    'device_screenshot',
    'simulator_screenshot',
    `Take a screenshot of the currently booted ${meta.displayName}`,
    {
      delayMs: z.number().min(0).max(5000).optional().describe('Delay in milliseconds before capturing (0-5000)'),
    },
    async ({ delayMs }) => {
      try {
        const options = delayMs ? { delayMs } : undefined
        const { data, mimeType } = await adapter.screenshot(options)
        const content: Array<{ type: 'image'; data: string; mimeType: string } | { type: 'text'; text: string }> = [
          { type: 'image', data, mimeType },
        ]
        if (lastDeviceInfo && lastDeviceInfo.width > 0) {
          content.push({
            type: 'text',
            text: `Device: ${lastDeviceInfo.name} — coordinate space: ${lastDeviceInfo.width}x${lastDeviceInfo.height} logical points`,
          })
        }
        return { content }
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        }
      }
    },
  )

  registerDual(
    'device_install',
    'simulator_install',
    `Install an app (${meta.installArtifact}) on the currently booted ${meta.displayName}`,
    { bundlePath: z.string().describe(`Path to the ${meta.installArtifact} to install`) },
    async ({ bundlePath }) => {
      try {
        await adapter.install(bundlePath)
        return { content: [{ type: 'text', text: `App installed: ${bundlePath}` }] }
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        }
      }
    },
  )

  registerDual(
    'device_launch',
    'simulator_launch',
    `Launch an installed app on the currently booted ${meta.displayName} by bundle ID`,
    { bundleId: z.string().describe('Bundle/package identifier (e.g. "com.example.app")') },
    async ({ bundleId }) => {
      try {
        await adapter.launch(bundleId)
        return { content: [{ type: 'text', text: `App launched: ${bundleId}` }] }
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        }
      }
    },
  )

  registerDual(
    'device_tap',
    'simulator_tap',
    withTooling(`Tap a point on the ${meta.displayName} screen`, meta),
    {
      x: z.number().describe('X coordinate'),
      y: z.number().describe('Y coordinate'),
    },
    async ({ x, y }) => {
      try {
        await adapter.tap({ x, y })
        return { content: [{ type: 'text', text: `Tapped at (${x}, ${y})` }] }
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        }
      }
    },
  )

  registerDual(
    'device_swipe',
    'simulator_swipe',
    withTooling(`Swipe on the ${meta.displayName} screen from one point to another`, meta),
    {
      startX: z.number().describe('Start X coordinate'),
      startY: z.number().describe('Start Y coordinate'),
      endX: z.number().describe('End X coordinate'),
      endY: z.number().describe('End Y coordinate'),
    },
    async ({ startX, startY, endX, endY }) => {
      try {
        await adapter.swipe({ x: startX, y: startY }, { x: endX, y: endY })
        return { content: [{ type: 'text', text: `Swiped from (${startX}, ${startY}) to (${endX}, ${endY})` }] }
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        }
      }
    },
  )

  registerDual(
    'device_log_stream',
    'simulator_log_stream',
    `Capture system logs from the booted ${meta.displayName} for a specified duration`,
    {
      seconds: z.number().min(1).max(30).describe('Duration in seconds to capture logs (1-30)'),
      bundleId: z.string().optional().describe('Filter logs to this bundle/package ID (e.g. "com.example.app")'),
      processName: z.string().optional().describe('Filter logs to this process name'),
    },
    async ({ seconds, bundleId, processName }) => {
      try {
        const options = (bundleId || processName) ? { bundleId, processName } : undefined
        const lines: string[] = []
        const stream = await adapter.logStream((line) => {
          lines.push(line)
        }, options)

        await new Promise((resolve) => setTimeout(resolve, seconds * 1000))
        stream.stop()

        const text = lines.length > 0
          ? lines.join('\n')
          : '(no log output captured)'

        return { content: [{ type: 'text', text }] }
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        }
      }
    },
  )

  registerDual(
    'device_type_text',
    'simulator_type_text',
    withTooling(`Type text into the currently focused field on the ${meta.displayName}`, meta),
    {
      text: z.string().describe('Text to type into the focused field'),
    },
    async ({ text }) => {
      try {
        await adapter.typeText(text)
        return { content: [{ type: 'text', text: `Typed: "${text}"` }] }
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        }
      }
    },
  )

  registerDual(
    'device_press_key',
    'simulator_press_key',
    withTooling(`Press a key on the ${meta.displayName}. Allowed keys: return, tab, space, deleteBackspace, delete, escape, upArrow, downArrow, leftArrow, rightArrow, home, end, pageUp, pageDown`, meta),
    {
      key: z.string().describe('Key name (e.g. "return", "tab", "deleteBackspace")'),
    },
    async ({ key }) => {
      try {
        await adapter.pressKey(key)
        return { content: [{ type: 'text', text: `Pressed key: ${key}` }] }
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        }
      }
    },
  )

  registerDual(
    'device_clear_text',
    'simulator_clear_text',
    withTooling(`Clear text from the currently focused field on the ${meta.displayName}. Attempts to select-all and delete; falls back to repeated backspace.`, meta),
    {},
    async () => {
      try {
        await adapter.clearText()
        return { content: [{ type: 'text', text: 'Text cleared' }] }
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        }
      }
    },
  )

  registerDual(
    'device_tap_element',
    'simulator_tap_element',
    withTooling(`Tap an element by its accessibility label on the ${meta.displayName}. Finds the element in the accessibility tree and taps its center.`, meta),
    {
      label: z.string().describe('Accessibility label of the element to tap'),
    },
    async ({ label }) => {
      try {
        const { element } = await adapter.tapElement(label)
        const cx = Math.round(element.frame.x + element.frame.width / 2)
        const cy = Math.round(element.frame.y + element.frame.height / 2)
        return {
          content: [{
            type: 'text',
            text: `Tapped [${element.type}] "${element.name}" at (${cx}, ${cy})`,
          }],
        }
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        }
      }
    },
  )

  registerDual(
    'device_accessibility_tree',
    'simulator_accessibility_tree',
    withTooling(`Get the accessibility tree of the currently displayed screen on the ${meta.displayName}. Returns element types, names, values, and positions.`, meta),
    {},
    async () => {
      try {
        const tree = await adapter.accessibilityTree()
        // Format as a readable tree for Claude
        const lines: string[] = []
        for (const el of tree.elements) {
          formatElement(el, lines, 0)
        }
        const text = lines.length > 0
          ? lines.join('\n')
          : '(no accessibility elements found)'
        return { content: [{ type: 'text', text }] }
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        }
      }
    },
  )

  registerDual(
    'device_run_flow',
    'simulator_run_flow',
    'Run a named UI flow from a flows.yaml file. Executes steps sequentially (tap, type, press, swipe, assert) and reports pass/fail results.',
    {
      flowName: z.string().describe('Name of the flow to run (must match a flow in flows.yaml)'),
      flowsPath: z.string().optional().describe('Path to flows.yaml file (default: ./flows.yaml)'),
    },
    async ({ flowName, flowsPath }) => {
      try {
        const projectRoot = process.cwd()
        const path = flowsPath ?? './flows.yaml'
        const flows = loadFlows(path, projectRoot)
        const flow = findFlow(flows, flowName)
        const result = await runFlow(adapter, flow)

        const lines: string[] = []
        lines.push(`Flow: ${result.flowName}`)
        lines.push(`Result: ${result.success ? 'PASS' : 'FAIL'}`)
        lines.push(`Duration: ${result.durationMs}ms`)
        lines.push('')

        for (let i = 0; i < result.steps.length; i++) {
          const s = result.steps[i]
          const status = s.success ? '✓' : '✗'
          const stepDesc = Object.keys(s.step)[0]
          lines.push(`  ${status} Step ${i + 1}: ${stepDesc} (${s.durationMs}ms)`)
          if (s.error) {
            lines.push(`    Error: ${s.error}`)
          }
        }

        if (result.issues.length > 0) {
          lines.push('')
          lines.push('Issues:')
          for (const issue of result.issues) {
            lines.push(`  [${issue.severity.toUpperCase()}] ${issue.message}`)
            if (issue.suggestedFix) lines.push(`    Fix: ${issue.suggestedFix}`)
          }
        }

        return {
          content: [{ type: 'text', text: lines.join('\n') }],
          isError: !result.success,
        }
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        }
      }
    },
  )

  return server
}

function formatElement(el: { type: string; name: string; value?: string; frame: { x: number; y: number; width: number; height: number }; children?: unknown[] }, lines: string[], indent: number): void {
  const prefix = '  '.repeat(indent)
  const label = el.name ? ` "${el.name}"` : ''
  const val = el.value ? ` value="${el.value}"` : ''
  lines.push(`${prefix}[${el.type}]${label}${val} at (${el.frame.x}, ${el.frame.y}) size ${el.frame.width}x${el.frame.height}`)
  if (Array.isArray(el.children)) {
    for (const child of el.children) {
      formatElement(child as typeof el, lines, indent + 1)
    }
  }
}
