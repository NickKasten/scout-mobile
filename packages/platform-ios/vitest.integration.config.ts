import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'platform-ios-integration',
    include: ['src/__integration__/**/*.test.ts'],
    testTimeout: 60_000,
  },
})
