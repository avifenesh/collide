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
  await expect(page.getByLabel('Share URL')).toHaveValue(/lab=banks/)
  await expect(page.getByLabel('Share URL')).toHaveValue(/preset=stride-2/)
})

test('top actions reveal notes, cycle examples, share fallback, and help copy', async ({ page }) => {
  await page.goto('/')

  await page.getByRole('button', { name: 'Docs' }).click()
  await expect(page.getByRole('button', { name: /Notes/ })).toHaveClass(/active/)
  await expect(page.getByRole('heading', { name: /What This Shows/ })).toBeVisible()
  await expect(page.getByTestId('help-popover')).toContainText('Notes explain the concept')

  await page.getByRole('button', { name: 'Next Example' }).click()
  await expect(page.getByText('Current preset:')).toBeVisible()
  await expect(page.getByText('Strided').first()).toBeVisible()
  await expect(page.getByText('50.0 %')).toBeVisible()

  await page.getByRole('button', { name: 'Help' }).click()
  await expect(page.getByTestId('help-panel')).toContainText('Pick a lab on the left')

  await page.getByRole('button', { name: /Explain labs/i }).click()
  await expect(page.getByTestId('help-popover')).toContainText('Switch labs to change the primitive')

  await page.getByRole('button', { name: /Share|Copied/ }).click()
  await expect(page.getByLabel('Share URL')).toHaveValue(/preset=strided/)
})

test('timeline transport controls move, play, pause, and reset predictably', async ({ page }) => {
  await page.goto('/')

  const backButton = page.locator('.transport').getByTitle('Back to dispatch')
  const playButton = page.locator('.transport').getByTitle('Play timeline')
  const nextButton = page.locator('.transport').getByTitle('Next stage')

  await expect(page.getByText(/Stage\s+1\s+\/\s+5/)).toBeVisible()
  await expect(backButton).toBeDisabled()

  await nextButton.click()
  await expect(page.getByText(/Stage\s+2\s+\/\s+5/)).toBeVisible()
  await expect(backButton).toBeEnabled()

  await page.locator('.step-track').getByRole('button', { name: 'Memory', exact: true }).click()
  await expect(page.getByText(/Stage\s+3\s+\/\s+5/)).toBeVisible()

  await playButton.click()
  await expect(page.locator('.transport').getByTitle('Pause timeline')).toBeVisible()
  await expect(page.getByText(/Stage\s+[45]\s+\/\s+5/)).toBeVisible({ timeout: 1500 })
  await page.locator('.transport').getByTitle('Pause timeline').click()
  await expect(page.locator('.transport').getByTitle('Play timeline')).toBeVisible()

  await page.getByRole('button', { name: /Reset Lab/ }).click()
  await expect(page.getByText(/Stage\s+1\s+\/\s+5/)).toBeVisible()
  await expect(page.getByText('Contiguous').first()).toBeVisible()
})

test('inspector tabs, reduction choice buttons, and sliders update visible state', async ({ page }) => {
  await page.goto('/')

  await page.getByRole('button', { name: /Notes/ }).click()
  await expect(page.getByRole('heading', { name: /What This Shows/ })).toBeVisible()
  await page.getByRole('button', { name: /WGSL/ }).click()
  await expect(page.getByText(/lane_address/)).toBeVisible()

  await page.getByRole('button', { name: /Reduce \/ Scan/ }).click()
  const primitiveControl = page.locator('.choice-control').filter({ hasText: 'Primitive' })
  await primitiveControl.getByRole('button', { name: 'Scan', exact: true }).click()
  await expect(primitiveControl.getByRole('button', { name: 'Scan', exact: true })).toHaveClass(/active/)
  await expect(page.locator('.metric-row').filter({ hasText: 'Active Operations' })).toContainText('31')

  await page.getByLabel(/Algorithm Step/).fill('4')
  await expect(page.getByText(/Stage\s+4\s+\/\s+5/)).toBeVisible()
  await expect(page.locator('.metric-row').filter({ hasText: 'Partner Offset' })).toContainText('8')

  await page.getByRole('button', { name: /Coalescing/ }).click()
  await page.getByLabel(/Stride/).fill('4')
  await expect(page.locator('.metric-row').filter({ hasText: 'Transactions' })).toContainText('4')
  await expect(page.locator('.metric-row').filter({ hasText: 'Efficiency' })).toContainText('25.0 %')
})

test('contextual question-mark help exists for every major workbench region', async ({ page }) => {
  await page.goto('/')
  const helpButtons = page.getByRole('button', { name: /^Explain / })
  expect(await helpButtons.count()).toBeGreaterThanOrEqual(20)

  const labels = [
    /Explain presets/i,
    /Explain parameters/i,
    /Explain stride/i,
    /Explain canvas/i,
    /Explain metrics/i,
    /Explain Transactions/,
    /Explain cycles/i,
    /Explain status/i,
    /Explain shader/i,
    /Explain timeline stage 0/i,
  ]

  for (const label of labels) {
    await page.getByRole('button', { name: label }).first().click()
    await expect(page.getByTestId('help-popover').or(page.getByTestId('inline-help')).first()).toBeVisible()
  }
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
