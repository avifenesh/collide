import { expect, test } from '@playwright/test'

test('app loads the workbench and core controls without console errors', async ({ page }) => {
  const messages: string[] = []
  page.on('console', (message) => {
    if (['error', 'warning'].includes(message.type())) {
      messages.push(`${message.type()}: ${message.text()}`)
    }
  })

  await page.goto('/')
  await expect(page).toHaveTitle(/Collide/)
  await expect(page.getByRole('heading', { name: 'Memory Coalescing' })).toBeVisible()
  await expect(page.getByTestId('lab-canvas')).toBeVisible()
  await expect(page.getByRole('button', { name: /Docs/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Share/ })).toBeVisible()
  await expect(page.getByText('Metrics (Live)')).toBeVisible()

  await page.getByRole('button', { name: /Strided/ }).click()
  await expect(page.getByText('50.0 %')).toBeVisible()
  await expect(page.getByText('256 B').first()).toBeVisible()
  expect(messages).toEqual([])
})

test('each 1.0 lab renders a compute-backed metric surface', async ({ page }) => {
  await page.goto('/')
  const labChecks = [
    { button: /Bank Conflicts/, metric: 'Conflict Degree', preset: /Stride 16/, expected: '16x' },
    { button: /Divergence/, metric: 'Serialized Paths', preset: /Alternating/, expected: '2' },
    { button: /Reduce \/ Scan/, metric: 'Active Operations', preset: /Prefix Scan/, expected: '31' },
    { button: /Occupancy/, metric: 'Resident Warps', preset: /Shared Heavy/, expected: '8 / 64' },
  ]

  for (const check of labChecks) {
    await page.getByRole('button', { name: check.button }).click()
    await expect(page.locator('.metric-row').filter({ hasText: check.metric })).toBeVisible()
    await page.getByRole('button', { name: check.preset }).click()
    await expect(page.getByText(check.expected).first()).toBeVisible()
  }
})

test('share URL contains the selected lab state', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://127.0.0.1:5173' })
  await page.goto('/')
  await page.getByRole('button', { name: /Bank Conflicts/ }).click()
  await page.getByRole('button', { name: /Stride 2/ }).click()
  await page.getByRole('button', { name: /Share/ }).click()
  await expect(page.getByRole('button', { name: /Copied/ })).toBeVisible()
  const text = await page.evaluate(() => navigator.clipboard.readText())
  expect(text).toContain('lab=banks')
  expect(text).toContain('preset=stride-2')
})

test('WebGPU status renders either enabled or unsupported fallback', async ({ page }) => {
  await page.goto('/')
  const hasGpu = await page.evaluate(() => Boolean(navigator.gpu))
  const status = page.getByTestId('webgpu-status')
  await expect(status).toBeVisible()

  if (hasGpu) {
    await expect(status).toContainText(/Enabled|Initializing/)
  } else {
    await expect(page.getByTestId('webgpu-unavailable')).toContainText('secure context')
  }
})

test('mobile viewport keeps all workbench regions reachable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Memory Coalescing' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Bank Conflicts/ })).toBeVisible()
  await expect(page.getByTestId('lab-canvas')).toBeVisible()
  await expect(page.getByText('Metrics (Live)')).toBeVisible()
})
