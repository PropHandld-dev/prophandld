'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { ScrollReveal } from '@/components/ScrollReveal'
import { RippleButton } from '@/components/RippleButton'
import { AdminLayout } from '@/components/AdminLayout'
import { requirementById } from '@/lib/credentialRequirements'

export default function AdminContractorsPage() {
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<any[]>([])
  const [credRows, setCredRows] = useState<any[]>([])
  const [error, setError] = useState<string | null>(null)
  const [actioningId, setActioningId] = useState<string | null>(null)
  const [notes, setNotes] = useState<Record<string, string>>({})

  const load = async () => {
    const { data: verifs, error: verifError } = await supabase
      .from('contractor_verifications')
      .select('*')
      .order('created_at', { ascending: false })

    if (verifError) {
      console.error('Error loading verifications:', verifError)
      setError('Could not load verifications.')
      setLoading(false)
      return
    }

    const enriched = await Promise.all(
      (verifs || []).map(async (v) => {
        const { data: contractorData } = await supabase
          .rpc('get_user_by_id', { user_id_input: v.contractor_user_id })
          .maybeSingle()

        const { data: licenseUrl } = v.license_document_url
          ? await supabase.storage.from('contractor-documents').createSignedUrl(v.license_document_url, 3600)
          : { data: null }

        const { data: insuranceUrl } = v.insurance_document_url
          ? await supabase.storage.from('contractor-documents').createSignedUrl(v.insurance_document_url, 3600)
          : { data: null }

        return {
          ...v,
          contractor: contractorData,
          licenseViewUrl: licenseUrl?.signedUrl,
          insuranceViewUrl: insuranceUrl?.signedUrl,
        }
      })
    )

    setRows(enriched)

    const { data: creds, error: credsError } = await supabase
      .from('contractor_credentials')
      .select('*')
      .order('created_at', { ascending: false })

    if (credsError) {
      console.error('Error loading credentials:', credsError)
    } else {
      const contractorCache = new Map<string, any>()
      const enrichedCreds = await Promise.all(
        (creds || []).map(async (c) => {
          if (!contractorCache.has(c.contractor_user_id)) {
            const { data } = await supabase.rpc('get_user_by_id', { user_id_input: c.contractor_user_id }).maybeSingle()
            contractorCache.set(c.contractor_user_id, data)
          }
          const { data: docUrl } = c.document_url
            ? await supabase.storage.from('contractor-documents').createSignedUrl(c.document_url, 3600)
            : { data: null }
          return { ...c, contractor: contractorCache.get(c.contractor_user_id), viewUrl: docUrl?.signedUrl }
        })
      )
      setCredRows(enrichedCreds)
    }

    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const handleDecision = async (id: string, status: 'verified' | 'rejected') => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    setActioningId(id)
    setError(null)

    const { error: updateError } = await supabase
      .from('contractor_verifications')
      .update({
        status,
        admin_notes: notes[id] || null,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', id)

    if (updateError) {
      console.error('Error updating verification:', updateError)
      setError('Could not save decision.')
      setActioningId(null)
      return
    }

    fetch('/api/admin/notify-verification-decision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contractorUserId: rows.find((r) => r.id === id)?.contractor_user_id,
        approved: status === 'verified',
        notes: notes[id] || null,
      }),
    }).catch((err) => console.error('Failed to send verification decision email:', err))

    await load()
    setActioningId(null)
  }

  const handleCredentialDecision = async (row: any, status: 'verified' | 'rejected') => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    setActioningId(row.id)
    setError(null)

    const { error: updateError } = await supabase
      .from('contractor_credentials')
      .update({
        status,
        admin_notes: notes[row.id] || null,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', row.id)

    if (updateError) {
      console.error('Error updating credential:', updateError)
      setError('Could not save decision.')
      setActioningId(null)
      return
    }

    const requirementName = requirementById(row.requirement_id)?.name || 'credential'
    fetch('/api/admin/notify-verification-decision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contractorUserId: row.contractor_user_id,
        approved: status === 'verified',
        notes: [requirementName, notes[row.id]].filter(Boolean).join(': '),
      }),
    }).catch((err) => console.error('Failed to send verification decision email:', err))

    await load()
    setActioningId(null)
  }

  // 'unlicensed' rows are self-declared, not submitted for review — nothing for an admin to act on
  const pending = rows.filter((r) => r.status === 'pending')
  const reviewed = rows.filter((r) => r.status !== 'pending' && r.status !== 'unlicensed')

  const renderRow = (row: any) => (
    <div key={row.id} className="bg-white/3 border border-white/8 rounded-2xl p-6 mb-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-white font-semibold">{row.contractor?.full_name || 'Unknown contractor'}</p>
          <p className="text-white/50 text-sm">{row.contractor?.email}</p>
        </div>
        <span className={
          row.status === 'verified'
            ? 'text-xs font-semibold px-2.5 py-1 rounded-full bg-[#0A7B7E]/20 text-[#12A5A9]'
            : row.status === 'rejected'
              ? 'text-xs font-semibold px-2.5 py-1 rounded-full bg-red-500/15 text-red-400'
              : 'text-xs font-semibold px-2.5 py-1 rounded-full bg-yellow-500/15 text-yellow-400'
        }>
          {row.status}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm mb-3">
        <div>
          <p className="text-white/50 text-xs">License #</p>
          <p className="text-white/70">{row.license_number || '—'}</p>
        </div>
        <div>
          <p className="text-white/50 text-xs">License expiry</p>
          <p className="text-white/70">{row.license_expiry ? new Date(row.license_expiry).toLocaleDateString() : '—'}</p>
        </div>
        <div>
          <p className="text-white/50 text-xs">Insurance expiry</p>
          <p className="text-white/70">{row.insurance_expiry ? new Date(row.insurance_expiry).toLocaleDateString() : '—'}</p>
        </div>
      </div>

      <div className="flex items-center gap-4 mb-3">
        {row.licenseViewUrl && (
          <a href={row.licenseViewUrl} target="_blank" rel="noopener noreferrer" className="text-[#12A5A9] text-xs font-semibold hover:underline">
            View license →
          </a>
        )}
        {row.insuranceViewUrl && (
          <a href={row.insuranceViewUrl} target="_blank" rel="noopener noreferrer" className="text-[#12A5A9] text-xs font-semibold hover:underline">
            View insurance →
          </a>
        )}
      </div>

      {row.admin_notes && row.status !== 'pending' && (
        <p className="text-white/60 text-xs mb-3">Note: {row.admin_notes}</p>
      )}

      {row.status === 'pending' && (
        <div className="space-y-3">
          <input
            type="text"
            placeholder="Optional note (e.g. reason for rejection)"
            value={notes[row.id] || ''}
            onChange={(e) => setNotes({ ...notes, [row.id]: e.target.value })}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-white/50 focus:outline-none focus:border-[#12A5A9] transition"
          />
          <div className="flex gap-3">
            <RippleButton
              onClick={() => handleDecision(row.id, 'verified')}
              disabled={actioningId === row.id}
              className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-xs font-semibold px-4 py-2 rounded-lg hover:opacity-90 transition disabled:opacity-50"
            >
              Approve
            </RippleButton>
            <button
              onClick={() => handleDecision(row.id, 'rejected')}
              disabled={actioningId === row.id}
              className="text-red-400/70 hover:text-red-400 text-xs transition"
            >
              Reject
            </button>
          </div>
        </div>
      )}
    </div>
  )

  const pendingCreds = credRows.filter((c) => c.status === 'pending')
  const reviewedCreds = credRows.filter((c) => c.status !== 'pending')

  const renderCredential = (row: any) => {
    const req = requirementById(row.requirement_id)
    const expired = row.expiry && new Date(row.expiry + 'T00:00:00').getTime() < Date.now()
    return (
      <div key={row.id} className="bg-white/3 border border-white/8 rounded-2xl p-6 mb-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <p className="text-white font-semibold">{req?.name || row.requirement_id}</p>
            <p className="text-white/50 text-sm">
              {row.contractor?.full_name || 'Unknown contractor'} · {row.contractor?.email}
            </p>
            {req && <p className="text-white/40 text-xs mt-0.5">{req.issuer}</p>}
          </div>
          <span className={
            row.status === 'verified'
              ? 'text-xs font-semibold px-2.5 py-1 rounded-full bg-[#0A7B7E]/20 text-[#12A5A9]'
              : row.status === 'rejected'
                ? 'text-xs font-semibold px-2.5 py-1 rounded-full bg-red-500/15 text-red-400'
                : 'text-xs font-semibold px-2.5 py-1 rounded-full bg-yellow-500/15 text-yellow-400'
          }>
            {row.status}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm mb-3">
          <div>
            <p className="text-white/50 text-xs">Number</p>
            <p className="text-white/70">{row.credential_number || '—'}</p>
          </div>
          <div>
            <p className="text-white/50 text-xs">Expiry</p>
            <p className={expired ? 'text-red-400' : 'text-white/70'}>
              {row.expiry ? new Date(row.expiry + 'T00:00:00').toLocaleDateString() : '—'}{expired ? ' (expired)' : ''}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-3">
          {row.viewUrl && (
            <a href={row.viewUrl} target="_blank" rel="noopener noreferrer" className="text-[#12A5A9] text-xs font-semibold hover:underline">
              View document →
            </a>
          )}
          {req?.lookupUrl && (
            <a href={req.lookupUrl} target="_blank" rel="noopener noreferrer" className="text-[#12A5A9] text-xs font-semibold hover:underline">
              Check official record: {req.lookupLabel} →
            </a>
          )}
          {req && !req.lookupUrl && req.infoUrl && (
            <a href={req.infoUrl} target="_blank" rel="noopener noreferrer" className="text-white/60 text-xs hover:underline">
              How to verify →
            </a>
          )}
        </div>
        {req && !req.lookupUrl && (
          <p className="text-white/40 text-xs mb-3">No public search for this one. Compare the uploaded document against the issuer&apos;s requirements.</p>
        )}

        {row.admin_notes && row.status !== 'pending' && (
          <p className="text-white/60 text-xs mb-3">Note: {row.admin_notes}</p>
        )}

        {row.status === 'pending' && (
          <div className="space-y-3">
            <input
              type="text"
              placeholder="Optional note (e.g. reason for rejection)"
              value={notes[row.id] || ''}
              onChange={(e) => setNotes({ ...notes, [row.id]: e.target.value })}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-white/50 focus:outline-none focus:border-[#12A5A9] transition"
            />
            <div className="flex gap-3">
              <RippleButton
                onClick={() => handleCredentialDecision(row, 'verified')}
                disabled={actioningId === row.id}
                className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-xs font-semibold px-4 py-2 rounded-lg hover:opacity-90 transition disabled:opacity-50"
              >
                Approve
              </RippleButton>
              <button
                onClick={() => handleCredentialDecision(row, 'rejected')}
                disabled={actioningId === row.id}
                className="text-red-400/70 hover:text-red-400 text-xs transition"
              >
                Reject
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <AdminLayout>
      <h1 className="text-2xl font-bold text-white mb-8">Contractor verification</h1>

      {loading ? (
        <div className="text-white/50 text-sm">Loading...</div>
      ) : (
        <>
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm mb-4">
              {error}
            </div>
          )}

          <ScrollReveal>
            <h2 className="text-white/70 font-semibold text-sm mb-3">Credentials to review ({pendingCreds.length})</h2>
            {pendingCreds.length === 0 ? (
              <p className="text-white/50 text-sm mb-8">No licenses, registrations or insurance waiting on review.</p>
            ) : (
              <div className="mb-8">{pendingCreds.map(renderCredential)}</div>
            )}
          </ScrollReveal>

          {reviewedCreds.length > 0 && (
            <ScrollReveal>
              <h2 className="text-white/70 font-semibold text-sm mb-3">Reviewed credentials ({reviewedCreds.length})</h2>
              <div className="mb-8">{reviewedCreds.map(renderCredential)}</div>
            </ScrollReveal>
          )}

          <ScrollReveal>
            <h2 className="text-white/70 font-semibold text-sm mb-3">Earlier submissions, pending ({pending.length})</h2>
            {pending.length === 0 ? (
              <p className="text-white/50 text-sm mb-8">Nothing waiting on review.</p>
            ) : (
              <div className="mb-8">{pending.map(renderRow)}</div>
            )}
          </ScrollReveal>

          <ScrollReveal>
            <h2 className="text-white/70 font-semibold text-sm mb-3">Earlier submissions, reviewed ({reviewed.length})</h2>
            {reviewed.length === 0 ? (
              <p className="text-white/50 text-sm">No reviewed submissions yet.</p>
            ) : (
              <div>{reviewed.map(renderRow)}</div>
            )}
          </ScrollReveal>
        </>
      )}
    </AdminLayout>
  )
}
