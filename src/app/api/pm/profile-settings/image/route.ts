import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { getPmMembership } from '@/lib/pm'
import { tooManyRequests } from '@/lib/rateLimit'

export const maxDuration = 20

const BUCKET = 'pm-branding'
const MAX_BYTES = 5 * 1024 * 1024
const COLUMN = { logo: 'logo_url', cover: 'cover_url' } as const
type Kind = keyof typeof COLUMN

// Identifies the real format from the file's first bytes. The browser's
// MIME type and the filename are just labels; the bytes aren't.
function sniffImage(bytes: Uint8Array): { ext: string; mime: string } | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { ext: 'jpg', mime: 'image/jpeg' }
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return { ext: 'png', mime: 'image/png' }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) return { ext: 'webp', mime: 'image/webp' }
  return null
}

async function adminContext() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) }
  const admin = getSupabaseAdmin()
  const membership = await getPmMembership(admin, user.id)
  if (!membership || membership.memberRole !== 'admin') {
    return { error: NextResponse.json({ error: 'Only a PM organization admin can change branding' }, { status: 403 }) }
  }
  return { user, admin, membership }
}

// Removes the previous file for this slot so replaced logos don't pile up.
async function removeOld(admin: ReturnType<typeof getSupabaseAdmin>, url: string | null) {
  if (!url) return
  const marker = `/object/public/${BUCKET}/`
  const i = url.indexOf(marker)
  if (i === -1) return
  await admin.storage.from(BUCKET).remove([url.slice(i + marker.length)]).catch(() => {})
}

// POST multipart: kind=logo|cover, file=<image>
export async function POST(request: NextRequest) {
  const ctx = await adminContext()
  if ('error' in ctx) return ctx.error
  const { user, admin, membership } = ctx

  if (await tooManyRequests(`pm-branding-upload:${user.id}`, 20, 15)) {
    return NextResponse.json({ error: 'Too many uploads. Try again in a few minutes.' }, { status: 429 })
  }

  const form = await request.formData().catch(() => null)
  const kind = form?.get('kind') as Kind | null
  const file = form?.get('file')
  if (!kind || !(kind in COLUMN)) return NextResponse.json({ error: 'Invalid image type' }, { status: 400 })
  if (!file || typeof file === 'string') return NextResponse.json({ error: 'No file received' }, { status: 400 })
  if (file.size === 0) return NextResponse.json({ error: 'That file is empty.' }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Images must be 5 MB or smaller.' }, { status: 400 })

  const bytes = new Uint8Array(await file.arrayBuffer())
  const sniffed = sniffImage(bytes)
  if (!sniffed) return NextResponse.json({ error: 'Use a JPG, PNG or WebP image.' }, { status: 400 })

  const path = `${membership.organizationId}/${kind}-${Date.now()}.${sniffed.ext}`
  const { error: uploadError } = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: sniffed.mime, upsert: false })
  if (uploadError) {
    console.error('pm/profile-settings/image: upload failed', uploadError)
    return NextResponse.json({ error: 'Could not upload the image.' }, { status: 500 })
  }
  const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path)

  const { data: org } = await admin.from('pm_organizations').select(COLUMN[kind]).eq('id', membership.organizationId).maybeSingle()
  const { error: updateError } = await admin.from('pm_organizations').update({ [COLUMN[kind]]: pub.publicUrl }).eq('id', membership.organizationId)
  if (updateError) {
    await admin.storage.from(BUCKET).remove([path]).catch(() => {})
    console.error('pm/profile-settings/image: save failed', updateError)
    return NextResponse.json({ error: 'Could not save the image.' }, { status: 500 })
  }
  await removeOld(admin, (org as Record<string, string | null> | null)?.[COLUMN[kind]] ?? null)

  return NextResponse.json({ ok: true, url: pub.publicUrl })
}

// DELETE ?kind=logo|cover
export async function DELETE(request: NextRequest) {
  const ctx = await adminContext()
  if ('error' in ctx) return ctx.error
  const { admin, membership } = ctx
  const kind = request.nextUrl.searchParams.get('kind') as Kind | null
  if (!kind || !(kind in COLUMN)) return NextResponse.json({ error: 'Invalid image type' }, { status: 400 })

  const { data: org } = await admin.from('pm_organizations').select(COLUMN[kind]).eq('id', membership.organizationId).maybeSingle()
  await admin.from('pm_organizations').update({ [COLUMN[kind]]: null }).eq('id', membership.organizationId)
  await removeOld(admin, (org as Record<string, string | null> | null)?.[COLUMN[kind]] ?? null)
  return NextResponse.json({ ok: true })
}
