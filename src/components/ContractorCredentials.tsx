'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { ScrollReveal } from '@/components/ScrollReveal'
import { RippleButton } from '@/components/RippleButton'
import { CheckCircleIcon } from '@/components/icons'
import { LEGACY_LICENSE, type ScopedRequirement } from '@/lib/credentialRequirements'
import type { StateBoard } from '@/lib/stateLicensingBoards'

type RequirementsResponse = {
  homeState: string | null
  homeCity: string | null
  radiusMiles: number
  states: string[]
  categories: string[]
  requirements: ScopedRequirement[]
  boards: StateBoard[]
}

type Credential = {
  id: string
  requirement_id: string
  credential_number: string | null
  expiry: string | null
  document_url: string | null
  status: 'pending' | 'verified' | 'rejected'
  admin_notes: string | null
}

const LEVEL_LABEL: Record<ScopedRequirement['level'], string> = {
  required: 'Required',
  conditional: 'Depends on the job',
  recommended: 'Recommended',
}

function expiryState(expiry: string | null): 'expired' | 'soon' | null {
  if (!expiry) return null
  const days = Math.round((new Date(expiry + 'T00:00:00').getTime() - Date.now()) / 86400000)
  if (days < 0) return 'expired'
  if (days <= 30) return 'soon'
  return null
}

