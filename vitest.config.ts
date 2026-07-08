import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

// Mirror the tsconfig `@/*` -> `./*` path alias so tests can import
// project modules (e.g. `@/lib/logger`) the same way app code does.
export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, '.'),
    },
  },
  test: {
    include: ['**/*.test.ts'],
  },
})
