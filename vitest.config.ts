import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/{unit,property}/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/lib/**'],
    },
  },
  resolve: {
    alias: { '@': new URL('./src', import.meta.url).pathname },
  },
})
