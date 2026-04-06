#!/usr/bin/env node
import { createScoutServer } from '../dist/server.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

const { IOSSimulatorAdapter } = await import('@scout-mobile/platform-ios')
const { ReactNativeAdapter } = await import('@scout-mobile/framework-rn')

const adapter = new IOSSimulatorAdapter()

const bundleId = process.env.SCOUT_BUNDLE_ID
if (bundleId) {
  const framework = new ReactNativeAdapter({
    projectRoot: process.cwd(),
    bundleId,
  })
  const server = createScoutServer(adapter, framework)
  const transport = new StdioServerTransport()
  await server.connect(transport)
} else {
  const server = createScoutServer(adapter)
  const transport = new StdioServerTransport()
  await server.connect(transport)
}
