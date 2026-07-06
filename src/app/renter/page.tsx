'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function RenterDashboard() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [unit, setUnit] = useState<any>(null)
  const [property, setProperty] = useState<any>(null)
  const [contacts, setContacts] = useState<any[]>([])
  const [contactsLoading, setContactsLoading] = useState(true)
  const [jobs, setJobs] = useState<any[]>([])
  const [jobsLoading, setJobsLoading] = useState(true)

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }
      setUser(user)
      setLoading(false)

      const { data: tenancyData, error: tenancyError } = await supabase
        .from('tenancies')
        .select('*')
        .eq('renter_user_id', user.id)
        .eq('ended', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (tenancyError || !tenancyData) {
        setContactsLoading(false)
        setJobsLoading(false)
        return
      }

      const { data: unitData } = await supabase
        .from('units')
        .select('*')
        .eq('id', tenancyData.unit_id)
        .maybeSingle()

      if (!unitData) {
        setContactsLoading(false)
        setJobsLoading(false)
        return
      }
      setUnit(unitData)

      const { data: propertyData } = await supabase
        .from('properties')
        .select('*')
        .eq('id', unitData.property_id)
        .maybeSingle()

      if (propertyData) setProperty(propertyData)

      const { data: contactsData, error: contactsError } = await supabase
        .from('contacts')
        .select('*')
        .eq('property_id', unitData.property_id)
        .or(`unit_id.is.null,unit_id.eq.${unitData.id}`)
        .order('created_at', { ascending: false })

      if (contactsError) {
        console.error('Error loading contacts:', contactsError)
      } else {
        setContacts(contactsData || [])
      }
      setContactsLoading(false)

      const { data: jobsData, error: jobsError } = await supabase
        .from('jobs')
        .select('*')
        .eq('unit_id', unitData.id)
        .not('status', 'in', '(completed,archived,declined)')
        .order('created_at', { ascending: false })

      if (jobsError) {
        console.error('Error loading jobs:', jobsError)
      } else {
        setJobs(jobsData || [])
      }
      setJobsLoading(false)
    }
    getUser()
  }, [router])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const statusLabel = (status: string) => {
    const labels: Record<string, string> = {
      pending_approval: 'Waiting on landlord',
      approved: 'Approved',
      bidding: 'Getting quotes',
      bid_selected: 'Contractor selected',
      scheduled: 'Scheduled',
      in_progress: 'In progress',
    }
    return labels[status] || status
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
          <span className="text-xs bg-[#0A7B7E]/20 text-[#12A5A9] border border-[#12A5A9]/30 rounded-full px-2 py-0.5">Renter</span>
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
            Hi, {user?.user_metadata?.full_name?.split(' ')[0]} 👋
          </h1>
          <p className="text-white/50 mt-1">Track your maintenance requests here.</p>
        </div>

        {unit && property && (
          <div className="bg-white/3 border border-white/8 rounded-2xl p-6 mb-6">
            <h3 className="text-white font-semibold mb-1">Your home</h3>
            <p className="text-white/70 text-sm mt-2">{property.address}</p>
            <p className="text-white/50 text-sm">
              {property.city}, {property.state} {property.zip} · Unit {unit.unit_number}
            </p>
          </div>
        )}

        <div className="bg-gradient-to-r from-[#0A7B7E]/20 to-[#12A5A9]/10 border border-[#12A5A9]/30 rounded-2xl p-6 mb-6">
          <h3 className="text-white font-semibold mb-1">Report an issue</h3>
          <p className="text-white/50 text-sm mb-4">Something broken? Let your landlord know.</p>
          <Link
            href="/renter/report"
            className="inline-block bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white font-semibold px-6 py-2.5 rounded-xl text-sm hover:opacity-90 transition"
          >
            Report now
          </Link>
        </div>

        <div className="bg-white/3 border border-white/8 rounded-2xl p-6 mb-6">
          <h3 className="text-white font-semibold mb-4">Your issues</h3>

          {jobsLoading ? (
            <p className="text-white/30 text-sm">Loading...</p>
          ) : jobs.length === 0 ? (
            <p className="text-white/30 text-sm">No open issues — you're all good! ✅</p>
          ) : (
            <div className="space-y-3">
              {jobs.map((job) => (
                <div key={job.id} className="border-b border-white/5 last:border-0 pb-3 last:pb-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <p className="text-white font-medium">{job.category}</p>
                    {job.is_emergency && (
                      <span className="text-xs bg-red-500/20 text-red-400 border border-red-500/30 rounded-full px-2 py-0.5 font-semibold">
                        Emergency
                      </span>
                    )}
                  </div>
                  <p className="text-white/50 text-sm">{job.description}</p>
                  <p className="text-[#12A5A9] text-xs mt-1">{statusLabel(job.status)}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white/3 border border-white/8 rounded-2xl p-6">
          <h3 className="text-white font-semibold mb-4">Emergency contacts</h3>

          {contactsLoading ? (
            <p className="text-white/30 text-sm">Loading...</p>
          ) : !unit ? (
            <p className="text-white/30 text-sm">No unit linked to your account yet.</p>
          ) : contacts.length === 0 ? (
            <p className="text-white/30 text-sm">No emergency contacts added for your unit yet.</p>
          ) : (
            <div className="space-y-3">
              {contacts.map((contact) => (
                <div key={contact.id} className="border-b border-white/5 last:border-0 pb-3 last:pb-0">
                  <p className="text-white font-medium">{contact.name}</p>
                  {contact.role && <p className="text-white/50 text-sm">{contact.role}</p>}
                  {contact.phone && (
                    <a href={`tel:${contact.phone}`} className="text-[#12A5A9] text-sm hover:underline block mt-1">
                      📞 {contact.phone}
                    </a>
                  )}
                  {contact.email && (
                    <a href={`mailto:${contact.email}`} className="text-white/40 text-sm hover:underline block">
                      ✉️ {contact.email}
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}