import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    base: env.VITE_BASE_PATH || '/',
    plugins: [vue(), tailwindcss()],
    // dev server only: compile the app ahead of the first request, so the first page (and the first wave of
    // parallel E2E tests) does not wait on on-demand compiling — E2E flake 2026-11-28 was a cold-start timeout
    server: { warmup: { clientFiles: ['./src/main.js', './src/**/*.vue'] } },
    test: {
      environment: 'node',
      restoreMocks: true,
    },
  }
})
