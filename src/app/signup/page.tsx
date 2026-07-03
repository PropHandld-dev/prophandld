'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function SignupPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    password: '',
    phone: '',
    role: '',
    preferred_language: 'en',
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    if (!form.role) {
      setError('Please select your role.')
      setLoading(false)
      return
    }

    const { data, error: signupError } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        data: {
          full_name: form.full_name,
          phone: form.phone,
          role: form.role,
          preferred_language: form.preferred_language,
        },
      },
    })

    if (signupError) {
      setError('Auth error: ' + signupError.message)
      setLoading(false)
      return
    }

    if (!data.user) {
      setError('No user returned from signup')
      setLoading(false)
      return
    }

    // Trigger handles the public.users insert automatically
    // Just redirect based on role
    if (form.role === 'landlord') router.push('/landlord')
    else if (form.role === 'renter') router.push('/renter')
    else if (form.role === 'contractor') router.push('/contractor')

    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-[#0C1A2E] flex items-center justify-center px-4">
      <div className="w-full max-w-md">

        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white">Create your account</h1>
          <p className="text-white/50 text-sm mt-1">Your property, handled.</p>
        </div>

        <form onSubmit={handleSignup} className="space-y-4">

          <div>
            <label className="text-white/70 text-sm block mb-1">Full name</label>
            <input
              type="text"
              name="full_name"
              required
              value={form.full_name}
              onChange={handleChange}
              placeholder="Nevin Jaison"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-[#12A5A9] transition"
            />
          </div>

          <div>
            <label className="text-white/70 text-sm block mb-1">Email</label>
            <input
              type="email"
              name="email"
              required
              value={form.email}
              onChange={handleChange}
              placeholder="you@email.com"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-[#12A5A9] transition"
            />
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
            <label className="text-white/70 text-sm block mb-1">Password</label>
            <input
              type="password"
              name="password"
              required
              value={form.password}
              onChange={handleChange}
              placeholder="Min. 8 characters"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-[#12A5A9] transition"
            />
          </div>

          <div>
            <label className="text-white/70 text-sm block mb-1">I am a...</label>
            <select
              name="role"
              required
              value={form.role}
              onChange={handleChange}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#12A5A9] transition"
            >
              <option value="" disabled className="bg-[#0C1A2E]">Select your role</option>
              <option value="landlord" className="bg-[#0C1A2E]">Landlord</option>
              <option value="renter" className="bg-[#0C1A2E]">Renter</option>
              <option value="contractor" className="bg-[#0C1A2E]">Contractor</option>
            </select>
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

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white font-semibold py-3 rounded-xl transition hover:opacity-90 disabled:opacity-50 mt-2"
          >
            {loading ? 'Creating account...' : 'Create account'}
          </button>

          <p className="text-center text-white/40 text-sm">
            Already have an account?{' '}
            <Link href="/login" className="text-[#12A5A9] hover:underline">
              Sign in
            </Link>
          </p>

        </form>
      </div>
    </div>
  )
}