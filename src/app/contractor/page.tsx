'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function ContractorDashboard() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }
      setUser(user)
      setLoading(false)
    }
    getUser()
  }, [router])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (loading) return (
    <div className="min-h-screen bg-[#0C1A2E] flex items-center justify-center">
      <div className="text-white/50">Loading...</div>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#0C1A2E]">
      <nav className="border-b border-white/8 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-white font-semibold">Prophandld</span>
          <span className="text-xs bg-[#0A7B7E]/20 text-[#12A5A9] border border-[#12A5A9]/30 rounded-full px-2 py-0.5">Contractor</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-white/50 text-sm">{user?.user_metadata?.full_name}</span>
          <Link href="/profile" className="text-white/40 hover:text-white text-sm transition">Profile</Link>
          <button onClick={handleSignOut} className="text-white/40 hover:text-white text-sm transition">Sign out</button>
        </div>
      </nav>

      <main className="max-w-2xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">
            Welcome, {user?.user_metadata?.full_name?.split(' ')[0]} 👋
          </h1>
          <p className="text-white/50 mt-1">Find jobs and manage your bids.</p>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: 'New Jobs', value: '0', icon: '🔔' },
            { label: 'Active', value: '0', icon: '🔧' },
            { label: 'Earnings', value: '$0', icon: '💰' },
          ].map((stat) => (
            <div key={stat.label} className="bg-white/3 border border-white/8 rounded-2xl p-4 text-center">
              <div className="text-xl mb-1">{stat.icon}</div>
              <div className="text-2xl font-bold text-white">{stat.value}</div>
              <div className="text-white/40 text-xs mt-1">{stat.label}</div>
            </div>
          ))}
        </div>

        <div className="bg-white/3 border border-white/8 rounded-2xl p-6">
          <h3 className="text-white font-semibold mb-4">Available jobs near you</h3>
          <p className="text-white/30 text-sm">No jobs available right now — check back soon.</p>
        </div>
      </main>
    </div>
  )
}