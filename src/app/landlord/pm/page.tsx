'use client'

import { useEffect, useState, useCallback, type ReactNode } from 'react'
import { ScrollReveal } from '@/components/ScrollReveal'
import { RippleButton } from '@/components/RippleButton'
import { CountUp } from '@/components/CountUp'
import { BuildingIcon, WrenchIcon, DollarSignIcon, PlusIcon, CheckCircleIcon, ShieldIcon } from '@/components/icons'

type Membership = { organizationId: string; organizationName: string; memberRole: 'admin' | 'staff'; canViewFinancials: boolean }
type Client = {
  portfolioId: string
  ownerUserId: string
  ownerName: string
  approvalThreshold: number
  propertyCount: number
  unitCount: number
  openJobCount: number
  rentCollectedThisMonth: number | null
}
type Staff = {
  id: string
  userId: string | null
  name: string
  memberRole: 'admin' | 'staff'
  canViewFinancials: boolean
  status: 'pending' | 'accepted'
}
type AuditEntry = { id: string; action: string; amount: number | null; createdAt: string; ownerName: string; actorName: string }
type Invite = { id: string; orgName: string; status: 'pending' | 'accepted'; approvalThreshold: number }

const ACTION_LABELS: Record<string, string> = {
  job_payment_started: 'approved a job payment',
  job_payment_blocked_needs_owner_signoff: 'tried to approve a payment over threshold',
}

function StatTile({ icon: Icon, label, value }: { icon: typeof BuildingIcon; label: string; value: ReactNode }) {
  return (
    <div className="bg-white/4 border border-white/8 rounded-xl p-3 flex items-center gap-3">
      <Icon className="w-4 h-4 text-[#12A5A9] shrink-0" />
      <div className="min-w-0">
        <p className="text-white font-semibold text-sm tabular-nums">{value}</p>
        <p className="text-white/40 text-xs truncate">{label}</p>
      </div>
    </div>
  )
}

