const { chromium } = require('playwright')

async function main() {
  const browser = await chromium.launch()
  const ctx = await browser.newContext()
  const page = await ctx.newPage()

  const ingestPosts = []
  page.on('request', (req) => {
    if (req.url().includes('/ingest') && req.method() === 'POST') {
      ingestPosts.push(req.url())
      console.log('POST:', req.url(), req.postData()?.slice(0, 400))
    }
  })

  await page.goto('https://www.prophandld.com/')
  await page.waitForTimeout(3000)
  console.log('--- navigating client-side to /pricing to force a flush ---')
  await page.click('a[href="/pricing"]').catch(async () => {
    await page.goto('https://www.prophandld.com/pricing')
  })
  await page.waitForTimeout(3000)
  console.log('--- hiding tab (visibilitychange) to trigger beacon flush ---')
  await page.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')) })
  await page.waitForTimeout(2000)

  console.log('Total /ingest POSTs seen:', ingestPosts.length)
  await browser.close()
}

main().catch((e) => { console.error(e); process.exit(1) })
