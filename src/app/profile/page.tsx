'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { BottomTabBar } from '@/components/BottomTabBar'
import { Skeleton } from '@/components/Skeleton'
import { ScrollReveal } from '@/components/ScrollReveal'
import { RippleButton } from '@/components/RippleButton'
import { PasswordInput } from '@/components/PasswordInput'
import { LogOutIcon } from '@/components/icons'
import { TABS_BY_ROLE } from '@/lib/navTabs'
import { StripeConnectCard } from '@/components/StripeConnectCard'
import { BillingSection } from '@/components/BillingSection'

export default function ProfilePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [role, setRole] = useState<string>('')
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    preferred_language: 'en',
  })
  const [passwordForm, setPasswordForm] = useState({
    current_password: '',
    new_password: '',
    confirm_password: '',
  })
  const [showPasswordToast, setShowPasswordToast] = useState(false)
  const [smsOptIn, setSmsOptIn] = useState(false)
  const [smsSaving, setSmsSaving] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deletingAccount, setDeletingAccount] = useState(false)
  const [backupContacts, setBackupContacts] = useState<any[]>([])
  const [backupForm, setBackupForm] = useState({ name: '', relationship: '', phone: '' })
  const [savingBackupContact, setSavingBackupContact] = useState(false)
  const [backupError, setBackupError] = useState<string | null>(null)

  useEffect(() => {
    const getProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/login')
        return
      }
      setRole(user.user_metadata?.role || '')
      setForm({
        full_name: user.user_metadata?.full_name || '',
        email: user.email || '',
        phone: user.user_metadata?.phone || '',
        preferred_language: user.user_metadata?.preferred_language || 'en',
      })

      const { data: userRow } = await supabase.from('users').select('sms_opt_in').eq('id', user.id).maybeSingle()
      setSmsOptIn(!!userRow?.sms_opt_in)

      await loadBackupContacts(user.id)

      setLoading(false)
    }

    const loadBackupContacts = async (userId: string) => {
      const { data } = await supabase
        .from('personal_emergency_contacts')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
      setBackupContacts(data || [])
    }
    getProfile()
  }, [router])

  const handleAddBackupContact = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!backupForm.name.trim() || !backupForm.phone.trim()) return

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    setSavingBackupContact(true)
    setBackupError(null)

    const { error: insertError } = await supabase.from('personal_emergency_contacts').insert({
      user_id: user.id,
      name: backupForm.name.trim(),
      relationship: backupForm.relationship.trim() || null,
      phone: backupForm.phone.trim(),
    })

    if (insertError) {
      setBackupError('Could not save: ' + insertError.message)
      setSavingBackupContact(false)
      return
    }

    setBackupForm({ name: '', relationship: '', phone: '' })
    const { data } = await supabase
      .from('personal_emergency_contacts')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
    setBackupContacts(data || [])
    setSavingBackupContact(false)
  }

  const handleRemoveBackupContact = async (id: string) => {
    await supabase.from('personal_emergency_contacts').delete().eq('id', id)
    setBackupContacts((prev) => prev.filter((c) => c.id !== id))
  }

  const handleToggleSms = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    if (!smsOptIn && !form.phone.trim()) {
      setError('Add a phone number above before enabling text alerts.')
      return
    }

    setSmsSaving(true)
    setError(null)
    const next = !smsOptIn
    const { error: updateError } = await supabase.from('users').update({ sms_opt_in: next }).eq('id', user.id)

    if (updateError) {
      console.error('Error updating sms_opt_in:', updateError)
      setError('Could not update text alert preference: ' + updateError.message)
      setSmsSaving(false)
      return
    }

    setSmsOptIn(next)
    setSmsSaving(false)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSuccess(null)

    const { error: updateError } = await supabase.auth.updateUser({
      data: {
        full_name: form.full_name,
        phone: form.phone,
        preferred_language: form.preferred_language,
      },
    })

    if (updateError) {
      setError(updateError.message)
      setSaving(false)
      return
    }

    // Also update public.users table
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { error: publicUpdateError } = await supabase
        .from('users')
        .update({
          full_name: form.full_name,
          phone: form.phone,
          preferred_language: form.preferred_language,
        })
        .eq('id', user.id)

      if (publicUpdateError) {
        console.error('Error updating public.users:', publicUpdateError)
        setError('Your login info was updated, but your public profile (visible to others) failed to sync: ' + publicUpdateError.message)
        setSaving(false)
        return
      }
    }

    setSuccess('Profile updated successfully.')
    setSaving(false)
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    if (!passwordForm.current_password) {
      setError('Enter your current password.')
      return
    }

    if (passwordForm.new_password !== passwordForm.confirm_password) {
      setError('Passwords do not match.')
      return
    }

    if (passwordForm.new_password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    setSaving(true)

    // Supabase's updateUser() doesn't require the current password — it
    // trusts the existing session. Re-authenticating with it here first is
    // what actually makes this a real "change password" flow instead of
    // "anyone with an unlocked device can set a new one."
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: form.email,
      password: passwordForm.current_password,
    })

    if (verifyError) {
      setError('Current password is incorrect.')
      setSaving(false)
      return
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password: passwordForm.new_password,
    })

    if (updateError) {
      setError(updateError.message)
      setSaving(false)
      return
    }

    setSuccess('Password updated successfully.')
    setShowPasswordToast(true)
    setTimeout(() => setShowPasswordToast(false), 3000)
    setPasswordForm({ current_password: '', new_password: '', confirm_password: '' })
    setSaving(false)
  }

  const getDashboardLink = () => {
    if (role === 'landlord') return '/landlord'
    if (role === 'renter') return '/renter'
    if (role === 'contractor') return '/contractor'
    return '/'
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.replace('/login')
  }

  const handleDeleteAccount = async () => {
    if (deleteConfirmText.trim().toUpperCase() !== 'DELETE') return

    setDeletingAccount(true)
    setError(null)
    const res = await fetch('/api/account/delete', { method: 'POST' })
    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
      setError('Could not delete account' + (data.error ? ': ' + data.error : '.'))
      setDeletingAccount(false)
      return
    }

    await supabase.auth.signOut()
    router.replace('/')
  }

  return (
    <div className="min-h-screen bg-[#0C1A2E]">
      {/* Nav */}
      <nav className="border-b border-white/8 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href={getDashboardLink()} className="text-white/50 hover:text-white text-sm transition">
            ← Back to dashboard
          </Link>
        </div>
        <Link href={getDashboardLink()} className="text-white font-semibold text-sm hover:opacity-80 transition">Prophandld</Link>
      </nav>

      <main className="max-w-2xl mx-auto px-6 py-10 pb-28">
        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-8 w-48 mb-4" />
            <Skeleton className="h-64" />
            <Skeleton className="h-40" />
            <Skeleton className="h-32" />
          </div>
        ) : (
        <>
        <h1 className="text-2xl font-bold text-white mb-8">Profile settings</h1>

        {/* Profile form */}
        <ScrollReveal className="bg-white/3 border border-white/8 rounded-2xl p-6 mb-6">
          <h2 className="text-white font-semibold mb-6">Personal information</h2>
          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div>
              <label className="text-white/70 text-sm block mb-1">Full name</label>
              <input
                type="text"
                name="full_name"
                value={form.full_name}
                onChange={handleChange}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/50 focus:outline-none focus:border-[#12A5A9] transition"
              />
            </div>

            <div>
              <label className="text-white/70 text-sm block mb-1">Email</label>
              <input
                type="email"
                name="email"
                value={form.email}
                disabled
                className="w-full bg-white/3 border border-white/5 rounded-xl px-4 py-3 text-white/60 cursor-not-allowed"
              />
              <p className="text-white/50 text-xs mt-1">Email cannot be changed</p>
            </div>

            <div>
              <label className="text-white/70 text-sm block mb-1">Phone</label>
              <input
                type="tel"
                name="phone"
                value={form.phone}
                onChange={handleChange}
                placeholder="+1 (555) 000-0000"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/50 focus:outline-none focus:border-[#12A5A9] transition"
              />
            </div>

            <div>
              <label className="text-white/70 text-sm block mb-1">Preferred language</label>
              <select
                name="preferred_language"
                value={form.preferred_language}
                onChange={handleChange}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#12A5A9] transition"
              >
                <option value="en" className="bg-[#0C1A2E]">English</option>
                <option value="es" className="bg-[#0C1A2E]">Spanish</option>
              </select>
            </div>

            <RippleButton
              type="submit"
              disabled={saving}
              className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white font-semibold px-6 py-2.5 rounded-xl transition hover:opacity-90 disabled:opacity-50 text-sm"
            >
              {saving ? 'Saving...' : 'Save changes'}
            </RippleButton>
          </form>
        </ScrollReveal>

        {/* Change password */}
        <ScrollReveal className="bg-white/3 border border-white/8 rounded-2xl p-6 mb-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-white font-semibold">Change password</h2>
            <Link href="/forgot-password" className="text-[#12A5A9] text-xs font-medium hover:underline">
              Forgot your password?
            </Link>
          </div>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <label className="text-white/70 text-sm block mb-1">Current password</label>
              <PasswordInput
                value={passwordForm.current_password}
                onChange={(e) => setPasswordForm({ ...passwordForm, current_password: e.target.value })}
                placeholder="Your current password"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/50 focus:outline-none focus:border-[#12A5A9] transition"
              />
            </div>
            <div>
              <label className="text-white/70 text-sm block mb-1">New password</label>
              <PasswordInput
                value={passwordForm.new_password}
                onChange={(e) => setPasswordForm({ ...passwordForm, new_password: e.target.value })}
                placeholder="Min. 8 characters"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/50 focus:outline-none focus:border-[#12A5A9] transition"
              />
            </div>
            <div>
              <label className="text-white/70 text-sm block mb-1">Confirm new password</label>
              <PasswordInput
                value={passwordForm.confirm_password}
                onChange={(e) => setPasswordForm({ ...passwordForm, confirm_password: e.target.value })}
                placeholder="Re-enter new password"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/50 focus:outline-none focus:border-[#12A5A9] transition"
              />
            </div>
            <RippleButton
              type="submit"
              disabled={saving}
              className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white font-semibold px-6 py-2.5 rounded-xl transition hover:opacity-90 disabled:opacity-50 text-sm"
            >
              {saving ? 'Updating...' : 'Update password'}
            </RippleButton>
          </form>
        </ScrollReveal>

        {/* Success / Error */}
        {success && (
          <div className="bg-[#0A7B7E]/15 border border-[#12A5A9]/30 rounded-xl px-4 py-3 text-[#12A5A9] text-sm mb-6">
            {success}
          </div>
        )}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm mb-6">
            {error}
          </div>
        )}

        {/* Landlord billing + payouts */}
        {role === 'landlord' && (
          <>
            <BillingSection />
            <div className="mb-6">
              <StripeConnectCard purpose="rent" />
            </div>
          </>
        )}

        {/* Notification preferences */}
        <div className="bg-white/3 border border-white/8 rounded-2xl p-6 mb-6">
          <h2 className="text-white font-semibold mb-2">Notification preferences</h2>
          <p className="text-white/60 text-sm mb-6">Choose how you want to be notified</p>
          <div className="space-y-4">
            <div className="flex items-center justify-between py-1">
              <div>
                <p className="text-white text-sm font-medium">Email notifications</p>
                <p className="text-white/60 text-xs">Job updates and status changes</p>
              </div>
              <span className="text-[#12A5A9] text-xs font-semibold bg-[#12A5A9]/10 border border-[#12A5A9]/20 rounded-full px-2.5 py-1">Always on</span>
            </div>
            <div className="flex items-center justify-between py-1">
              <div>
                <p className="text-white text-sm font-medium">Push notifications</p>
                <p className="text-white/60 text-xs">Enable from the banner on your dashboard</p>
              </div>
            </div>
            <div className="flex items-center justify-between py-1">
              <div>
                <p className="text-white text-sm font-medium">Text alerts</p>
                <p className="text-white/60 text-xs">Urgent updates only: emergencies, scheduling, review needed</p>
              </div>
              <button
                onClick={handleToggleSms}
                disabled={smsSaving}
                className={`w-10 h-6 rounded-full relative transition disabled:opacity-50 ${smsOptIn ? 'bg-[#0A7B7E]' : 'bg-white/10'}`}
              >
                <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all ${smsOptIn ? 'right-1' : 'left-1'}`} />
              </button>
            </div>
          </div>
        </div>

        {/* Personal backup contact */}
        {(role === 'landlord' || role === 'renter') && (
          <div className="bg-white/3 border border-white/8 rounded-2xl p-6 mb-6">
            <h2 className="text-white font-semibold mb-1">Backup contact</h2>
            <p className="text-white/40 text-sm mb-6">
              {role === 'landlord'
                ? "A family member or friend your tenant can reach if you don't answer."
                : "A family member or friend your landlord can reach if you don't answer."}
            </p>

            {backupContacts.length > 0 && (
              <div className="space-y-2 mb-4">
                {backupContacts.map((c) => (
                  <div key={c.id} className="flex items-center justify-between bg-white/5 border border-white/10 rounded-xl px-4 py-3">
                    <div>
                      <p className="text-white text-sm font-medium">{c.name}{c.relationship ? ` · ${c.relationship}` : ''}</p>
                      <p className="text-white/50 text-xs">{c.phone}</p>
                    </div>
                    <button
                      onClick={() => handleRemoveBackupContact(c.id)}
                      className="text-red-400/70 hover:text-red-400 text-xs transition"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}

            <form onSubmit={handleAddBackupContact} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  value={backupForm.name}
                  onChange={(e) => setBackupForm({ ...backupForm, name: e.target.value })}
                  placeholder="Name"
                  className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-white/50 focus:outline-none focus:border-[#12A5A9] transition"
                />
                <input
                  type="text"
                  value={backupForm.relationship}
                  onChange={(e) => setBackupForm({ ...backupForm, relationship: e.target.value })}
                  placeholder="Relationship (e.g. spouse)"
                  className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-white/50 focus:outline-none focus:border-[#12A5A9] transition"
                />
              </div>
              <input
                type="tel"
                value={backupForm.phone}
                onChange={(e) => setBackupForm({ ...backupForm, phone: e.target.value })}
                placeholder="Phone number"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-white/50 focus:outline-none focus:border-[#12A5A9] transition"
              />
              {backupError && <p className="text-red-400 text-xs">{backupError}</p>}
              <RippleButton
                type="submit"
                disabled={savingBackupContact || !backupForm.name.trim() || !backupForm.phone.trim()}
                className="bg-white/8 text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-white/12 transition disabled:opacity-50"
              >
                {savingBackupContact ? 'Adding…' : 'Add backup contact'}
              </RippleButton>
            </form>
          </div>
        )}

        {/* Replay tour */}
        <Link
          href={`${getDashboardLink()}?tour=replay`}
          className="block bg-white/3 border border-white/8 rounded-2xl p-6 mb-6 hover:border-[#12A5A9]/30 hover:bg-white/5 transition-all"
        >
          <h2 className="text-white font-semibold mb-1">Take the tour</h2>
          <p className="text-white/60 text-sm">Replay the quick walkthrough of your dashboard.</p>
        </Link>

        {/* Delete account */}
        <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-6 mb-6">
          <h2 className="text-white font-semibold mb-2">Delete account</h2>
          <p className="text-white/60 text-sm mb-4">Permanently delete your account and all associated data. This cannot be undone.</p>
          {!showDeleteConfirm ? (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="bg-red-500/10 border border-red-500/30 text-red-400 font-semibold px-6 py-2.5 rounded-xl text-sm hover:bg-red-500/20 transition"
            >
              Delete account
            </button>
          ) : (
            <div className="space-y-3">
              <p className="text-white/70 text-sm">Type <span className="text-white font-medium">DELETE</span> to confirm.</p>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="DELETE"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-white/50 focus:outline-none focus:border-red-400 transition text-sm"
              />
              <div className="flex items-center gap-3">
                <button
                  onClick={handleDeleteAccount}
                  disabled={deletingAccount || deleteConfirmText.trim().toUpperCase() !== 'DELETE'}
                  className="bg-red-500 text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition hover:opacity-90 disabled:opacity-40"
                >
                  {deletingAccount ? 'Deleting…' : 'Permanently delete my account'}
                </button>
                <button
                  onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText('') }}
                  disabled={deletingAccount}
                  className="text-white/50 hover:text-white text-sm transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Sign out */}
        <button
          onClick={handleSignOut}
          className="w-full flex items-center justify-center gap-2 bg-white/3 border border-white/8 text-white/70 hover:text-white hover:bg-white/5 font-semibold px-6 py-3 rounded-2xl text-sm transition"
        >
          <LogOutIcon className="w-4 h-4" />
          Sign out
        </button>
        </>
        )}

      </main>

      {role && TABS_BY_ROLE[role] && <BottomTabBar tabs={TABS_BY_ROLE[role]} />}

      {showPasswordToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#0F2138] border border-[#12A5A9]/30 rounded-xl px-5 py-3 shadow-lg flex items-center gap-2 z-50 motion-safe:animate-[floatUp_0.25s_ease-out]">
          <span className="text-[#12A5A9]">✓</span>
          <span className="text-white text-sm font-medium">Password updated</span>
        </div>
      )}
    </div>
  )
}