'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { BottomTabBar } from '@/components/BottomTabBar'
import { Skeleton } from '@/components/Skeleton'
import { LANDLORD_TABS } from '@/lib/navTabs'

const ITEM_TYPES = [
  { value: 'plumbing', label: 'Plumbing' },
  { value: 'electrical', label: 'Electrical' },
  { value: 'hvac', label: 'HVAC' },
  { value: 'appliance', label: 'Appliance' },
  { value: 'structural', label: 'Structural' },
  { value: 'other', label: 'Other' },
]

const STATUSES = [
  { value: 'good', label: 'Good' },
  { value: 'verify', label: 'Verify' },
  { value: 'service_due', label: 'Service Due' },
]

const STATUS_STYLES: Record<string, string> = {
  good: 'bg-[#12A5A9]/15 text-[#12A5A9]',
  verify: 'bg-yellow-500/15 text-yellow-400',
  service_due: 'bg-red-500/15 text-red-400',
}

const statusLabel = (value: string) => STATUSES.find((s) => s.value === value)?.label || value
const itemTypeLabel = (value: string) => ITEM_TYPES.find((t) => t.value === value)?.label || value

export default function UnitSystemsPage() {
  const router = useRouter()
  const params = useParams()
  const propertyId = params.id as string
  const unitId = params.unitId as string

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [unit, setUnit] = useState<any>(null)
  const [items, setItems] = useState<any[]>([])
  const [logs, setLogs] = useState<any[]>([])
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({
    name: '',
    item_type: '',
    brand: '',
    model: '',
    install_date: '',
    replacement_cost: '',
    status: 'good',
  })

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [addingLogForId, setAddingLogForId] = useState<string | null>(null)
  const [logForm, setLogForm] = useState({ service_date: '', description: '', cost: '' })
  const [now] = useState(() => Date.now())

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      const { data: unitData } = await supabase
        .from('units')
        .select('*')
        .eq('id', unitId)
        .maybeSingle()

      if (!unitData) {
        router.push(`/landlord/properties/${propertyId}`)
        return
      }
      setUnit(unitData)

      await loadItems()
      setLoading(false)
    }
    init()
  }, [unitId, propertyId, router])

  const loadItems = async () => {
    const { data: itemsData, error: itemsError } = await supabase
      .from('maintenance_items')
      .select('*')
      .eq('unit_id', unitId)
      .order('created_at', { ascending: false })

    if (itemsError) {
      console.error('Error loading systems:', itemsError)
      return
    }
    const itemsList = itemsData || []
    setItems(itemsList)

    const itemIds = itemsList.map((i) => i.id)
    if (itemIds.length === 0) {
      setLogs([])
      return
    }

    const { data: logsData, error: logsError } = await supabase
      .from('appliance_service_log')
      .select('*')
      .in('appliance_id', itemIds)
      .order('service_date', { ascending: false })

    if (logsError) {
      console.error('Error loading service log:', logsError)
      return
    }
    setLogs(logsData || [])
  }

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!form.name.trim()) {
      setError('Please enter a name.')
      return
    }

    setSaving(true)
    setError(null)

    const { error: insertError } = await supabase
      .from('maintenance_items')
      .insert({
        unit_id: unitId,
        name: form.name.trim(),
        item_type: form.item_type || null,
        brand: form.brand.trim() || null,
        model: form.model.trim() || null,
        install_date: form.install_date || null,
        replacement_cost: form.replacement_cost ? parseFloat(form.replacement_cost) : null,
        status: form.status,
      })

    if (insertError) {
      console.error('Error adding system:', insertError)
      setError('Could not add item. Please try again.')
      setSaving(false)
      return
    }

    setForm({ name: '', item_type: '', brand: '', model: '', install_date: '', replacement_cost: '', status: 'good' })
    await loadItems()
    setSaving(false)
  }

  const updateStatus = async (itemId: string, status: string) => {
    const { error: updateError } = await supabase
      .from('maintenance_items')
      .update({ status })
      .eq('id', itemId)

    if (updateError) {
      console.error('Error updating status:', updateError)
      setError('Could not update status.')
      return
    }

    setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, status } : i)))
  }

  const handleDeleteItem = async (item: any) => {
    if (!window.confirm(`Remove "${item.name}"? This also deletes its service history.`)) return

    const { error: logDeleteError } = await supabase
      .from('appliance_service_log')
      .delete()
      .eq('appliance_id', item.id)

    if (logDeleteError) {
      console.error('Error deleting service log:', logDeleteError)
    }

    const { error: deleteError } = await supabase.from('maintenance_items').delete().eq('id', item.id)
    if (deleteError) {
      console.error('Error deleting system:', deleteError)
      setError('Could not delete item.')
      return
    }

    setItems((prev) => prev.filter((i) => i.id !== item.id))
    setLogs((prev) => prev.filter((l) => l.appliance_id !== item.id))
  }

  const toggleExpanded = (itemId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(itemId)) next.delete(itemId)
      else next.add(itemId)
      return next
    })
  }

  const startAddingLog = (itemId: string) => {
    setAddingLogForId(itemId)
    setLogForm({ service_date: '', description: '', cost: '' })
    setError(null)
  }

  const cancelAddingLog = () => {
    setAddingLogForId(null)
    setLogForm({ service_date: '', description: '', cost: '' })
  }

  const handleLogChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLogForm({ ...logForm, [e.target.name]: e.target.value })
  }

  const submitLog = async (itemId: string) => {
    if (!logForm.service_date) {
      setError('Please pick a service date.')
      return
    }

    const { error: insertError } = await supabase
      .from('appliance_service_log')
      .insert({
        appliance_id: itemId,
        service_date: logForm.service_date,
        description: logForm.description.trim() || null,
        cost: logForm.cost ? parseFloat(logForm.cost) : null,
      })

    if (insertError) {
      console.error('Error adding service log entry:', insertError)
      setError('Could not add service entry.')
      return
    }

    setAddingLogForId(null)
    setLogForm({ service_date: '', description: '', cost: '' })
    await loadItems()
  }

  const deleteLog = async (logId: string, applianceId: string) => {
    const { error: deleteError } = await supabase.from('appliance_service_log').delete().eq('id', logId)
    if (deleteError) {
      console.error('Error deleting service log entry:', deleteError)
      setError('Could not delete entry.')
      return
    }
    setLogs((prev) => prev.filter((l) => l.id !== logId))
    void applianceId
  }

  const getAge = (installDate: string | null) => {
    if (!installDate) return null
    const years = (now - new Date(installDate + 'T00:00:00').getTime()) / (365.25 * 24 * 60 * 60 * 1000)
    const rounded = Math.floor(years)
    return rounded < 1 ? 'Less than a year old' : `${rounded} year${rounded > 1 ? 's' : ''} old`
  }

  const getTotalSpent = (itemId: string) =>
    logs.filter((l) => l.appliance_id === itemId).reduce((sum, l) => sum + (l.cost || 0), 0)

  return (
    <div className="min-h-screen bg-[#0C1A2E]">
      <nav className="border-b border-white/8 px-6 py-4 flex items-center justify-between">
        <Link
          href={`/landlord/properties/${propertyId}/units/${unitId}`}
          className="text-white/50 hover:text-white text-sm transition"
        >
          ← Unit
        </Link>
        <span className="text-white font-semibold text-sm">Prophandld</span>
        <div className="w-20" />
      </nav>

      <main className="max-w-2xl mx-auto px-6 py-10 pb-28">
        {loading ? (
          <div className="space-y-4">
            <div className="mb-8">
              <Skeleton className="h-7 w-56 mb-2" />
              <Skeleton className="h-4 w-32" />
            </div>
            <Skeleton className="h-72 mb-6" />
            <Skeleton className="h-5 w-32 mb-4" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
        ) : !unit ? null : (
        <>
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">Systems & Appliances</h1>
          <p className="text-white/50 text-sm mt-1">Unit {unit.unit_number}</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white/3 border border-white/8 rounded-2xl p-6 mb-6 space-y-4">
          <h2 className="text-white font-semibold mb-2">Add a system</h2>

          <div>
            <label className="text-white/70 text-sm block mb-1">Name</label>
            <input
              type="text"
              name="name"
              required
              value={form.name}
              onChange={handleChange}
              placeholder="Water heater"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-[#12A5A9] transition"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-white/70 text-sm block mb-1">Category</label>
              <select
                name="item_type"
                value={form.item_type}
                onChange={handleChange}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#12A5A9] transition"
              >
                <option value="" className="bg-[#0C1A2E]">Select a category</option>
                {ITEM_TYPES.map((type) => (
                  <option key={type.value} value={type.value} className="bg-[#0C1A2E]">{type.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-white/70 text-sm block mb-1">Status</label>
              <select
                name="status"
                value={form.status}
                onChange={handleChange}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#12A5A9] transition"
              >
                {STATUSES.map((s) => (
                  <option key={s.value} value={s.value} className="bg-[#0C1A2E]">{s.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-white/70 text-sm block mb-1">Brand</label>
              <input
                type="text"
                name="brand"
                value={form.brand}
                onChange={handleChange}
                placeholder="Whirlpool"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-[#12A5A9] transition"
              />
            </div>
            <div>
              <label className="text-white/70 text-sm block mb-1">Model</label>
              <input
                type="text"
                name="model"
                value={form.model}
                onChange={handleChange}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-[#12A5A9] transition"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-white/70 text-sm block mb-1">Install date</label>
              <input
                type="date"
                name="install_date"
                value={form.install_date}
                onChange={handleChange}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#12A5A9] transition"
              />
            </div>
            <div>
              <label className="text-white/70 text-sm block mb-1">Replacement cost</label>
              <input
                type="number"
                name="replacement_cost"
                value={form.replacement_cost}
                onChange={handleChange}
                min={0}
                placeholder="1200"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-[#12A5A9] transition"
              />
            </div>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white font-semibold py-3 rounded-xl transition hover:opacity-90 disabled:opacity-50"
          >
            {saving ? 'Adding...' : 'Add system'}
          </button>
        </form>

        <h2 className="text-white font-semibold mb-4">
          All systems {items.length > 0 && `(${items.length})`}
        </h2>

        {items.length === 0 ? (
          <div className="bg-white/3 border border-white/8 rounded-2xl p-8 text-center">
            <p className="text-white/30 text-sm">No systems tracked yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => {
              const itemLogs = logs.filter((l) => l.appliance_id === item.id)
              const isExpanded = expandedIds.has(item.id)
              const age = getAge(item.install_date)
              return (
                <div key={item.id} className="bg-white/3 border border-white/8 rounded-2xl p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h3 className="text-white font-semibold truncate">{item.name}</h3>
                      <div className="flex items-center gap-2 flex-wrap mt-2">
                        {item.item_type && (
                          <span className="text-xs bg-white/8 text-white/50 rounded-full px-2.5 py-0.5">
                            {itemTypeLabel(item.item_type)}
                          </span>
                        )}
                        <span className={`text-xs rounded-full px-2.5 py-0.5 ${STATUS_STYLES[item.status] || 'bg-white/8 text-white/50'}`}>
                          {statusLabel(item.status || 'good')}
                        </span>
                      </div>
                      {(item.brand || item.model) && (
                        <p className="text-white/40 text-xs mt-2">
                          {[item.brand, item.model].filter(Boolean).join(' · ')}
                        </p>
                      )}
                      <div className="flex items-center gap-3 flex-wrap mt-1">
                        {age && <p className="text-white/30 text-xs">{age}</p>}
                        {item.replacement_cost != null && (
                          <p className="text-white/30 text-xs">Replace: ${item.replacement_cost}</p>
                        )}
                        {itemLogs.length > 0 && (
                          <p className="text-white/30 text-xs">Spent to date: ${getTotalSpent(item.id).toFixed(2)}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <select
                        value={item.status || 'good'}
                        onChange={(e) => updateStatus(item.id, e.target.value)}
                        className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-white text-xs focus:outline-none focus:border-[#12A5A9] transition"
                      >
                        {STATUSES.map((s) => (
                          <option key={s.value} value={s.value} className="bg-[#0C1A2E]">{s.label}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => handleDeleteItem(item)}
                        className="text-red-400/70 text-xs hover:text-red-400 transition"
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  <button
                    onClick={() => toggleExpanded(item.id)}
                    className="text-[#12A5A9] text-xs font-semibold hover:underline mt-4"
                  >
                    {isExpanded ? 'Hide service history' : `Service history (${itemLogs.length})`}
                  </button>

                  {isExpanded && (
                    <div className="mt-3 border-t border-white/8 pt-3 space-y-2">
                      {itemLogs.length === 0 && addingLogForId !== item.id && (
                        <p className="text-white/30 text-xs">No service history yet.</p>
                      )}
                      {itemLogs.map((log) => (
                        <div key={log.id} className="flex items-start justify-between bg-white/5 rounded-lg px-3 py-2">
                          <div>
                            <p className="text-white/70 text-xs">
                              {new Date(log.service_date + 'T00:00:00').toLocaleDateString()}
                              {log.cost != null && ` · $${log.cost}`}
                            </p>
                            {log.description && <p className="text-white/40 text-xs mt-0.5">{log.description}</p>}
                          </div>
                          <button
                            onClick={() => deleteLog(log.id, item.id)}
                            className="text-red-400/70 text-xs hover:text-red-400 transition shrink-0 ml-3"
                          >
                            Delete
                          </button>
                        </div>
                      ))}

                      {addingLogForId === item.id ? (
                        <div className="bg-white/5 rounded-lg p-3 space-y-2">
                          <input
                            type="date"
                            name="service_date"
                            value={logForm.service_date}
                            onChange={handleLogChange}
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-[#12A5A9] transition"
                          />
                          <input
                            type="text"
                            name="description"
                            value={logForm.description}
                            onChange={handleLogChange}
                            placeholder="What was done"
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-xs placeholder-white/30 focus:outline-none focus:border-[#12A5A9] transition"
                          />
                          <input
                            type="number"
                            name="cost"
                            value={logForm.cost}
                            onChange={handleLogChange}
                            min={0}
                            placeholder="Cost"
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-xs placeholder-white/30 focus:outline-none focus:border-[#12A5A9] transition"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => submitLog(item.id)}
                              className="flex-1 bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-xs font-semibold py-2 rounded-lg hover:opacity-90 transition"
                            >
                              Save
                            </button>
                            <button
                              onClick={cancelAddingLog}
                              className="text-white/50 hover:text-white text-xs px-3 transition"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => startAddingLog(item.id)}
                          className="text-[#12A5A9] text-xs font-semibold hover:underline"
                        >
                          + Add service entry
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
        </>
        )}
      </main>

      <BottomTabBar tabs={LANDLORD_TABS} />
    </div>
  )
}