export default function PmDashboardPage() {
  const [loading, setLoading] = useState(true)
  const [membership, setMembership] = useState<Membership | null>(null)
  const [invites, setInvites] = useState<Invite[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [staff, setStaff] = useState<Staff[]>([])
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([])
  const [error, setError] = useState<string | null>(null)

  const [orgName, setOrgName] = useState('')
  const [creating, setCreating] = useState(false)

  const [clientEmail, setClientEmail] = useState('')
  const [invitingClient, setInvitingClient] = useState(false)
  const [clientInviteMsg, setClientInviteMsg] = useState<string | null>(null)

  const [staffEmail, setStaffEmail] = useState('')
  const [staffFinancials, setStaffFinancials] = useState(false)
  const [invitingStaff, setInvitingStaff] = useState(false)
  const [staffInviteMsg, setStaffInviteMsg] = useState<string | null>(null)

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const [orgRes, invitesRes] = await Promise.all([
        fetch('/api/pm/organizations').then((r) => r.json()),
        fetch('/api/pm/invites-for-me').then((r) => r.json()),
      ])
      setMembership(orgRes.membership || null)
      setInvites(invitesRes.managedBy || [])

      if (orgRes.membership) {
        const [dashRes, staffRes, auditRes] = await Promise.all([
          fetch('/api/pm/dashboard').then((r) => r.json()),
          fetch('/api/pm/staff').then((r) => r.json()),
          fetch('/api/pm/audit-log').then((r) => r.json()),
        ])
        setClients(dashRes.clients || [])
        setStaff(staffRes.staff || [])
        setAuditLog(auditRes.entries || [])
      }
    } catch {
      setError('Could not load your property management dashboard.')
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  const handleCreateOrg = async () => {
    if (!orgName.trim()) return
    setCreating(true)
    setError(null)
    try {
      const res = await fetch('/api/pm/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: orgName.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      await loadAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create your organization')
    }
    setCreating(false)
  }

  const handleInviteClient = async () => {
    if (!clientEmail.trim()) return
    setInvitingClient(true)
    setClientInviteMsg(null)
    try {
      const res = await fetch('/api/pm/clients/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: clientEmail.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setClientInviteMsg(
          data.error === 'no_account_found'
            ? "No Prophandld landlord account found with that email."
            : data.error === 'already_invited_or_managed'
              ? 'That landlord is already invited or managed by a PM.'
              : data.error || 'Could not send that invite.'
        )
      } else {
        setClientInviteMsg('Invite sent.')
        setClientEmail('')
        await loadAll()
      }
    } catch {
      setClientInviteMsg('Could not send that invite.')
    }
    setInvitingClient(false)
  }

  const handleInviteStaff = async () => {
    if (!staffEmail.trim()) return
    setInvitingStaff(true)
    setStaffInviteMsg(null)
    try {
      const res = await fetch('/api/pm/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: staffEmail.trim(), canViewFinancials: staffFinancials }),
      })
      const data = await res.json()
      if (!res.ok) {
        setStaffInviteMsg(
          data.error === 'no_account_found'
            ? 'No Prophandld landlord account found with that email.'
            : data.error === 'already_invited_or_on_a_team'
              ? 'That person is already on a team.'
              : data.error || 'Could not send that invite.'
        )
      } else {
        setStaffInviteMsg('Invite sent.')
        setStaffEmail('')
        setStaffFinancials(false)
        await loadAll()
      }
    } catch {
      setStaffInviteMsg('Could not send that invite.')
    }
    setInvitingStaff(false)
  }

  const handleAcceptInvite = async (id: string) => {
    await fetch('/api/pm/clients/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ portfolioId: id }),
    })
    await loadAll()
  }

  const handleDeclineInvite = async (id: string) => {
    await fetch(`/api/pm/clients/${id}`, { method: 'DELETE' })
    await loadAll()
  }

  const handleThresholdChange = async (portfolioId: string, value: number) => {
    setClients((prev) => prev.map((c) => (c.portfolioId === portfolioId ? { ...c, approvalThreshold: value } : c)))
    await fetch(`/api/pm/clients/${portfolioId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approvalThreshold: value }),
    })
  }

  const handleToggleFinancials = async (memberId: string, value: boolean) => {
    setStaff((prev) => prev.map((s) => (s.id === memberId ? { ...s, canViewFinancials: value } : s)))
    await fetch(`/api/pm/staff/${memberId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ canViewFinancials: value }),
    })
  }

  const handleRemoveStaff = async (memberId: string) => {
    await fetch(`/api/pm/staff/${memberId}`, { method: 'DELETE' })
    await loadAll()
  }

  const handleRemoveClient = async (portfolioId: string) => {
    await fetch(`/api/pm/clients/${portfolioId}`, { method: 'DELETE' })
    await loadAll()
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0F1C] px-4 py-10">
        <div className="max-w-3xl mx-auto space-y-4">
          <div className="h-8 w-48 bg-white/5 rounded-lg animate-pulse" />
          <div className="h-32 bg-white/5 rounded-2xl animate-pulse" />
        </div>
      </div>
    )
  }

  const pendingInvites = invites.filter((i) => i.status === 'pending')
  const acceptedInvites = invites.filter((i) => i.status === 'accepted')

  const combinedUnits = clients.reduce((t, c) => t + c.unitCount, 0)
  const combinedOpenJobs = clients.reduce((t, c) => t + c.openJobCount, 0)
  const combinedRent = clients.reduce((t, c) => t + (c.rentCollectedThisMonth || 0), 0)

  return (
    <div className="min-h-screen bg-[#0A0F1C] px-4 py-8 pb-24">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-white font-bold text-2xl mb-1">Property Management</h1>
        <p className="text-white/50 text-sm mb-6">
          {membership ? membership.organizationName : 'Manage every client’s properties from one place.'}
        </p>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm mb-6">{error}</div>
        )}

        {pendingInvites.length > 0 && (
          <div className="space-y-3 mb-6">
            {pendingInvites.map((inv) => (
              <ScrollReveal key={inv.id} className="bg-[#12A5A9]/10 border border-[#12A5A9]/25 rounded-2xl p-5">
                <p className="text-white font-semibold mb-1">{inv.orgName} wants to manage your property</p>
                <p className="text-white/60 text-sm mb-4">
                  They'll be able to post and approve maintenance jobs on your behalf, up to ${inv.approvalThreshold.toFixed(0)} per job. You stay the owner, and can remove them at any time.
                </p>
                <div className="flex gap-3">
                  <RippleButton
                    onClick={() => handleAcceptInvite(inv.id)}
                    className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-sm font-semibold px-4 py-2 rounded-xl"
                  >
                    Accept
                  </RippleButton>
                  <RippleButton
                    onClick={() => handleDeclineInvite(inv.id)}
                    className="bg-white/5 border border-white/10 text-white/70 text-sm font-semibold px-4 py-2 rounded-xl"
                  >
                    Decline
                  </RippleButton>
                </div>
              </ScrollReveal>
            ))}
          </div>
        )}

        {acceptedInvites.length > 0 && !membership && (
          <ScrollReveal className="bg-white/3 border border-white/8 rounded-2xl p-5 mb-6 flex items-center gap-3">
            <CheckCircleIcon className="w-5 h-5 text-[#12A5A9] shrink-0" />
            <p className="text-white/70 text-sm">
              Managed by <span className="text-white font-semibold">{acceptedInvites[0].orgName}</span> — approval threshold ${acceptedInvites[0].approvalThreshold.toFixed(0)} per job.
            </p>
          </ScrollReveal>
        )}

        {!membership && (
          <ScrollReveal className="bg-white/3 border border-white/8 rounded-2xl p-6 mb-6">
            <h2 className="text-white font-semibold mb-2">Run a property management company?</h2>
            <p className="text-white/50 text-sm mb-4">
              Create your organization to manage several landlords' properties from one login — invite clients, add staff, and set per-client approval thresholds.
            </p>
            <div className="flex gap-3">
              <input
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                placeholder="Company name"
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-[#12A5A9]/50"
              />
              <RippleButton
                onClick={handleCreateOrg}
                disabled={creating || !orgName.trim()}
                className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-sm font-semibold px-5 py-2.5 rounded-xl disabled:opacity-50 whitespace-nowrap"
              >
                {creating ? 'Creating…' : 'Create'}
              </RippleButton>
            </div>
          </ScrollReveal>
        )}

        {membership && (
          <>
            <div className="grid grid-cols-3 gap-3 mb-6">
              <StatTile icon={BuildingIcon} label="Units managed" value={<CountUp value={combinedUnits} />} />
              <StatTile icon={WrenchIcon} label="Open jobs" value={<CountUp value={combinedOpenJobs} />} />
              {membership.canViewFinancials ? (
                <StatTile icon={DollarSignIcon} label="Rent this month" value={`$${combinedRent.toFixed(0)}`} />
              ) : (
                <StatTile icon={ShieldIcon} label="Role" value="Staff" />
              )}
            </div>

            <h2 className="text-white font-semibold mb-3">Clients</h2>
            {clients.length === 0 ? (
              <p className="text-white/40 text-sm mb-6">No accepted clients yet — invite one below.</p>
            ) : (
              <div className="space-y-3 mb-6">
                {clients.map((c) => (
                  <ScrollReveal key={c.portfolioId} className="bg-white/3 border border-white/8 rounded-2xl p-5">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-white font-semibold">{c.ownerName}</p>
                      {membership.memberRole === 'admin' && (
                        <button onClick={() => handleRemoveClient(c.portfolioId)} className="text-red-400/70 hover:text-red-400 text-xs">
                          Remove
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-2 mb-3">
                      <StatTile icon={BuildingIcon} label="Properties" value={c.propertyCount} />
                      <StatTile icon={WrenchIcon} label="Open jobs" value={c.openJobCount} />
                      {membership.canViewFinancials ? (
                        <StatTile icon={DollarSignIcon} label="Rent this month" value={`$${(c.rentCollectedThisMonth || 0).toFixed(0)}`} />
                      ) : (
                        <StatTile icon={BuildingIcon} label="Units" value={c.unitCount} />
                      )}
                    </div>
                    {membership.memberRole === 'admin' && (
                      <label className="flex items-center gap-2 text-xs text-white/50">
                        Approval threshold: $
                        <input
                          type="number"
                          defaultValue={c.approvalThreshold}
                          onBlur={(e) => handleThresholdChange(c.portfolioId, Number(e.target.value) || 0)}
                          className="w-24 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-white text-xs"
                        />
                        <span>— jobs over this amount need {c.ownerName}'s own approval</span>
                      </label>
                    )}
                  </ScrollReveal>
                ))}
              </div>
            )}

            {membership.memberRole === 'admin' && (
              <ScrollReveal className="bg-white/3 border border-white/8 rounded-2xl p-5 mb-6">
                <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
                  <PlusIcon className="w-4 h-4 text-[#12A5A9]" /> Invite a client
                </h3>
                <p className="text-white/40 text-xs mb-3">Enter the email of an existing landlord account on Prophandld.</p>
                <div className="flex gap-3">
                  <input
                    value={clientEmail}
                    onChange={(e) => setClientEmail(e.target.value)}
                    placeholder="landlord@email.com"
                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-[#12A5A9]/50"
                  />
                  <RippleButton
                    onClick={handleInviteClient}
                    disabled={invitingClient}
                    className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-sm font-semibold px-5 py-2.5 rounded-xl disabled:opacity-50 whitespace-nowrap"
                  >
                    {invitingClient ? 'Sending…' : 'Invite'}
                  </RippleButton>
                </div>
                {clientInviteMsg && <p className="text-white/50 text-xs mt-2">{clientInviteMsg}</p>}
              </ScrollReveal>
            )}

            <h2 className="text-white font-semibold mb-3">Team</h2>
            <div className="space-y-2 mb-6">
              {staff.map((s) => (
                <div key={s.id} className="bg-white/3 border border-white/8 rounded-xl p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-white text-sm font-medium truncate">{s.name}</p>
                    <p className="text-white/40 text-xs capitalize">
                      {s.memberRole}
                      {s.status === 'pending' ? ' · invite pending' : ''}
                    </p>
                  </div>
                  {membership.memberRole === 'admin' && s.memberRole === 'staff' && (
                    <div className="flex items-center gap-3 shrink-0">
                      <label className="flex items-center gap-1.5 text-xs text-white/50">
                        <input
                          type="checkbox"
                          checked={s.canViewFinancials}
                          onChange={(e) => handleToggleFinancials(s.id, e.target.checked)}
                          className="accent-[#12A5A9]"
                        />
                        Financials
                      </label>
                      <button onClick={() => handleRemoveStaff(s.id)} className="text-red-400/70 hover:text-red-400 text-xs">
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {membership.memberRole === 'admin' && (
              <ScrollReveal className="bg-white/3 border border-white/8 rounded-2xl p-5 mb-6">
                <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
                  <PlusIcon className="w-4 h-4 text-[#12A5A9]" /> Invite staff
                </h3>
                <div className="flex gap-3 mb-2">
                  <input
                    value={staffEmail}
                    onChange={(e) => setStaffEmail(e.target.value)}
                    placeholder="teammate@email.com"
                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-[#12A5A9]/50"
                  />
                  <RippleButton
                    onClick={handleInviteStaff}
                    disabled={invitingStaff}
                    className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-sm font-semibold px-5 py-2.5 rounded-xl disabled:opacity-50 whitespace-nowrap"
                  >
                    {invitingStaff ? 'Sending…' : 'Invite'}
                  </RippleButton>
                </div>
                <label className="flex items-center gap-1.5 text-xs text-white/50">
                  <input type="checkbox" checked={staffFinancials} onChange={(e) => setStaffFinancials(e.target.checked)} className="accent-[#12A5A9]" />
                  Can view financials (rent totals, payment amounts)
                </label>
                {staffInviteMsg && <p className="text-white/50 text-xs mt-2">{staffInviteMsg}</p>}
              </ScrollReveal>
            )}

            {auditLog.length > 0 && (
              <>
                <h2 className="text-white font-semibold mb-3">Recent activity</h2>
                <div className="space-y-2">
                  {auditLog.map((entry) => (
                    <div key={entry.id} className="bg-white/3 border border-white/8 rounded-xl px-4 py-3 text-xs text-white/50">
                      <span className="text-white/80">{entry.actorName}</span> {ACTION_LABELS[entry.action] || entry.action} for{' '}
                      <span className="text-white/80">{entry.ownerName}</span>
                      {entry.amount !== null && <span className="text-white/60"> · ${entry.amount.toFixed(2)}</span>}
                      <span className="text-white/30"> · {new Date(entry.createdAt).toLocaleDateString()}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
