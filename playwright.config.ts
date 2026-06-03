import { defineConfig, devices } from '@playwright/test'

const localChromeChannel = process.env.CI ? {} : { channel: 'chrome' as const }

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5173',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: 'http://127.0.0.1:5173',
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: {
        ...devices['Desktop Chrome'],
        ...localChromeChannel,
        viewport: { width: 1440, height: 900 },
        launchOptions: {
          args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist'],
        },
      },
    },
    {
      name: 'mobile-chromium',
      use: {
        ...devices['Pixel 7'],
        ...localChromeChannel,
        launchOptions: {
          args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist'],
        },
      },
    },
  ],
})
