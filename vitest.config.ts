import { defineConfig } from 'vitest/config'

// Separate from vite.config.ts because that file also defines the dev-server
// middleware (Jira/calendar proxying) — tests only need the plain Node env.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'server/**/*.test.ts'],
  },
})
