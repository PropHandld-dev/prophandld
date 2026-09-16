'use client'

import { useEffect, useState } from 'react'
import { AdminLayout } from '@/components/AdminLayout'
import { ScrollReveal } from '@/components/ScrollReveal'

export default function AdminUsersPage() {
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      const res = await fetch('/api/admin/users')
      const data = await res.json()
      if (!res.ok) {
        console.error('Error loading users:', data)
        setError(data.error || 'Could not load users.')
        setLoading(false)
        return
      }
      const sorted = (data.users || []).sort(
        (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
      setUsers(sorted)
      setLoading(false)
    }
    load()
  }, [])

  const filtered = users.filter((u) => {
    const matchesRole = roleFilter === 'all' || u.role === roleFilter
    const q = search.trim().toLowerCase()
    const matchesSearch = !q || u.full_name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q)
    return matchesRole && matchesSearch
  })

  return (
    <AdminLayout>
      <h1 className="text-2xl font-bold text-white mb-8">Users ({users.length})</h1>

      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name or email..."
          className="flex-1 min-w-[200px] bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-white/30 focus:outline-none focus:border-[#12A5A9] transition"
        />
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-[#12A5A9] transition"
        >
          <option value="all" className="bg-[#0C1A2E]">All roles</option>
          <option value="landlord" className="bg-[#0C1A2E]">Landlords</option>
          <option value="renter" className="bg-[#0C1A2E]">Renters</option>
          <option value="contractor" className="bg-[#0C1A2E]">Contractors</option>
        </select>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm mb-4">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-white/50 text-sm">Loading...</div>
      ) : (
        <ScrollReveal className="bg-white/3 border border-white/8 rounded-2xl overflow-hidden">
          {filtered.length === 0 ? (
            <p className="text-white/30 text-sm p-6">No users match.</p>
          ) : (
            filtered.map((u) => (
              <div key={u.id} className="flex items-center justify-between px-6 py-4 border-b border-white/5 last:border-0">
                <div className="min-w-0">
                  <p className="text-white text-sm font-medium truncate">{u.full_name || 'Unnamed'}</p>
                  <p className="text-white/40 text-xs truncate">{u.email}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs bg-white/8 text-white/60 rounded-full px-2.5 py-0.5 capitalize">{u.role || 'no role'}</span>
                  <span className="text-white/30 text-xs">{new Date(u.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            ))
          )}
        </ScrollReveal>
      )}
    </AdminLayout>
  )
}
