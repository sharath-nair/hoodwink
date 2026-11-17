import { defineConfig } from '@playwright/test';

const PARTY_PORT = 4999;
const WEB_PORT = 4000;

/**
 * Dedicated ports so E2E never collides with `npm run dev`.
 * - Party server runs with E2E=1 (short phase timers).
 * - Web app is a production build (stable, no on-demand compile jitter), pointed at the E2E party server.
 *
 * Browser: set E2E_CHANNEL=chrome to use an installed Chrome (no download),
 * otherwise run `npx playwright install chromium` once.
 */
export default defineConfig({
  testDir: './tests',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    channel: process.env.E2E_CHANNEL || undefined,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: `npx partykit dev --port ${PARTY_PORT} --var E2E=1`,
      cwd: '../apps/party',
      port: PARTY_PORT,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `npx next build && npx next start --port ${WEB_PORT}`,
      cwd: '../apps/web',
      env: { NEXT_PUBLIC_PARTYKIT_HOST: `127.0.0.1:${PARTY_PORT}` },
      port: WEB_PORT,
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
