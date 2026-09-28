'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { ScrollReveal } from '@/components/ScrollReveal'
import { RippleButton } from '@/components/RippleButton'
import { CheckCircleIcon } from '@/components/icons'
import { LEGACY_LICENSE, type ScopedRequirement } from '@/lib/credentialRequirements'
import type { StateBoard } from '@/lib/stateLicensingBoards'
import { useLanguage, t, type Lang } from '@/lib/i18n'
import { validateDocumentFile } from '@/lib/mediaValidation'

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

const levelLabel = (level: ScopedRequirement['level'], lang: Lang): string => {
  if (level === 'required') return t('levelRequired', lang)
  if (level === 'conditional') return t('levelConditional', lang)
  return t('levelRecommended', lang)
}

function expiryState(expiry: string | null): 'expired' | 'soon' | null {
  if (!expiry) return null
  const days = Math.round((new Date(expiry + 'T00:00:00').getTime() - Date.now()) / 86400000)
  if (days < 0) return 'expired'
  if (days <= 30) return 'soon'
  return null
}

export function ContractorCredentials({ userId }: { userId: string }) {
  const lang = useLanguage()
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
      setError(t('uploadPhotoOrPdf', lang))
      return
    }
    if (req.hasExpiry !== false && !form.expiry) {
      setError(t('enterExpiryDate', lang))
      return
    }

    setSavingId(req.id)
    setError(null)

    let documentUrl = existing?.document_url || null
    if (form.file) {
      const validationError = validateDocumentFile(form.file, { allowedExtensions: ['pdf', 'jpg', 'jpeg', 'png'] })
      if (validationError) {
        setError(validationError)
        setSavingId(null)
        return
      }
      const ext = form.file.name.split('.').pop()
      const path = `${userId}/cred-${crypto.randomUUID()}.${ext}`
      const { error: uploadError } = await supabase.storage.from('contractor-documents').upload(path, form.file)
      if (uploadError) {
        console.error('Error uploading credential document:', uploadError)
        setError(`${t('couldNotUploadFile', lang)} ${uploadError.message}`)
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
      setError(`${t('couldNotSaveColon', lang)} ${saveError.message}`)
      setSavingId(null)
      return
    }

    if (unlicensed) {
      await supabase.from('contractor_verifications').delete().eq('contractor_user_id', userId)
    }

    // A renewal restarts the expiry reminders. Separate from the save above
    // so it can never block a submission.
    await supabase
      .from('contractor_credentials')
      .update({ expiry_reminder_stage: 0 })
      .eq('contractor_user_id', userId)
      .eq('requirement_id', req.id)

    fetch('/api/contractor/credential-submitted', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requirementId: req.id }),
    }).catch(() => {})

    setOpenId(null)
    await load()
    setSavingId(null)
  }

  const removeCredential = async (credential: Credential) => {
    if (!window.confirm(t('removeCredentialConfirm', lang))) return
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
      setError(`${t('couldNotSaveColon', lang)} ${upsertError.message}`)
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
    { title: t('requiredForYourWork', lang), items: listed.filter((r) => r.level === 'required') },
    { title: t('levelConditional', lang), items: listed.filter((r) => r.level === 'conditional') },
    { title: t('levelRecommended', lang), items: listed.filter((r) => r.level === 'recommended') },
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
              {credential.status === 'verified' ? t('credVerified', lang) : credential.status === 'rejected' ? t('credRejected', lang) : t('credInReview', lang)}
            </span>
          ) : (
            <span className="shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full bg-white/8 text-white/60">
              {levelLabel(req.level, lang)}
            </span>
          )}
        </div>

        <p className="text-white/60 text-xs mt-2 leading-relaxed">{req.summary}</p>

        {(req.lookupUrl || req.infoUrl) && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
            {req.lookupUrl && (
              <a href={req.lookupUrl} target="_blank" rel="noopener noreferrer" className="text-[#12A5A9] text-xs hover:underline">
                {req.lookupLabel || t('lookItUp', lang)} →
              </a>
            )}
            {req.infoUrl && (
              <a href={req.infoUrl} target="_blank" rel="noopener noreferrer" className="text-white/60 text-xs hover:text-white hover:underline">
                {t('aboutThis', lang)} →
              </a>
            )}
          </div>
        )}

        {credential?.status === 'rejected' && credential.admin_notes && (
          <p className="text-red-400 text-xs mt-2">{t('reviewerNote', lang)} {credential.admin_notes}</p>
        )}
        {credential && (credential.credential_number || credential.expiry) && (
          <p className="text-white/50 text-xs mt-2">
            {credential.credential_number ? `#${credential.credential_number}` : ''}
            {credential.credential_number && credential.expiry ? ' · ' : ''}
            {credential.expiry ? `${t('expiresLabelShort', lang)} ${new Date(credential.expiry + 'T00:00:00').toLocaleDateString()}` : ''}
            {exp === 'expired' && <span className="text-red-400"> · {t('expiredUploadRenewal', lang)}</span>}
            {exp === 'soon' && <span className="text-yellow-400"> · {t('expiresSoonShort', lang)}</span>}
          </p>
        )}

        <div className="flex items-center gap-4 mt-3">
          <button
            type="button"
            onClick={() => openForm(req)}
            className="text-white text-xs font-semibold bg-white/8 hover:bg-white/12 transition rounded-lg px-3 py-2"
          >
            {isOpen ? t('closeBtn', lang) : credential ? t('updateBtn', lang) : t('addYoursBtn', lang)}
          </button>
          {credential && (
            <button type="button" onClick={() => removeCredential(credential)} className="text-red-400/70 hover:text-red-400 text-xs transition">
              {t('remove', lang)}
            </button>
          )}
        </div>

        {isOpen && (
          <div className="mt-4 pt-4 border-t border-white/8 space-y-3">
            <div className={req.hasExpiry === false ? '' : 'grid grid-cols-2 gap-3'}>
              <div>
                <label className="text-white/70 text-xs block mb-1">{t('numberIdOptional', lang)}</label>
                <input
                  type="text"
                  value={form.number}
                  onChange={(e) => setForm({ ...form, number: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#12A5A9] transition"
                />
              </div>
              {req.hasExpiry !== false && (
                <div>
                  <label className="text-white/70 text-xs block mb-1">{t('expiryDateLabel', lang)}</label>
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
                  {form.file ? form.file.name : credential?.document_url ? t('replaceFile', lang) : t('photoOrPdf', lang)}
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
              {savingId === req.id ? t('saving', lang) : t('submitForReview', lang)}
            </RippleButton>
          </div>
        )}
      </div>
    )
  }

  return (
    <ScrollReveal className="mt-10 pt-8 border-t border-white/8">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-white font-semibold">{t('licensesInsuranceHeading', lang)}</h2>
        {required.length > 0 && (
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-white/8 text-white/60">
            {verifiedRequired} {t('ofRequiredVerified', lang)} {required.length} {t('requiredVerifiedSuffix', lang)}
          </span>
        )}
      </div>

      {!info || info.categories.length === 0 || !info.homeState ? (
        <p className="text-white/50 text-sm mb-4">
          {t('addTradesAboveDesc', lang)}
        </p>
      ) : (
        <p className="text-white/50 text-sm mb-4">
          {t('forWorkWithin', lang)} <span className="text-white/80">{info.categories.join(', ')}</span> {t('workWithinMilesOf', lang)} {info.radiusMiles} {t('milesOfLabel', lang)}{' '}
          <span className="text-white/80">{place}</span>
          {info.states.length > 1 && (
            <>
              {' '}({t('thisReaches', lang)} <span className="text-white/80">{info.states.join(', ')}</span>{t('eachStateOwnRules', lang)}
            </>
          )}
          . {t('landlordsSeeVerified', lang)}
        </p>
      )}

      {info && info.boards.length > 0 && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-4 py-3 text-yellow-400/90 text-xs mb-4 space-y-2">
          <p>
            {t('dontListDetailedRules', lang)} {info.boards.map((b) => b.stateName).join(', ')} {t('yetBelowFederal', lang)}
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
                {b.note ? <span className="text-yellow-400/70">: {b.note}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      )}

      {unlicensed && credentials.length === 0 && (
        <div className="bg-white/3 border border-white/8 rounded-xl px-4 py-3 text-white/60 text-xs mb-4">
          {t('toldLandlordsNoLicense', lang)}
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
          {t('dontHaveLicenseYet', lang)}
        </button>
      )}

      <p className="text-white/40 text-xs mt-6">
        {t('requirementsChangeGuide', lang)}
      </p>
    </ScrollReveal>
  )
}
