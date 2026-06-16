#!/usr/bin/env node
import { createScoutServer } from '../dist/server.js'
import { resolveTarget } from '../dist/targetSelection.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

const target = resolveTarget(process.env, process.platform)

const PLATFORM_PACKAGES = {
  ios: '@scout-mobile/platform-ios',
  android: '@scout-mobile/platform-android',
}

const FRIENDLY_NAMES = {
  ios: 'iOS Simulator',
  android: 'Android Emulator',
}

async function loadAdapter(selected) {
  const pkg = PLATFORM_PACKAGES[selected]
  try {
    const mod = await import(pkg)
    if (selected === 'android') {
      return new mod.AndroidEmulatorAdapter()
    }
    return new mod.IOSSimulatorAdapter()
  } catch (err) {
    // Only swallow "package not installed" — surface real load/runtime errors.
    if (err && (err.code === 'ERR_MODULE_NOT_FOUND' || err.code === 'MODULE_NOT_FOUND')) {
      process.stderr.write(
        `\nScout ${FRIENDLY_NAMES[selected]} support requires the ${selected} platform adapter.\n` +
          `Install it with:\n\n  npm install ${pkg}\n\n`,
      )
      process.exit(1)
    }
    throw err
  }
}

const adapter = await loadAdapter(target)

const bundleId = process.env.SCOUT_BUNDLE_ID
if (bundleId) {
  const { ReactNativeAdapter } = await import('@scout-mobile/framework-rn')
  const framework = new ReactNativeAdapter({
    projectRoot: process.cwd(),
    bundleId,
    platform: target,
  })
  const server = createScoutServer(adapter, framework)
  const transport = new StdioServerTransport()
  await server.connect(transport)
} else {
  const server = createScoutServer(adapter)
  const transport = new StdioServerTransport()
  await server.connect(transport)
}
