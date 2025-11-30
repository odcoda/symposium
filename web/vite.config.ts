import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const projectRootDir = fileURLToPath(new URL('.', import.meta.url))
const PUBLIC_BASE_PATH = '/symposium/'

export default defineConfig({
  base: PUBLIC_BASE_PATH,
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(projectRootDir, 'src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: resolve(projectRootDir, 'src/test/setup.ts'),
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
    },
  },
})
