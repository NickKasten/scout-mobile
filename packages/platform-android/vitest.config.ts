import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'platform-android',
    include: ['src/**/*.test.ts'],
    exclude: ['src/__integration__/**'],
  },
})
