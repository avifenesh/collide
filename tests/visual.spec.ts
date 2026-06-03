import { expect, test } from '@playwright/test'

test('@visual five lab canvases render non-empty screenshots', async ({ page }) => {
  await page.goto('/')
  const labs = [/Coalescing/, /Bank Conflicts/, /Divergence/, /Reduce \/ Scan/, /Occupancy/]

  for (const lab of labs) {
    await page.getByRole('button', { name: lab }).click()
    const canvas = page.getByTestId('lab-canvas')
    await expect(canvas).toBeVisible()
    const box = await canvas.boundingBox()
    expect(box?.width).toBeGreaterThan(300)
    expect(box?.height).toBeGreaterThan(300)
    const image = await canvas.screenshot()
    expect(image.length).toBeGreaterThan(20_000)
  }
})
