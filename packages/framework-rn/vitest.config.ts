import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'framework-rn',
    include: ['src/**/*.test.ts'],
  },
})
