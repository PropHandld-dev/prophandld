'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function LandlordDashboard() {
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
          <svg width="32" height="32" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
            <polygon points="50,5 38,16 38,28 62,28 62,16" fill="white" opacity="0.95"/>
            <rect x="44" y="18" width="12" height="10" rx="0.5" fill="#0C1A2E"/>
            <line x1="38" y1="20" x2="18" y2="42" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
            <line x1="62" y1="20" x2="82" y2="42" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
            <circle cx="13" cy="48" r="11" fill="white"/>
            <text x="13" y="53" textAnchor="middle" fill="#0C1A2E" fontSize="11" fontFamily="Inter,sans-serif" fontWeight="800">$</text>
            <circle cx="84" cy="46" r="9" fill="none" stroke="white" strokeWidth="3"/>
            <circle cx="83.5" cy="45.5" r="5" fill="none" stroke="white" strokeWidth="2.5"/>
            <line x1="87" y1="49.5" x2="92" y2="55" stroke="white" strokeWidth="3" strokeLinecap="round"/>
            <circle cx="50" cy="44" r="8" fill="white"/>
            <path d="M34 56 Q42 51 50 51 Q58 51 66 56 L68 78 H32 Z" fill="white"/>
            <polygon points="50,53 48,60 50,62 52,60" fill="#0A7B7E"/>
            <path d="M36 59 Q26 54 20 50" stroke="white" strokeWidth="4" strokeLinecap="round" fill="none"/>
            <path d="M64 59 Q74 54 80 50" stroke="white" strokeWidth="4" strokeLinecap="round" fill="none"/>
            <rect x="38" y="78" width="9" height="18" rx="4" fill="white"/>
            <rect x="53" y="78" width="9" height="18" rx="4" fill="white"/>
          </svg>
          <span className="text-white font-semibold">Prophandld</span>
          <span className="text-xs bg-[#0A7B7E]/20 text-[#12A5A9] border border-[#12A5A9]/30 rounded-full px-2 py-0.5">Landlord</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-white/50 text-sm">{user?.user_metadata?.full_name}</span>
          <Link href="/profile" className="text-white/40 hover:text-white text-sm transition">Profile</Link>
          <button onClick={handleSignOut} className="text-white/40 hover:text-white text-sm transition">Sign out</button>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">
            Welcome, {user?.user_metadata?.full_name?.split(' ')[0]} 👋
          </h1>
          <p className="text-white/50 mt-1">Here's what's happening across your properties.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {[
            { label: 'Properties', value: '0', icon: '🏠' },
            { label: 'Open Jobs', value: '0', icon: '🔧' },
            { label: 'Pending Bids', value: '0', icon: '📋' },
          ].map((stat) => (
            <div key={stat.label} className="bg-white/3 border border-white/8 rounded-2xl p-6">
              <div className="text-2xl mb-2">{stat.icon}</div>
              <div className="text-3xl font-bold text-white">{stat.value}</div>
              <div className="text-white/50 text-sm mt-1">{stat.label}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white/3 border border-white/8 rounded-2xl p-6 hover:border-[#12A5A9]/30 transition cursor-pointer">
            <div className="text-xl mb-2">🏠</div>
            <h3 className="text-white font-semibold mb-1">Add a property</h3>
            <p className="text-white/40 text-sm">Add your first property and units</p>
          </div>
          <div className="bg-white/3 border border-white/8 rounded-2xl p-6 hover:border-[#12A5A9]/30 transition cursor-pointer">
            <div className="text-xl mb-2">👤</div>
            <h3 className="text-white font-semibold mb-1">Add a tenant</h3>
            <p className="text-white/40 text-sm">Link a renter to a unit</p>
          </div>
          <div className="bg-white/3 border border-white/8 rounded-2xl p-6 hover:border-[#12A5A9]/30 transition cursor-pointer">
            <div className="text-xl mb-2">🔧</div>
            <h3 className="text-white font-semibold mb-1">View jobs</h3>
            <p className="text-white/40 text-sm">See all maintenance requests</p>
          </div>
          <div className="bg-white/3 border border-white/8 rounded-2xl p-6 hover:border-[#12A5A9]/30 transition cursor-pointer">
            <div className="text-xl mb-2">💳</div>
            <h3 className="text-white font-semibold mb-1">Payments</h3>
            <p className="text-white/40 text-sm">View payment history</p>
          </div>
        </div>
      </main>
    </div>
  )
}