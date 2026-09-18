'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

// The original fixed set, minus "Other" — "Other" is appended separately
// by callers since it's a UI action (opens a text field), not a real
// category value to ever store on a job or a contractor's service list.
export const FIXED_CATEGORIES = [
  'Plumbing', 'Electrical', 'HVAC', 'Appliance',
  'Structural', 'Pest', 'Turnover',
]

// Anyone (renter reporting an issue, landlord creating a job, contractor
// setting up their service categories) who types a category under "Other"
// gets it saved here so it becomes a real, selectable option for
// everyone else from then on — the category list grows with real usage
// instead of "Other" being a dead end.
export function useCategoryOptions(): [string[], (name: string) => void] {
  const [customCategories, setCustomCategories] = useState<string[]>([])

  useEffect(() => {
    supabase
      .from('custom_categories')
      .select('name')
      .order('name')
      .then(({ data, error }) => {
        if (error) {
          console.error('useCategoryOptions: could not load custom categories', error)
          return
        }
        setCustomCategories((data || []).map((row) => row.name))
      })
  }, [])

  // Called right after saveCustomCategory resolves, so a category typed
  // under "Other" shows up as its own real option immediately — without
  // this, the caller would have to wait for a full page reload to see it
  // reflected back (the table write already happened, this just updates
  // what's rendered on this page).
  const addLocalCategory = (name: string) => {
    setCustomCategories((prev) => (prev.includes(name) ? prev : [...prev, name].sort()))
  }

  return [[...FIXED_CATEGORIES, ...customCategories], addLocalCategory]
}

// Saves a new custom category (case-insensitive de-duped by the table's
// unique constraint) and returns the canonical name to actually store on
// the job/service-list — trims whitespace, title-cases nothing (kept
// exactly as typed so e.g. "HVAC-adjacent" stays intentional).
export async function saveCustomCategory(name: string, userId: string | null): Promise<string> {
  const trimmed = name.trim()
  if (!trimmed) return trimmed

  const { error } = await supabase
    .from('custom_categories')
    .upsert({ name: trimmed, created_by: userId }, { onConflict: 'name', ignoreDuplicates: true })

  if (error) {
    console.error('saveCustomCategory: could not save', error)
  }

  return trimmed
}
