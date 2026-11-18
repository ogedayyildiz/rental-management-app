import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
import { assertE2E } from './isolation.mjs';
assertE2E(process.env);
export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.mjs',
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  expect: { timeout: 15000 },
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: [
    ['list'],
    [
      'html',
      {
        outputFolder: resolve(import.meta.dirname, '../../.e2e/report'),
        open: 'never',
      },
    ],
  ],
  outputDir: resolve(import.meta.dirname, '../../.e2e/results'),
  use: {
    baseURL: 'http://127.0.0.1:3100',
    headless: true,
    actionTimeout: 15000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    browserName: 'chromium',
  },
});
