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
import { Switch } from '@/components/Switch'
import { TwoFactorAuthCard } from '@/components/TwoFactorAuthCard'
import { usePushSubscription } from '@/lib/usePushSubscription'
import { useLanguage, t } from '@/lib/i18n'

export default function ProfilePage() {
  const router = useRouter()
  const lang = useLanguage()
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
  const [initialLanguage, setInitialLanguage] = useState<'en' | 'es'>('en')
  const [showLanguageToast, setShowLanguageToast] = useState(false)
  const [smsOptIn, setSmsOptIn] = useState(false)
  const [smsSaving, setSmsSaving] = useState(false)
  const [emailNotifEnabled, setEmailNotifEnabled] = useState(true)
  const [emailNotifSaving, setEmailNotifSaving] = useState(false)
  const [pushNotifEnabled, setPushNotifEnabled] = useState(true)
  const [pushNotifSaving, setPushNotifSaving] = useState(false)
  const pushSub = usePushSubscription()
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
      const loadedLanguage = user.user_metadata?.preferred_language === 'es' ? 'es' : 'en'
      setForm({
        full_name: user.user_metadata?.full_name || '',
        email: user.email || '',
        phone: user.user_metadata?.phone || '',
        preferred_language: loadedLanguage,
      })
      setInitialLanguage(loadedLanguage)

      const { data: userRow } = await supabase
        .from('users')
        .select('sms_opt_in, email_notifications_enabled, push_notifications_enabled')
        .eq('id', user.id)
        .maybeSingle()
      setSmsOptIn(!!userRow?.sms_opt_in)
      setEmailNotifEnabled(userRow?.email_notifications_enabled !== false)
      setPushNotifEnabled(userRow?.push_notifications_enabled !== false)

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
      setError(t('addPhoneBeforeTextAlerts', lang))
      return
    }

    setSmsSaving(true)
    setError(null)
    const next = !smsOptIn
    const { error: updateError } = await supabase.from('users').update({ sms_opt_in: next }).eq('id', user.id)

    if (updateError) {
      console.error('Error updating sms_opt_in:', updateError)
      setError(t('couldNotUpdateTextAlertPrefix', lang) + updateError.message)
      setSmsSaving(false)
      return
    }

    setSmsOptIn(next)
    setSmsSaving(false)
  }

  const handleToggleEmailNotif = async (next: boolean) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setEmailNotifSaving(true)
    setError(null)
    const { error: updateError } = await supabase.from('users').update({ email_notifications_enabled: next }).eq('id', user.id)
    if (updateError) {
      console.error('Error updating email_notifications_enabled:', updateError)
      setError(t('couldNotUpdateEmailPrefPrefix', lang) + updateError.message)
      setEmailNotifSaving(false)
      return
    }
    setEmailNotifEnabled(next)
    setEmailNotifSaving(false)
  }

  const handleTogglePushNotif = async (next: boolean) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setPushNotifSaving(true)
    setError(null)
    const { error: updateError } = await supabase.from('users').update({ push_notifications_enabled: next }).eq('id', user.id)
    if (updateError) {
      console.error('Error updating push_notifications_enabled:', updateError)
      setError(t('couldNotUpdatePushPrefPrefix', lang) + updateError.message)
      setPushNotifSaving(false)
      return
    }
    setPushNotifEnabled(next)
    setPushNotifSaving(false)
    // Turning it on here only saves the account-level preference — if this
    // browser has never actually subscribed, prompt for that too so the
    // toggle isn't a no-op. Declining just leaves the hint below visible.
    if (next && pushSub.checked && !pushSub.subscribed && pushSub.supported) {
      await pushSub.enable()
    }
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
        setError(t('publicProfileSyncFailedPrefix', lang) + publicUpdateError.message)
        setSaving(false)
        return
      }
    }

    setSaving(false)

    // The rest of the app (nav, tab bar, every other already-mounted page)
    // reads the saved language once on its own mount via useLanguage() —
    // it has no way to hear about this change live. A toast alone would
    // claim success while the UI silently stayed in the old language, so
    // this reloads once the user's actually seen the confirmation,
    // guaranteeing what the toast says is immediately true everywhere.
    if (form.preferred_language !== initialLanguage) {
      setShowLanguageToast(true)
      setTimeout(() => window.location.reload(), 1400)
      return
    }

    setSuccess(t('profileUpdatedToast', lang))
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    if (!passwordForm.current_password) {
      setError(t('enterCurrentPassword', lang))
      return
    }

    if (passwordForm.new_password !== passwordForm.confirm_password) {
      setError(t('passwordsDoNotMatch', lang))
      return
    }

    if (passwordForm.new_password.length < 8) {
      setError(t('passwordMinLength', lang))
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
      setError(t('currentPasswordIncorrect', lang))
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

    setSuccess(t('passwordUpdatedSuccessfully', lang))
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
      setError(t('couldNotDeleteAccountPlain', lang) + (data.error ? ': ' + data.error : '.'))
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
            {t('backToDashboard', lang)}
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
        <h1 className="text-2xl font-bold text-white mb-8">{t('profileSettings', lang)}</h1>

        {/* Profile form */}
        <ScrollReveal className="bg-white/3 border border-white/8 rounded-2xl p-6 mb-6">
          <h2 className="text-white font-semibold mb-6">{t('personalInformation', lang)}</h2>
          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div>
              <label className="text-white/70 text-sm block mb-1">{t('fullName', lang)}</label>
              <input
                type="text"
                name="full_name"
                value={form.full_name}
                onChange={handleChange}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/50 focus:outline-none focus:border-[#12A5A9] transition"
              />
            </div>

            <div>
              <label className="text-white/70 text-sm block mb-1">{t('email', lang)}</label>
              <input
                type="email"
                name="email"
                value={form.email}
                disabled
                className="w-full bg-white/3 border border-white/5 rounded-xl px-4 py-3 text-white/60 cursor-not-allowed"
              />
              <p className="text-white/50 text-xs mt-1">{t('emailCannotChange', lang)}</p>
            </div>

            <div>
              <label className="text-white/70 text-sm block mb-1">{t('phone', lang)}</label>
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
              <label className="text-white/70 text-sm block mb-1">{t('language', lang)}</label>
              <select
                name="preferred_language"
                value={form.preferred_language}
                onChange={handleChange}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#12A5A9] transition"
              >
                <option value="en" className="bg-[#0C1A2E]">English</option>
                <option value="es" className="bg-[#0C1A2E]">Español</option>
              </select>
              <p className="text-white/40 text-xs mt-1">{t('languageHelp', lang)}</p>
            </div>

            <RippleButton
              type="submit"
              disabled={saving}
              className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white font-semibold px-6 py-2.5 rounded-xl transition hover:opacity-90 disabled:opacity-50 text-sm"
            >
              {saving ? t('saving', lang) : t('saveChanges', lang)}
            </RippleButton>
          </form>
        </ScrollReveal>

        {/* Change password */}
        <ScrollReveal className="bg-white/3 border border-white/8 rounded-2xl p-6 mb-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-white font-semibold">{t('changePassword', lang)}</h2>
            <Link href="/forgot-password" className="text-[#12A5A9] text-xs font-medium hover:underline">
              {t('forgotYourPassword', lang)}
            </Link>
          </div>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <label className="text-white/70 text-sm block mb-1">{t('currentPassword', lang)}</label>
              <PasswordInput
                value={passwordForm.current_password}
                onChange={(e) => setPasswordForm({ ...passwordForm, current_password: e.target.value })}
                placeholder={t('currentPasswordPlaceholder', lang)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/50 focus:outline-none focus:border-[#12A5A9] transition"
              />
            </div>
            <div>
              <label className="text-white/70 text-sm block mb-1">{t('newPassword', lang)}</label>
              <PasswordInput
                value={passwordForm.new_password}
                onChange={(e) => setPasswordForm({ ...passwordForm, new_password: e.target.value })}
                placeholder={t('newPasswordPlaceholder', lang)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/50 focus:outline-none focus:border-[#12A5A9] transition"
              />
            </div>
            <div>
              <label className="text-white/70 text-sm block mb-1">{t('confirmNewPassword', lang)}</label>
              <PasswordInput
                value={passwordForm.confirm_password}
                onChange={(e) => setPasswordForm({ ...passwordForm, confirm_password: e.target.value })}
                placeholder={t('confirmNewPasswordPlaceholder', lang)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/50 focus:outline-none focus:border-[#12A5A9] transition"
              />
            </div>
            <RippleButton
              type="submit"
              disabled={saving}
              className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white font-semibold px-6 py-2.5 rounded-xl transition hover:opacity-90 disabled:opacity-50 text-sm"
            >
              {saving ? t('updating', lang) : t('updatePassword', lang)}
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
            <div id="billing" className="scroll-mt-6">
              <BillingSection />
            </div>
            <div className="mb-6">
              <StripeConnectCard purpose="rent" />
            </div>
          </>
        )}

        {/* Contractor payouts — previously only reachable at the very
            bottom of Settings, after the full licenses/credentials
            checklist. Landlords already get their payout card right here
            on Profile; a contractor shouldn't have to scroll past
            everything else to find the same thing. Settings keeps its own
            copy too (removing it there would be a bigger, separate change
            to how that page is organized) — this just adds a second,
            easier-to-reach entry point. */}
        {role === 'contractor' && (
          <div className="mb-6">
            <StripeConnectCard purpose="jobs" />
          </div>
        )}

        {/* Notification preferences */}
        <div className="bg-white/3 border border-white/8 rounded-2xl p-6 mb-6">
          <h2 className="text-white font-semibold mb-2">{t('notificationPreferences', lang)}</h2>
          <p className="text-white/60 text-sm mb-6">{t('notifPrefDesc', lang)}</p>
          <div className="space-y-4">
            <div className="flex items-center justify-between py-1 gap-3">
              <div>
                <p className="text-white text-sm font-medium">{t('emailNotifications', lang)}</p>
                <p className="text-white/60 text-xs">{t('emailNotifDesc', lang)}</p>
              </div>
              <Switch checked={emailNotifEnabled} onChange={(next) => !emailNotifSaving && handleToggleEmailNotif(next)} label={t('emailNotifications', lang)} />
            </div>

            <div className="py-1">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-white text-sm font-medium">{t('pushNotifications', lang)}</p>
                  <p className="text-white/60 text-xs">{t('pushNotifDesc', lang)}</p>
                </div>
                <Switch checked={pushNotifEnabled} onChange={(next) => !pushNotifSaving && handleTogglePushNotif(next)} label={t('pushNotifications', lang)} />
              </div>
              {pushNotifEnabled && pushSub.checked && !pushSub.subscribed && (
                <div className="mt-3 bg-white/5 border border-white/8 rounded-xl px-3.5 py-3 flex items-center justify-between gap-3 flex-wrap">
                  <p className="text-white/60 text-xs flex-1 min-w-[180px]">
                    {pushSub.isIosBrowserTab ? t('pushNeedsBrowserSetupIos', lang) : t('pushNeedsBrowserSetup', lang)}
                  </p>
                  {!pushSub.isIosBrowserTab && pushSub.supported && (
                    <RippleButton
                      onClick={pushSub.enable}
                      disabled={pushSub.loading}
                      className="text-xs font-semibold bg-white/8 text-white px-3.5 py-2 rounded-lg hover:bg-white/12 transition disabled:opacity-50 shrink-0"
                    >
                      {pushSub.loading ? t('enabling', lang) : t('enableInThisBrowser', lang)}
                    </RippleButton>
                  )}
                </div>
              )}
              {pushSub.error && <p className="text-red-400 text-xs mt-2">{pushSub.error}</p>}
            </div>

            <div className="flex items-center justify-between py-1 gap-3">
              <div>
                <p className="text-white text-sm font-medium">{t('textAlerts', lang)}</p>
                <p className="text-white/60 text-xs">{t('textAlertsDesc', lang)}</p>
              </div>
              <Switch checked={smsOptIn} onChange={() => !smsSaving && handleToggleSms()} label={t('textAlerts', lang)} />
            </div>
          </div>
          <p className="text-white/40 text-xs mt-6 pt-4 border-t border-white/8">{t('notifPrefFootnote', lang)}</p>
        </div>

        {/* Personal backup contact */}
        {(role === 'landlord' || role === 'renter') && (
          <div className="bg-white/3 border border-white/8 rounded-2xl p-6 mb-6">
            <h2 className="text-white font-semibold mb-1">{t('backupContact', lang)}</h2>
            <p className="text-white/40 text-sm mb-6">
              {role === 'landlord' ? t('backupContactDescLandlord', lang) : t('backupContactDescRenter', lang)}
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
                      {t('remove', lang)}
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
                  placeholder={t('name', lang)}
                  className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-white/50 focus:outline-none focus:border-[#12A5A9] transition"
                />
                <input
                  type="text"
                  value={backupForm.relationship}
                  onChange={(e) => setBackupForm({ ...backupForm, relationship: e.target.value })}
                  placeholder={t('relationshipPlaceholder', lang)}
                  className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-white/50 focus:outline-none focus:border-[#12A5A9] transition"
                />
              </div>
              <input
                type="tel"
                value={backupForm.phone}
                onChange={(e) => setBackupForm({ ...backupForm, phone: e.target.value })}
                placeholder={t('phoneNumberPlaceholder', lang)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-white/50 focus:outline-none focus:border-[#12A5A9] transition"
              />
              {backupError && <p className="text-red-400 text-xs">{backupError}</p>}
              {!backupError && !savingBackupContact && (!backupForm.name.trim() || !backupForm.phone.trim()) && (backupForm.name || backupForm.relationship || backupForm.phone) && (
                <p className="text-white/40 text-xs">{t('backupContactNeedsNameAndPhone', lang)}</p>
              )}
              <RippleButton
                type="submit"
                disabled={savingBackupContact || !backupForm.name.trim() || !backupForm.phone.trim()}
                className="bg-white/8 text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-white/12 transition disabled:opacity-50"
              >
                {savingBackupContact ? t('adding', lang) : t('addBackupContact', lang)}
              </RippleButton>
            </form>
          </div>
        )}

        <TwoFactorAuthCard />

        {/* Replay tour */}
        <Link
          href={`${getDashboardLink()}?tour=replay`}
          className="block bg-white/3 border border-white/8 rounded-2xl p-6 mb-6 hover:border-[#12A5A9]/30 hover:bg-white/5 transition-all"
        >
          <h2 className="text-white font-semibold mb-1">{t('takeTheTour', lang)}</h2>
          <p className="text-white/60 text-sm">{t('takeTheTourDesc', lang)}</p>
        </Link>

        {/* Delete account */}
        <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-6 mb-6">
          <h2 className="text-white font-semibold mb-2">{t('deleteAccount', lang)}</h2>
          <p className="text-white/60 text-sm mb-4">{t('deleteAccountDesc', lang)}</p>
          {!showDeleteConfirm ? (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="bg-red-500/10 border border-red-500/30 text-red-400 font-semibold px-6 py-2.5 rounded-xl text-sm hover:bg-red-500/20 transition"
            >
              {t('deleteAccount', lang)}
            </button>
          ) : (
            <div className="space-y-3">
              <p className="text-white/70 text-sm">{t('typeToConfirmPrefix', lang)} <span className="text-white font-medium">DELETE</span> {t('typeToConfirmSuffix', lang)}</p>
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
                  {deletingAccount ? t('deleting', lang) : t('permanentlyDeleteMyAccount', lang)}
                </button>
                <button
                  onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText('') }}
                  disabled={deletingAccount}
                  className="text-white/50 hover:text-white text-sm transition"
                >
                  {t('cancel', lang)}
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
          {t('signOut', lang)}
        </button>
        </>
        )}

      </main>

      {role && TABS_BY_ROLE[role] && <BottomTabBar tabs={TABS_BY_ROLE[role]} />}

      {showPasswordToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#0F2138] border border-[#12A5A9]/30 rounded-xl px-5 py-3 shadow-lg flex items-center gap-2 z-50 motion-safe:animate-[floatUp_0.25s_ease-out]">
          <span className="text-[#12A5A9]">✓</span>
          <span className="text-white text-sm font-medium">{t('passwordUpdatedToast', lang)}</span>
        </div>
      )}

      {showLanguageToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#0F2138] border border-[#12A5A9]/30 rounded-xl px-5 py-3 shadow-lg flex items-center gap-2 z-50 motion-safe:animate-[floatUp_0.25s_ease-out]">
          <span className="text-[#12A5A9]">✓</span>
          <span className="text-white text-sm font-medium">{t('languageUpdatedToast', form.preferred_language as 'en' | 'es')}</span>
        </div>
      )}
    </div>
  )
}