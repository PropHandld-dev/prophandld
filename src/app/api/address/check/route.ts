import { NextRequest, NextResponse } from 'next/server'
import { checkUsAddress } from '@/lib/addressCheck'

// POST { city?, state?, zip? } -> { ok, state } | { ok: false, field, error }
export async function POST(request: NextRequest) {
  const b = (await request.json().catch(() => ({}))) as { city?: string; state?: string; zip?: string }
  return NextResponse.json(checkUsAddress(b))
}
