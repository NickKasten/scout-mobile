import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { PlatformAdapter } from './adapters/PlatformAdapter.js'
import type { FrameworkAdapter } from './adapters/FrameworkAdapter.js'

export function createScoutServer(adapter: PlatformAdapter, framework?: FrameworkAdapter): McpServer {
  const server = new McpServer({
    name: 'scout',
    version: '0.0.1',
  })

  server.tool(
    'scout_check_environment',
    'Check if the current environment has the required tools (Xcode, simctl, etc.) to run Scout',
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

  server.tool(
    'simulator_boot',
    'Boot an iOS Simulator device. Defaults to iPhone 16 Pro if no device name is specified.',
    { device: z.string().optional().describe('Simulator device name (e.g. "iPhone 16 Pro")') },
    async ({ device }) => {
      try {
        await adapter.boot(device)
        return { content: [{ type: 'text', text: `Simulator booted: ${device ?? 'iPhone 16 Pro (default)'}` }] }
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        }
      }
    },
  )

  server.tool(
    'simulator_screenshot',
    'Take a screenshot of the currently booted iOS Simulator',
    {},
    async () => {
      try {
        const { data, mimeType } = await adapter.screenshot()
        return { content: [{ type: 'image', data, mimeType }] }
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        }
      }
    },
  )

  server.tool(
    'simulator_install',
    'Install an app bundle (.app) on the currently booted iOS Simulator',
    { bundlePath: z.string().describe('Path to the .app bundle to install') },
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

  server.tool(
    'simulator_launch',
    'Launch an installed app on the currently booted iOS Simulator by bundle ID',
    { bundleId: z.string().describe('Bundle identifier (e.g. "com.example.app")') },
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

  server.tool(
    'simulator_tap',
    'Tap a point on the iOS Simulator screen (requires idb)',
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

  server.tool(
    'simulator_swipe',
    'Swipe on the iOS Simulator screen from one point to another (requires idb)',
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

  server.tool(
    'simulator_log_stream',
    'Capture system logs from the booted iOS Simulator for a specified duration',
    {
      seconds: z.number().min(1).max(30).describe('Duration in seconds to capture logs (1-30)'),
    },
    async ({ seconds }) => {
      try {
        const lines: string[] = []
        const stream = await adapter.logStream((line) => {
          lines.push(line)
        })

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

  return server
}
