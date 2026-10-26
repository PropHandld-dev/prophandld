// Captures the App Store / Play Store phone screenshots directly from the
// live site, at each store's exact required dimensions (iOS 6.9": 1320×2868,
// Android phone: 1080×1920). Run this any time landing-page copy changes —
// these screenshots went stale once already (2026-10-25: a banner claim
// changed, the old screenshots still showed the old wording) because the
// capture script that one-off existed only in a session scratchpad and was
// never committed. Output: scripts/out/store-screenshots/.
//
// Usage: node scripts/capture-store-screenshots.mjs [baseUrl]
// Defaults to https://www.prophandld.com — pass a preview URL to capture
// against a deploy before it's live.
import { chromium } from 'playwright'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.argv[2] || 'https://www.prophandld.com'
const OUT_DIR = path.join(__dirname, 'out', 'store-screenshots')

// Apple's 6.9" requirement (iPhone 16 Pro Max class) and Google Play's
// recommended phone screenshot size, both at the device's real @3x pixel
// density rather than a scaled-up logical size.
const TARGETS = [
  { name: 'ios', width: 440, height: 956, scale: 3 },
  { name: 'android', width: 360, height: 640, scale: 3 },
]

// The floating help-widget button sits at a fixed position that can land
// on top of hero copy at narrower widths — hidden here the same way a
// manual capture pass found necessary, so every run gets a clean shot
// without needing that fix rediscovered each time.
async function hideFloatingWidget(page) {
  await page.evaluate(() => {
    const btn = document.querySelector('button[aria-label="Questions"]')
    if (btn) btn.style.display = 'none'
  })
}

async function captureRoleTab(page, role, outPrefix) {
  const label = role === 'landlord' ? 'Landlords' : role === 'renter' ? 'Renters' : 'Contractors'
  const tab = page.getByRole('button', { name: label, exact: true }).first()
  if (await tab.count() > 0) {
    await tab.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }))
    await page.waitForTimeout(300)
    await tab.click()
    await page.waitForTimeout(500)
  }
  await page.screenshot({ path: path.join(OUT_DIR, `${outPrefix}-${role}.png`) })
}

async function run() {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const browser = await chromium.launch()

  for (const target of TARGETS) {
    const context = await browser.newContext({
      viewport: { width: target.width, height: target.height },
      deviceScaleFactor: target.scale,
      isMobile: true,
      hasTouch: true,
    })
    const page = await context.newPage()

    await page.goto(BASE_URL, { waitUntil: 'networkidle' })
    await page.waitForTimeout(800)
    await hideFloatingWidget(page)
    await page.screenshot({ path: path.join(OUT_DIR, `${target.name}-01-hero.png`) })

    const showcase = page.locator('text=app.prophandld.com').first()
    if (await showcase.count() > 0) {
      await showcase.scrollIntoViewIfNeeded()
      await page.waitForTimeout(500)
    }
    await captureRoleTab(page, 'landlord', `${target.name}-02`)
    await captureRoleTab(page, 'renter', `${target.name}-03`)
    await captureRoleTab(page, 'contractor', `${target.name}-04`)

    const actSection = page.locator('text=Safe Healthy Homes Act').first()
    if (await actSection.count() > 0) {
      await actSection.scrollIntoViewIfNeeded()
      await page.waitForTimeout(400)
      await page.screenshot({ path: path.join(OUT_DIR, `${target.name}-05-compliance.png`) })
    }

    await context.close()
    console.log(`${target.name}: done`)
  }

  await browser.close()
  console.log(`\nScreenshots saved to ${OUT_DIR}`)
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
