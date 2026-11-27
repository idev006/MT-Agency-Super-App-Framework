// Frontend E2E (owner 2026-11-25: "automate test FE pls"). A real browser drives the app the way an admin
// does, against an in-memory MOCK API (e2e/mock-api.js): fast, repeatable, writes no data, needs no
// credentials. Every request to any other host is blocked, so a test can never reach the live system.
// Two viewports: desktop 1280×800 and phone 375×812. Run: npm run test:e2e
import { defineConfig, devices } from '@playwright/test'
import { readFileSync } from 'node:fs'

const PORT = 4317
const trusted = JSON.parse(readFileSync(new URL('../contracts/trusted-endpoints.v1.json', import.meta.url), 'utf8'))
export const CORE_URL = `${trusted.endpoints.find((item) => item.id === 'cloud-run-core').url}/api/frontend`

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.e2e.js',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { outputFolder: 'e2e-report', open: 'never' }]] : [['list']],
  outputDir: 'e2e-results',
  use: { baseURL: `http://localhost:${PORT}/`, trace: 'retain-on-failure', screenshot: 'only-on-failure', locale: 'th-TH', timezoneId: 'Asia/Bangkok' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: 'phone', use: { ...devices['Pixel 5'], viewport: { width: 375, height: 812 } } },
  ],
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { VITE_CORE_API_URL: CORE_URL, VITE_BASE_PATH: '/', VITE_UI_PREVIEW: 'false' },
  },
})
