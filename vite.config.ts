import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const base = process.env.GITHUB_ACTIONS === 'true' ? '/freerooms/' : '/'

export default defineConfig({
  base,
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
