// AI assistant regression check: asks every question in bank.js (single
// questions) and conversations.js (multi-turn) as a real signed-in user on
// the live site and saves the answers for review.
//
//   AI_EVAL_EMAIL=... AI_EVAL_PASSWORD=... node scripts/ai-eval/run.js pm|landlord|renter [single|convo]
//
// Uses ~30 assistant messages per run, which is the per-account limit for
// 15 minutes. Answers land in scripts/ai-eval/out/<role>-<mode>.json.
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')
const SITE = process.env.AI_EVAL_SITE || 'https://www.prophandld.com'
const [role, mode = 'single'] = process.argv.slice(2)
const email = process.env.AI_EVAL_EMAIL
const password = process.env.AI_EVAL_PASSWORD
if (!role || !email || !password) {
  console.error('Usage: AI_EVAL_EMAIL=... AI_EVAL_PASSWORD=... node scripts/ai-eval/run.js pm|landlord|renter [single|convo]')
  process.exit(1)
}
const items = mode === 'convo' ? require('./conversations.js')[role] : require('./bank.js')[role].map((q) => [q])

;(async () => {
  const browser = await chromium.launch()
  const page = await (await browser.newContext()).newPage()
  await page.goto(SITE + '/login', { waitUntil: 'load' })
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', password)
  await page.click('button[type="submit"]')
  await page.waitForTimeout(6000)
  await page.goto(SITE + '/profile', { waitUntil: 'load' })
  const out = []
  for (const convo of items) {
    const history = []
    for (const q of convo) {
      const t0 = Date.now()
      const r = await page.evaluate(async ([q, history]) => {
        const res = await fetch('/api/ai-assist/help-chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: q, history }) })
        return { status: res.status, body: await res.json().catch(() => ({})) }
      }, [q, history])
      const answer = r.body.reply || r.body.error
      out.push({ question: q, status: r.status, seconds: (Date.now() - t0) / 1000, answer, link: r.body.navLink?.path || null })
      history.push({ role: 'user', content: q }, { role: 'assistant', content: answer || '' })
      console.log(`[${r.status}] ${q}`)
    }
  }
  fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true })
  fs.writeFileSync(path.join(__dirname, 'out', `${role}-${mode}.json`), JSON.stringify(out, null, 1))
  await browser.close()
})()
