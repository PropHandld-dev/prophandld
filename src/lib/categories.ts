'use client'

// Comprehensive, grouped home-maintenance taxonomy — one list shared by
// renters reporting an issue, contractors picking what they service, and
// landlords creating a job directly. Replaced the original 7 broad buckets
// (Plumbing, Electrical, HVAC, Appliance, Structural, Pest, Turnover) after
// direct feedback that a comparable competitor's list ("Bozzuto") was
// comprehensive but unwieldy as one flat wall of options — the fix here is
// grouping (CATEGORY_GROUPS below), not staying shallow. Specific enough
// that "Other" shouldn't be needed for a real, common household issue —
// the last group's "Something else" is a normal list entry instead of a
// special free-text branch, since every report already has its own
// required description field for anything a category name can't capture.
//
// A contractor's existing service_categories or a job's stored category
// value is never rewritten by this list changing — both are plain text,
// matched by exact string, not a foreign key. Expanding "Appliance" into
// five specific entries means an already-active contractor who only ever
// selected the old broad "Appliance" keeps matching jobs already posted
// under that value, but won't automatically match a NEW job posted under
// one of the specific replacements until they revisit Settings and
// reselect — a one-time, expected transition cost, not a bug.
//
// The actual data/logic lives in categoryTaxonomy.ts (no 'use client'),
// specifically so a server route handler can import isNoTroubleshootCategory
// without pulling this whole client-bundle-marked module along with it —
// that exact mistake made /api/ai-assist/troubleshoot 500 in production
// while still typechecking and building cleanly locally. Re-exported here
// so every existing client-side import of this file keeps working.
export { CATEGORY_GROUPS, FIXED_CATEGORIES, CATEGORY_TO_ITEM_TYPE, isNoTroubleshootCategory } from '@/lib/categoryTaxonomy'
import { CATEGORY_GROUPS } from '@/lib/categoryTaxonomy'

// A short-lived "Previously added" trailing group (surfacing old
// custom_categories entries, from back when "Other" existed) shipped
// alongside the comprehensive list above and was removed the same day on
// direct feedback — the new list is comprehensive enough on its own, and
// showing ungroomed historical entries (some literal leftover security-
// test strings) back on the picker undercut exactly the "no Other needed"
// cleanup this whole taxonomy change was for. Grouped display only now —
// CATEGORY_GROUPS is already the complete, final list.
export function useGroupedCategoryOptions(): { label: string; categories: string[] }[] {
  return CATEGORY_GROUPS
}
