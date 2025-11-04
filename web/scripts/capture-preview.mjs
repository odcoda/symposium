import { chromium } from '@playwright/test'

const url = process.argv[2] ?? 'http://127.0.0.1:4173/'
const output = process.argv[3] ?? 'artifacts/preview.png'

const browser = await chromium.launch()
const page = await browser.newPage()
await page.goto(url, { waitUntil: 'networkidle' })
await page.setViewportSize({ width: 1280, height: 720 })
await page.waitForTimeout(1000)
await page.screenshot({ path: output, fullPage: true })
await browser.close()
console.log('Screenshot saved to', output)
