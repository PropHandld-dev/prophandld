'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useLanguage, t } from '@/lib/i18n'
import { BellIcon } from '@/components/icons'

// Optional, per-viewer expiry reminder on a document — only shown for a
// document that actually has an expiry_date set. Each viewer (landlord,
// tenant) manages their own preference independently; see
// scripts/2026-10-15-document-reminders.sql for why this is a separate
// per-user row rather than a single setting on the document itself.
export function DocumentReminderToggle({ documentId, userId }: { documentId: string; userId: string }) {
  const lang = useLanguage()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [existing, setExisting] = useState<any>(null)
  const [days, setDays] = useState('30')
  const [channels, setChannels] = useState<string[]>(['email', 'push'])

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('document_reminders')
        .select('*')
        .eq('document_id', documentId)
        .eq('user_id', userId)
        .maybeSingle()
      if (data) {
        setExisting(data)
        setDays(data.reminder_days?.toString() || '30')
        setChannels(data.reminder_channels || ['email', 'push'])
      }
      setLoading(false)
    }
    load()
  }, [documentId, userId])

  const toggleChannel = (channel: string) => {
    setChannels((c) => (c.includes(channel) ? c.filter((x) => x !== channel) : [...c, channel]))
  }

  const handleSave = async () => {
    setSaving(true)
    const { data, error } = await supabase
      .from('document_reminders')
      .upsert(
        { document_id: documentId, user_id: userId, reminder_days: parseInt(days) || 30, reminder_channels: channels, last_reminder_status: null },
        { onConflict: 'document_id,user_id' }
      )
      .select()
      .single()
    if (!error && data) setExisting(data)
    setSaving(false)
    setOpen(false)
  }

  const handleRemove = async () => {
    setSaving(true)
    await supabase.from('document_reminders').delete().eq('document_id', documentId).eq('user_id', userId)
    setExisting(null)
    setSaving(false)
    setOpen(false)
  }

  if (loading) return null

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1 text-xs font-medium transition ${existing ? 'text-[#12A5A9]' : 'text-white/40 hover:text-white/70'}`}
      >
        <BellIcon className="w-3.5 h-3.5" />
        {existing ? t('reminderOnLabel', lang) : t('remindMeLabel', lang)}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 z-10 bg-[#0F2138] border border-white/10 rounded-xl p-3 w-56 shadow-lg">
          <label className="text-white/70 text-xs block mb-1">{t('remindMeDaysBeforeLabel', lang)}</label>
          <input
            type="number"
            min={0}
            value={days}
            onChange={(e) => setDays(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-white text-sm mb-2 focus:outline-none focus:border-[#12A5A9] transition"
          />
          <label className="text-white/70 text-xs block mb-1">{t('remindMeViaLabel', lang)}</label>
          <div className="flex gap-2.5 mb-3">
            {(['email', 'push', 'sms'] as const).map((channel) => (
              <label key={channel} className="flex items-center gap-1 text-white/70 text-xs">
                <input type="checkbox" checked={channels.includes(channel)} onChange={() => toggleChannel(channel)} className="accent-[#12A5A9]" />
                {channel === 'email' ? t('emailLabel', lang) : channel === 'push' ? t('pushLabel', lang) : t('smsLabel', lang)}
              </label>
            ))}
          </div>
          <div className="flex items-center justify-between gap-2">
            <button type="button" onClick={handleSave} disabled={saving} className="text-[#12A5A9] text-xs font-semibold hover:underline disabled:opacity-50">
              {t('save', lang)}
            </button>
            {existing && (
              <button type="button" onClick={handleRemove} disabled={saving} className="text-red-400 text-xs hover:underline disabled:opacity-50">
                {t('remove', lang)}
              </button>
            )}
            <button type="button" onClick={() => setOpen(false)} className="text-white/50 text-xs hover:text-white transition">
              {t('cancel', lang)}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
