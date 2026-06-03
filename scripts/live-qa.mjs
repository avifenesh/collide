import { mkdir } from 'node:fs/promises'
import { chromium } from '@playwright/test'

const baseURL = process.env.COLLIDE_URL ?? 'http://127.0.0.1:5173/'
const outputDir = new URL('../docs/screenshots/', import.meta.url)

const labs = [
  { name: 'Coalescing', button: /Coalescing/ },
  { name: 'Bank Conflicts', button: /Bank Conflicts/ },
  { name: 'Divergence', button: /Divergence/ },
  { name: 'Reduce / Scan', button: /Reduce \/ Scan/ },
  { name: 'Occupancy', button: /Occupancy/ },
]

const launchOptions = {
  channel: process.env.CI ? undefined : 'chrome',
  args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist'],
}

const browser = await chromium.launch(launchOptions).catch(() =>
  chromium.launch({ args: launchOptions.args }),
)

const page = await browser.newPage({
  ignoreHTTPSErrors: true,
  viewport: { width: 1440, height: 900 },
})
const consoleMessages = []
page.on('console', (message) => {
  if (['error', 'warning'].includes(message.type())) {
    consoleMessages.push(`${message.type()}: ${message.text()}`)
  }
})

await mkdir(outputDir, { recursive: true })
await page.goto(baseURL)
await page.getByTestId('lab-canvas').waitFor({ state: 'visible' })
await page.getByText('Matches CPU reference').waitFor({ state: 'visible', timeout: 5000 })
await page.mouse.move(2, 2)
await page.screenshot({ path: new URL('desktop.png', outputDir).pathname, fullPage: false })

const labReports = []
for (const lab of labs) {
  await page.locator('.lab-list').getByRole('button', { name: lab.button }).click()
  await page.getByTestId('lab-canvas').waitFor({ state: 'visible' })
  await page.waitForTimeout(250)
  const statusText = await page.getByTestId('webgpu-status').textContent()
  const statusRows = await page.locator('.status-panel dd').allTextContents()
  labReports.push({
    lab: lab.name,
    webgpu: statusText?.replace(/\s+/g, ' ').trim(),
    runtime: statusRows[0],
    adapter: statusRows[1],
    verification: statusRows[2],
  })
}

await page.setViewportSize({ width: 390, height: 844 })
await page.goto(baseURL)
await page.getByTestId('lab-canvas').waitFor({ state: 'visible' })
await page.getByText('Matches CPU reference').waitFor({ state: 'visible', timeout: 5000 })
await page.mouse.move(2, 2)
await page.screenshot({ path: new URL('mobile.png', outputDir).pathname, fullPage: false })
await browser.close()

console.log(JSON.stringify({ baseURL, labReports, consoleMessages }, null, 2))
