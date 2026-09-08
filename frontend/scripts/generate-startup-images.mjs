// Render native startup PNGs from the production LaunchScreen workbench example.
// Requires the workbench at STARTUP_WORKBENCH_URL (default localhost:4001).
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'
import { appleStartupImages } from '../src/lib/pwa/startup-images.ts'

const browser = await chromium.launch()
try {
  await mkdir('public/splash', { recursive: true })
  for (const screen of appleStartupImages) {
    const context = await browser.newContext({
      viewport: { width: screen.width, height: screen.height },
      deviceScaleFactor: screen.scale,
      reducedMotion: 'reduce',
    })
    const page = await context.newPage()
    const url = new URL(
      process.env.STARTUP_WORKBENCH_URL ?? 'http://localhost:4001',
    )
    url.search = new URLSearchParams({
      frame: 'true',
      example: 'launch-screen',
      state: 'native',
      mode: 'oled',
      width: String(screen.width),
    }).toString()
    await page.goto(url.href)
    await page.locator('main h1').waitFor()
    await page.evaluate(() => document.fonts.ready)
    // Capture only the production surface, without workbench chrome.
    const main = page.locator('main')
    const png = await main.screenshot({
      path: `public${screen.href}`,
      animations: 'disabled',
    })
    if (
      png.readUInt32BE(16) !== screen.pixelWidth ||
      png.readUInt32BE(20) !== screen.pixelHeight
    ) {
      throw new Error(`Unexpected startup image dimensions: ${screen.href}`)
    }
    await context.close()
  }
  console.log(`Rendered ${appleStartupImages.length} native startup images.`)
} finally {
  await browser.close()
}
