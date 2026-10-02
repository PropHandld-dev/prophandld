// One-time migration: copies every existing user's role from
// user_metadata (client-writable, no longer trusted for authorization)
// into app_metadata (service-role-only writable). Safe to re-run — skips
// anyone who already has app_metadata.role set, and never touches
// user_metadata at all, only reads it as the source for this one copy.
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in the environment.')
  process.exit(1)
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

async function run() {
  let page = 1
  const perPage = 1000
  let migrated = 0
  let alreadySet = 0
  let noRole = 0
  let failed = 0

  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage })
    if (error) {
      console.error('listUsers failed:', error.message)
      process.exit(1)
    }
    if (!data.users.length) break

    for (const user of data.users) {
      if (user.app_metadata?.role) {
        alreadySet++
        continue
      }
      const role = user.user_metadata?.role
      if (role !== 'landlord' && role !== 'renter' && role !== 'contractor') {
        noRole++
        console.warn(`  skip ${user.id} (${user.email}) — no valid user_metadata.role found: ${JSON.stringify(role)}`)
        continue
      }
      const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
        app_metadata: { ...user.app_metadata, role },
      })
      if (updateError) {
        failed++
        console.error(`  FAILED ${user.id} (${user.email}): ${updateError.message}`)
        continue
      }
      migrated++
    }

    if (data.users.length < perPage) break
    page++
  }

  console.log(`\nDone. migrated=${migrated} alreadySet=${alreadySet} noRole=${noRole} failed=${failed}`)
  if (failed > 0 || noRole > 0) process.exitCode = 1
}

run()
