import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'platform-android-integration',
    include: ['src/__integration__/**/*.test.ts'],
    testTimeout: 120_000,
    passWithNoTests: true,
  },
})
