'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function LandlordDashboard() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    properties: 0,
    totalUnits: 0,
    occupiedUnits: 0,
    vacantUnits: 0,
    monthlyRentRoll: 0,
    needsApproval: 0,
    inProgress: 0,
    pendingBids: 0,
  })
  const [properties, setProperties] = useState<any[]>([])
  const [needsReview, setNeedsReview] = useState<any[]>([])

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }
      setUser(user)

      const { data: propertiesData } = await supabase
        .from('properties')
        .select('*')
        .eq('owner_user_id', user.id)
        .eq('archived', false)
        .order('created_at', { ascending: false })

      const propertyList = propertiesData || []

      if (propertyList.length === 0) {
        setStats({
          properties: 0,
          totalUnits: 0,
          occupiedUnits: 0,
          vacantUnits: 0,
          monthlyRentRoll: 0,
          needsApproval: 0,
          inProgress: 0,
          pendingBids: 0,
        })
        setProperties([])
        setNeedsReview([])
        setLoading(false)
        return
      }

      const propertyIds = propertyList.map((p) => p.id)

      const { data: unitsData } = await supabase
        .from('units')
        .select('*')
        .in('property_id', propertyIds)

      const unitList = unitsData || []
      const unitIds = unitList.map((u) => u.id)

      let tenancyList: any[] = []
      if (unitIds.length > 0) {
        const { data: tenanciesData } = await supabase
          .from('tenancies')
          .select('unit_id, rent_amount')
          .in('unit_id', unitIds)
          .eq('ended', false)

        tenancyList = tenanciesData || []
      }

      const occupiedUnitIds = new Set(tenancyList.map((t) => t.unit_id))
      const monthlyRentRoll = tenancyList.reduce((sum, t) => sum + (t.rent_amount || 0), 0)

      let needsApprovalCount = 0
      let inProgressCount = 0
      let biddingJobsWithBids: any[] = []

      if (unitIds.length > 0) {
        const { count: approvalCount } = await supabase
          .from('jobs')
          .select('*', { count: 'exact', head: true })
          .in('unit_id', unitIds)
          .eq('status', 'pending_approval')

        needsApprovalCount = approvalCount || 0

        const { count: progressCount } = await supabase
          .from('jobs')
          .select('*', { count: 'exact', head: true })
          .in('unit_id', unitIds)
          .in('status', ['approved', 'bidding', 'bid_selected', 'scheduled', 'in_progress'])

        inProgressCount = progressCount || 0

        // Find jobs currently in bidding status
        const { data: biddingJobs } = await supabase
          .from('jobs')
          .select('*, units(unit_number, properties(address, city))')
          .in('unit_id', unitIds)
          .eq('status', 'bidding')

        if (biddingJobs && biddingJobs.length > 0) {
          const jobIds = biddingJobs.map((j) => j.id)
          const { data: bidsData } = await supabase
            .from('bids')
            .select('job_id')
            .in('job_id', jobIds)

          const bidCounts = new Map<string, number>()
          ;(bidsData || []).forEach((b) => {
            bidCounts.set(b.job_id, (bidCounts.get(b.job_id) || 0) + 1)
          })

          biddingJobsWithBids = biddingJobs
            .map((job) => ({ ...job, bidCount: bidCounts.get(job.id) || 0 }))
            .filter((job) => job.bidCount > 0)
        }
      }

      const propertyBreakdown = propertyList.map((property) => {
        const propertyUnits = unitList.filter((u) => u.property_id === property.id)
        const propertyOccupied = propertyUnits.filter((u) => occupiedUnitIds.has(u.id)).length
        return {
          ...property,
          totalUnits: propertyUnits.length,
          occupiedUnits: propertyOccupied,
        }
      })

      setStats({
        properties: propertyList.length,
        totalUnits: unitList.length,
        occupiedUnits: occupiedUnitIds.size,
        vacantUnits: unitList.length - occupiedUnitIds.size,
        monthlyRentRoll,
        needsApproval: needsApprovalCount,
        inProgress: inProgressCount,
        pendingBids: biddingJobsWithBids.length,
      })
      setProperties(propertyBreakdown)
      setNeedsReview(biddingJobsWithBids)
      setLoading(false)
    }
    getUser()
  }, [router])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount)

  const occupancyRate = stats.totalUnits > 0
    ? Math.round((stats.occupiedUnits / stats.totalUnits) * 100)
    : 0

  if (loading) return (
    <div className="min-h-screen bg-[#0C1A2E] flex items-center justify-center">
      <div className="text-white/50">Loading...</div>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#0C1A2E]">
      <nav className="border-b border-white/8 px-6 py-4 flex items-center justify-between backdrop-blur-sm sticky top-0 bg-[#0C1A2E]/90 z-10">
        <div className="flex items-center gap-3">
          <svg width="34" height="34" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
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
          <span className="text-white font-semibold text-lg tracking-tight">Prophandld</span>
          <span className="text-xs bg-gradient-to-r from-[#0A7B7E]/20 to-[#12A5A9]/20 text-[#12A5A9] border border-[#12A5A9]/30 rounded-full px-2.5 py-1">
            Landlord
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-white/50 text-sm hidden sm:block">{user?.user_metadata?.full_name}</span>
          <Link href="/profile" className="text-white/40 hover:text-white text-sm transition">Profile</Link>
          <button onClick={handleSignOut} className="text-white/40 hover:text-white text-sm transition">Sign out</button>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-6 py-10">

        <div className="mb-10">
          <h1 className="text-3xl font-bold text-white tracking-tight">
            Welcome back, {user?.user_metadata?.full_name?.split(' ')[0]} 👋
          </h1>
          <p className="text-white/50 mt-2">Here's the state of your portfolio right now.</p>
        </div>

        {needsReview.length > 0 && (
          <div className="bg-gradient-to-r from-yellow-500/10 to-yellow-500/5 border border-yellow-500/30 rounded-2xl p-5 mb-6">
            <h3 className="text-yellow-400 font-semibold text-sm mb-3">
              🔔 {needsReview.length} job{needsReview.length > 1 ? 's' : ''} need{needsReview.length === 1 ? 's' : ''} your review
            </h3>
            <div className="space-y-2">
              {needsReview.map((job) => (
                <Link
                  key={job.id}
                  href={`/landlord/jobs/${job.id}`}
                  className="flex items-center justify-between bg-white/5 hover:bg-white/8 rounded-xl px-4 py-3 transition"
                >
                  <div>
                    <p className="text-white text-sm font-medium">{job.category}</p>
                    <p className="text-white/40 text-xs">
                      {job.units?.properties?.address}, {job.units?.properties?.city} · Unit {job.units?.unit_number}
                    </p>
                  </div>
                  <span className="text-xs bg-yellow-500/20 text-yellow-400 rounded-full px-3 py-1 font-semibold shrink-0">
                    {job.bidCount} bid{job.bidCount > 1 ? 's' : ''} →
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Link
            href="/landlord/properties"
            className="bg-white/3 border border-white/8 rounded-2xl p-5 hover:border-[#12A5A9]/30 hover:bg-white/5 transition group"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xl">🏠</span>
              <span className="text-white/20 group-hover:text-[#12A5A9]/60 transition text-sm">→</span>
            </div>
            <div className="text-3xl font-bold text-white">{stats.properties}</div>
            <div className="text-white/40 text-sm mt-1">Properties</div>
          </Link>

          <div className="bg-white/3 border border-white/8 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xl">🔑</span>
            </div>
            <div className="text-3xl font-bold text-white">{stats.totalUnits}</div>
            <div className="text-white/40 text-sm mt-1">Total units</div>
          </div>

          <div className="bg-white/3 border border-white/8 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xl">✅</span>
              <span className="text-[#12A5A9] text-xs font-semibold">{occupancyRate}%</span>
            </div>
            <div className="text-3xl font-bold text-white">{stats.occupiedUnits}</div>
            <div className="text-white/40 text-sm mt-1">Occupied · {stats.vacantUnits} vacant</div>
          </div>

          <div className="bg-gradient-to-br from-[#0A7B7E]/15 to-[#12A5A9]/5 border border-[#12A5A9]/20 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xl">💰</span>
            </div>
            <div className="text-3xl font-bold text-white">{formatCurrency(stats.monthlyRentRoll)}</div>
            <div className="text-white/40 text-sm mt-1">Monthly rent roll</div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-10">
          <Link href="/landlord/jobs?filter=needs_approval" className="bg-white/3 border border-white/8 rounded-2xl p-5 flex items-center gap-4 hover:border-[#12A5A9]/30 hover:bg-white/5 transition">
  <span className="text-2xl">⏳</span>
  <div>
    <div className="text-xl font-bold text-white">{stats.needsApproval}</div>
    <div className="text-white/40 text-xs">Needs approval</div>
  </div>
</Link>
<Link href="/landlord/jobs?filter=in_progress" className="bg-white/3 border border-white/8 rounded-2xl p-5 flex items-center gap-4 hover:border-[#12A5A9]/30 hover:bg-white/5 transition">
  <span className="text-2xl">🔧</span>
  <div>
    <div className="text-xl font-bold text-white">{stats.inProgress}</div>
    <div className="text-white/40 text-xs">In progress</div>
  </div>
</Link>
          <Link
            href={needsReview.length > 0 ? `/landlord/jobs/${needsReview[0].id}` : '/landlord/jobs'}
            className="bg-white/3 border border-white/8 rounded-2xl p-5 flex items-center gap-4 hover:border-[#12A5A9]/30 hover:bg-white/5 transition"
          >
            <span className="text-2xl">📋</span>
            <div>
              <div className="text-xl font-bold text-white">{stats.pendingBids}</div>
              <div className="text-white/40 text-xs">Bids to review</div>
            </div>
          </Link>
        </div>

        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-semibold text-lg">Your properties</h2>
          <Link href="/landlord/properties" className="text-[#12A5A9] text-sm hover:underline">
            View all
          </Link>
        </div>

        {properties.length === 0 ? (
          <div className="bg-white/3 border border-white/8 rounded-2xl p-10 text-center mb-10">
            <div className="text-4xl mb-3">🏠</div>
            <h3 className="text-white font-semibold mb-1">No properties yet</h3>
            <p className="text-white/40 text-sm mb-5">Add your first property to start building your portfolio.</p>
            <Link
              href="/landlord/properties/new"
              className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white font-semibold px-6 py-3 rounded-xl hover:opacity-90 transition inline-block"
            >
              Add property
            </Link>
          </div>
        ) : (
          <div className="grid gap-3 mb-10">
            {properties.map((property) => {
              const rate = property.totalUnits > 0
                ? Math.round((property.occupiedUnits / property.totalUnits) * 100)
                : 0
              return (
                <Link
                  key={property.id}
                  href={`/landlord/properties/${property.id}`}
                  className="bg-white/3 border border-white/8 rounded-2xl p-5 hover:border-[#12A5A9]/30 hover:bg-white/5 transition block"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-white font-semibold truncate">{property.address}</h3>
                      <p className="text-white/40 text-sm mt-0.5">{property.city}, {property.state}</p>
                    </div>
                    <div className="flex items-center gap-6 shrink-0">
                      <div className="text-right">
                        <div className="text-white text-sm font-medium">
                          {property.occupiedUnits}/{property.totalUnits} occupied
                        </div>
                        <div className="w-24 h-1.5 bg-white/10 rounded-full mt-1.5 overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] rounded-full transition-all"
                            style={{ width: `${rate}%` }}
                          />
                        </div>
                      </div>
                      <span className="text-white/20 text-lg">→</span>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}

        <h2 className="text-white font-semibold text-lg mb-4">Quick actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Link href="/landlord/properties" className="bg-white/3 border border-white/8 rounded-2xl p-6 hover:border-[#12A5A9]/30 hover:bg-white/5 transition block">
            <div className="text-xl mb-2">🏠</div>
            <h3 className="text-white font-semibold mb-1">Properties</h3>
            <p className="text-white/40 text-sm">Manage your properties and units</p>
          </Link>
          <Link href="/landlord/properties/new" className="bg-white/3 border border-white/8 rounded-2xl p-6 hover:border-[#12A5A9]/30 hover:bg-white/5 transition block">
            <div className="text-xl mb-2">➕</div>
            <h3 className="text-white font-semibold mb-1">Add a property</h3>
            <p className="text-white/40 text-sm">Start tracking a new address</p>
          </Link>
          <Link href="/landlord/jobs" className="bg-white/3 border border-white/8 rounded-2xl p-6 hover:border-[#12A5A9]/30 hover:bg-white/5 transition block">
            <div className="text-xl mb-2">🔧</div>
            <h3 className="text-white font-semibold mb-1">View jobs</h3>
            <p className="text-white/40 text-sm">See all maintenance requests</p>
          </Link>
          <div className="bg-white/3 border border-white/8 rounded-2xl p-6 opacity-50 cursor-not-allowed">
            <div className="text-xl mb-2">💳</div>
            <h3 className="text-white font-semibold mb-1">Payments</h3>
            <p className="text-white/40 text-sm">Coming soon</p>
          </div>
        </div>
      </main>
    </div>
  )
}