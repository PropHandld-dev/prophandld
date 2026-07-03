'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

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
    new_password: '',
    confirm_password: '',
  })

  useEffect(() => {
    const getProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }
      setRole(user.user_metadata?.role || '')
      setForm({
        full_name: user.user_metadata?.full_name || '',
        email: user.email || '',
        phone: user.user_metadata?.phone || '',
        preferred_language: user.user_metadata?.preferred_language || 'en',
      })
      setLoading(false)
    }
    getProfile()
  }, [router])

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
      await supabase.from('users').update({
        full_name: form.full_name,
        phone: form.phone,
        preferred_language: form.preferred_language,
      }).eq('id', user.id)
    }

    setSuccess('Profile updated successfully.')
    setSaving(false)
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    if (passwordForm.new_password !== passwordForm.confirm_password) {
      setError('Passwords do not match.')
      return
    }

    if (passwordForm.new_password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    setSaving(true)
    const { error: updateError } = await supabase.auth.updateUser({
      password: passwordForm.new_password,
    })

    if (updateError) {
      setError(updateError.message)
      setSaving(false)
      return
    }

    setSuccess('Password updated successfully.')
    setPasswordForm({ new_password: '', confirm_password: '' })
    setSaving(false)
  }

  const getDashboardLink = () => {
    if (role === 'landlord') return '/landlord'
    if (role === 'renter') return '/renter'
    if (role === 'contractor') return '/contractor'
    return '/'
  }

  if (loading) return (
    <div className="min-h-screen bg-[#0C1A2E] flex items-center justify-center">
      <div className="text-white/50">Loading...</div>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#0C1A2E]">
      {/* Nav */}
      <nav className="border-b border-white/8 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href={getDashboardLink()} className="text-white/50 hover:text-white text-sm transition">
            ← Back to dashboard
          </Link>
        </div>
        <span className="text-white font-semibold text-sm">Prophandld</span>
      </nav>

      <main className="max-w-2xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-bold text-white mb-8">Profile settings</h1>

        {/* Profile form */}
        <div className="bg-white/3 border border-white/8 rounded-2xl p-6 mb-6">
          <h2 className="text-white font-semibold mb-6">Personal information</h2>
          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div>
              <label className="text-white/70 text-sm block mb-1">Full name</label>
              <input
                type="text"
                name="full_name"
                value={form.full_name}
                onChange={handleChange}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-[#12A5A9] transition"
              />
            </div>

            <div>
              <label className="text-white/70 text-sm block mb-1">Email</label>
              <input
                type="email"
                name="email"
                value={form.email}
                disabled
                className="w-full bg-white/3 border border-white/5 rounded-xl px-4 py-3 text-white/40 cursor-not-allowed"
              />
              <p className="text-white/30 text-xs mt-1">Email cannot be changed</p>
            </div>

            <div>
              <label className="text-white/70 text-sm block mb-1">Phone</label>
              <input
                type="tel"
                name="phone"
                value={form.phone}
                onChange={handleChange}
                placeholder="+1 (555) 000-0000"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-[#12A5A9] transition"
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

            <button
              type="submit"
              disabled={saving}
              className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white font-semibold px-6 py-2.5 rounded-xl transition hover:opacity-90 disabled:opacity-50 text-sm"
            >
              {saving ? 'Saving...' : 'Save changes'}
            </button>
          </form>
        </div>

        {/* Change password */}
        <div className="bg-white/3 border border-white/8 rounded-2xl p-6 mb-6">
          <h2 className="text-white font-semibold mb-6">Change password</h2>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <label className="text-white/70 text-sm block mb-1">New password</label>
              <input
                type="password"
                value={passwordForm.new_password}
                onChange={(e) => setPasswordForm({ ...passwordForm, new_password: e.target.value })}
                placeholder="Min. 8 characters"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-[#12A5A9] transition"
              />
            </div>
            <div>
              <label className="text-white/70 text-sm block mb-1">Confirm new password</label>
              <input
                type="password"
                value={passwordForm.confirm_password}
                onChange={(e) => setPasswordForm({ ...passwordForm, confirm_password: e.target.value })}
                placeholder="Re-enter new password"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-[#12A5A9] transition"
              />
            </div>
            <button
              type="submit"
              disabled={saving}
              className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white font-semibold px-6 py-2.5 rounded-xl transition hover:opacity-90 disabled:opacity-50 text-sm"
            >
              {saving ? 'Updating...' : 'Update password'}
            </button>
          </form>
        </div>

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

        {/* Notification preferences */}
        <div className="bg-white/3 border border-white/8 rounded-2xl p-6 mb-6">
          <h2 className="text-white font-semibold mb-2">Notification preferences</h2>
          <p className="text-white/40 text-sm mb-6">Choose how you want to be notified</p>
          <div className="space-y-4">
            {[
              { label: 'Email notifications', sublabel: 'Job updates, status changes', key: 'email' },
              { label: 'Push notifications', sublabel: 'In-app alerts', key: 'push' },
            ].map((item) => (
              <div key={item.key} className="flex items-center justify-between">
                <div>
                  <p className="text-white text-sm font-medium">{item.label}</p>
                  <p className="text-white/40 text-xs">{item.sublabel}</p>
                </div>
                <div className="w-10 h-6 bg-[#0A7B7E] rounded-full relative cursor-pointer">
                  <div className="w-4 h-4 bg-white rounded-full absolute right-1 top-1 transition" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Delete account */}
        <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-6">
          <h2 className="text-white font-semibold mb-2">Delete account</h2>
          <p className="text-white/40 text-sm mb-4">Permanently delete your account and all associated data. This cannot be undone.</p>
          <button className="bg-red-500/10 border border-red-500/30 text-red-400 font-semibold px-6 py-2.5 rounded-xl text-sm hover:bg-red-500/20 transition">
            Request account deletion
          </button>
        </div>

      </main>
    </div>
  )
}