export function ContractorCredentials({ userId }: { userId: string }) {
  const [loading, setLoading] = useState(true)
  const [info, setInfo] = useState<RequirementsResponse | null>(null)
  const [credentials, setCredentials] = useState<Credential[]>([])
  const [unlicensed, setUnlicensed] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const [form, setForm] = useState<{ number: string; expiry: string; file: File | null }>({ number: '', expiry: '', file: null })
  const [savingId, setSavingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [reqRes, credsRes, verifRes] = await Promise.all([
      fetch('/api/contractor/requirements').then((r) => (r.ok ? r.json() : null)).catch(() => null),
      supabase.from('contractor_credentials').select('*').eq('contractor_user_id', userId),
      supabase.from('contractor_verifications').select('status').eq('contractor_user_id', userId).maybeSingle(),
    ])
    setInfo(reqRes)
    setCredentials((credsRes.data as Credential[]) || [])
    setUnlicensed(verifRes.data?.status === 'unlicensed')
    setLoading(false)
  }, [userId])

  useEffect(() => {
    load()
  }, [load])

  const credentialFor = (requirementId: string) => credentials.find((c) => c.requirement_id === requirementId)

  const openForm = (req: ScopedRequirement) => {
    const existing = credentialFor(req.id)
    setForm({ number: existing?.credential_number || '', expiry: existing?.expiry || '', file: null })
    setError(null)
    setOpenId(openId === req.id ? null : req.id)
  }

  const save = async (req: ScopedRequirement) => {
    const existing = credentialFor(req.id)
    if (!existing?.document_url && !form.file) {
      setError('Upload a photo or PDF of it so it can be reviewed.')
      return
    }
    if (req.hasExpiry !== false && !form.expiry) {
      setError('Enter the expiry date.')
      return
    }

    setSavingId(req.id)
    setError(null)

    let documentUrl = existing?.document_url || null
    if (form.file) {
      const ext = form.file.name.split('.').pop()
      const path = `${userId}/cred-${crypto.randomUUID()}.${ext}`
      const { error: uploadError } = await supabase.storage.from('contractor-documents').upload(path, form.file)
      if (uploadError) {
        console.error('Error uploading credential document:', uploadError)
        setError(`Could not upload the file: ${uploadError.message}`)
        setSavingId(null)
        return
      }
      documentUrl = path
    }

    // Any change goes back to "pending" so it's reviewed again — a
    // contractor can never mark their own credential verified.
    const { error: saveError } = await supabase.from('contractor_credentials').upsert(
      {
        contractor_user_id: userId,
        requirement_id: req.id,
        credential_number: form.number.trim() || null,
        expiry: req.hasExpiry === false ? null : form.expiry || null,
        document_url: documentUrl,
        status: 'pending',
        admin_notes: null,
        reviewed_by: null,
        reviewed_at: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'contractor_user_id,requirement_id' }
    )

    if (saveError) {
      console.error('Error saving credential:', saveError)
      setError(`Could not save: ${saveError.message}`)
      setSavingId(null)
      return
    }

    if (unlicensed) {
      await supabase.from('contractor_verifications').delete().eq('contractor_user_id', userId)
    }

    setOpenId(null)
    await load()
    setSavingId(null)
  }

  const removeCredential = async (credential: Credential) => {
    if (!window.confirm('Remove this credential?')) return
    await supabase.from('contractor_credentials').delete().eq('id', credential.id)
    await load()
  }

  const markUnlicensed = async () => {
    const { error: upsertError } = await supabase.from('contractor_verifications').upsert(
      {
        contractor_user_id: userId,
        license_number: null,
        license_expiry: null,
        license_document_url: null,
        insurance_document_url: null,
        insurance_expiry: null,
        status: 'unlicensed',
        admin_notes: null,
        reviewed_by: null,
        reviewed_at: null,
      },
      { onConflict: 'contractor_user_id' }
    )
    if (upsertError) {
      setError(`Could not save: ${upsertError.message}`)
      return
    }
    setUnlicensed(true)
  }

  if (loading) {
    return <div className="h-40 animate-pulse bg-white/5 rounded-2xl" />
  }

  const requirements = info?.requirements || []
  const legacy = credentialFor(LEGACY_LICENSE.id)
  const listed: ScopedRequirement[] = legacy ? [...requirements, { ...LEGACY_LICENSE, regions: [] }] : requirements
  const required = requirements.filter((r) => r.level === 'required')
  const verifiedRequired = required.filter((r) => credentialFor(r.id)?.status === 'verified').length

  const groups: { title: string; items: ScopedRequirement[] }[] = [
    { title: 'Required for your work', items: listed.filter((r) => r.level === 'required') },
    { title: 'Depends on the job', items: listed.filter((r) => r.level === 'conditional') },
    { title: 'Recommended', items: listed.filter((r) => r.level === 'recommended') },
  ].filter((g) => g.items.length > 0)

  const place = [info?.homeCity, info?.homeState].filter(Boolean).join(', ')

  const renderCard = (req: ScopedRequirement) => {
    const credential = credentialFor(req.id)
    const exp = expiryState(credential?.expiry || null)
    const isOpen = openId === req.id

    return (
      <div key={req.id} className="bg-white/3 border border-white/8 rounded-2xl p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-white font-medium text-sm">{req.name}</p>
            <p className="text-white/50 text-xs mt-0.5">{req.issuer}</p>
            {req.regions.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {req.regions.map((region) => (
                  <span key={region} className="text-[10px] font-semibold uppercase tracking-wide bg-white/8 text-white/60 rounded px-1.5 py-0.5">
                    {region}
                  </span>
                ))}
              </div>
            )}
          </div>
          {credential ? (
            <span
              className={`shrink-0 inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${
                credential.status === 'verified'
                  ? 'bg-[#0A7B7E]/20 text-[#12A5A9]'
                  : credential.status === 'rejected'
                    ? 'bg-red-500/15 text-red-400'
                    : 'bg-yellow-500/15 text-yellow-400'
              }`}
            >
              {credential.status === 'verified' && <CheckCircleIcon className="w-3 h-3" />}
              {credential.status === 'verified' ? 'Verified' : credential.status === 'rejected' ? 'Rejected' : 'In review'}
            </span>
          ) : (
            <span className="shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full bg-white/8 text-white/60">
              {LEVEL_LABEL[req.level]}
            </span>
          )}
        </div>

        <p className="text-white/60 text-xs mt-2 leading-relaxed">{req.summary}</p>

        {(req.lookupUrl || req.infoUrl) && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
            {req.lookupUrl && (
              <a href={req.lookupUrl} target="_blank" rel="noopener noreferrer" className="text-[#12A5A9] text-xs hover:underline">
                {req.lookupLabel || 'Look it up'} →
              </a>
            )}
            {req.infoUrl && (
              <a href={req.infoUrl} target="_blank" rel="noopener noreferrer" className="text-white/60 text-xs hover:text-white hover:underline">
                About this →
              </a>
            )}
          </div>
        )}

        {credential?.status === 'rejected' && credential.admin_notes && (
          <p className="text-red-400 text-xs mt-2">Reviewer note: {credential.admin_notes}</p>
        )}
        {credential && (credential.credential_number || credential.expiry) && (
          <p className="text-white/50 text-xs mt-2">
            {credential.credential_number ? `#${credential.credential_number}` : ''}
            {credential.credential_number && credential.expiry ? ' · ' : ''}
            {credential.expiry ? `Expires ${new Date(credential.expiry + 'T00:00:00').toLocaleDateString()}` : ''}
            {exp === 'expired' && <span className="text-red-400"> · Expired, upload a renewal</span>}
            {exp === 'soon' && <span className="text-yellow-400"> · Expires soon</span>}
          </p>
        )}

        <div className="flex items-center gap-4 mt-3">
          <button
            type="button"
            onClick={() => openForm(req)}
            className="text-white text-xs font-semibold bg-white/8 hover:bg-white/12 transition rounded-lg px-3 py-2"
          >
            {isOpen ? 'Close' : credential ? 'Update' : 'Add yours'}
          </button>
          {credential && (
            <button type="button" onClick={() => removeCredential(credential)} className="text-red-400/70 hover:text-red-400 text-xs transition">
              Remove
            </button>
          )}
        </div>

        {isOpen && (
          <div className="mt-4 pt-4 border-t border-white/8 space-y-3">
            <div className={req.hasExpiry === false ? '' : 'grid grid-cols-2 gap-3'}>
              <div>
                <label className="text-white/70 text-xs block mb-1">Number / ID (if it has one)</label>
                <input
                  type="text"
                  value={form.number}
                  onChange={(e) => setForm({ ...form, number: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#12A5A9] transition"
                />
              </div>
              {req.hasExpiry !== false && (
                <div>
                  <label className="text-white/70 text-xs block mb-1">Expiry date</label>
                  <input
                    type="date"
                    value={form.expiry}
                    onChange={(e) => setForm({ ...form, expiry: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#12A5A9] transition"
                  />
                </div>
              )}
            </div>
            <div>
              <label className="block">
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={(e) => setForm({ ...form, file: e.target.files?.[0] || null })}
                  className="hidden"
                />
                <span className="inline-block bg-white/8 text-white text-xs font-medium px-3 py-2 rounded-lg hover:bg-white/12 transition cursor-pointer">
                  {form.file ? form.file.name : credential?.document_url ? 'Replace file' : '+ Photo or PDF'}
                </span>
              </label>
            </div>
            {error && <p className="text-red-400 text-xs">{error}</p>}
            <RippleButton
              type="button"
              onClick={() => save(req)}
              disabled={savingId === req.id}
              className="w-full bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-sm font-semibold py-2.5 rounded-xl hover:opacity-90 transition disabled:opacity-50"
            >
              {savingId === req.id ? 'Saving...' : 'Submit for review'}
            </RippleButton>
          </div>
        )}
      </div>
    )
  }

  return (
    <ScrollReveal className="mt-10 pt-8 border-t border-white/8">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-white font-semibold">Licenses &amp; insurance</h2>
        {required.length > 0 && (
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-white/8 text-white/60">
            {verifiedRequired} of {required.length} required verified
          </span>
        )}
      </div>

      {!info || info.categories.length === 0 || !info.homeState ? (
        <p className="text-white/50 text-sm mb-4">
          Add your trades and service ZIP code above and save. Requirements are different for each trade and state, and
          this list will show exactly what applies to you.
        </p>
      ) : (
        <p className="text-white/50 text-sm mb-4">
          For <span className="text-white/80">{info.categories.join(', ')}</span> work within {info.radiusMiles} miles of{' '}
          <span className="text-white/80">{place}</span>
          {info.states.length > 1 && (
            <>
              {' '}(this reaches <span className="text-white/80">{info.states.join(', ')}</span>, and each state has its own rules)
            </>
          )}
          . Landlords see the ones we verify next to your bids.
        </p>
      )}

      {info && info.boards.length > 0 && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-4 py-3 text-yellow-400/90 text-xs mb-4 space-y-2">
          <p>
            We don&apos;t list detailed trade rules for {info.boards.map((b) => b.stateName).join(', ')} yet. Below are the
            federal and insurance items. For anything specific to your trade there, check the state office:
          </p>
          <ul className="space-y-1.5">
            {info.boards.map((b) => (
              <li key={b.state}>
                <span className="font-semibold">{b.stateName}:</span>{' '}
                {b.url ? (
                  <a href={b.url} target="_blank" rel="noopener noreferrer" className="underline">
                    {b.board}
                  </a>
                ) : (
                  b.board
                )}
                {b.note ? <span className="text-yellow-400/70"> — {b.note}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      )}

      {unlicensed && credentials.length === 0 && (
        <div className="bg-white/3 border border-white/8 rounded-xl px-4 py-3 text-white/60 text-xs mb-4">
          You&apos;ve told landlords you don&apos;t have a license or insurance on file. You can still bid, and you can add
          credentials below any time.
        </div>
      )}

      <div className="space-y-6">
        {groups.map((group) => (
          <div key={group.title}>
            <h3 className="text-white/60 text-xs font-semibold uppercase tracking-wide mb-2">{group.title}</h3>
            <div className="space-y-3">{group.items.map(renderCard)}</div>
          </div>
        ))}
      </div>

      {!unlicensed && credentials.length === 0 && (
        <button type="button" onClick={markUnlicensed} className="text-white/50 hover:text-white text-xs mt-6 transition">
          I don&apos;t have a license or insurance yet
        </button>
      )}

      <p className="text-white/40 text-xs mt-6">
        Requirements change and vary by city. This is a guide, not legal advice. Confirm with the agency that issues your
        license.
      </p>
    </ScrollReveal>
  )
}
