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
export const CATEGORY_GROUPS: { label: string; categories: string[] }[] = [
  {
    label: 'Plumbing',
    categories: ['Leaky Faucet or Pipe', 'Clogged Drain or Toilet', 'Running or Broken Toilet', 'No Hot Water', 'Water Heater', 'Low Water Pressure', 'Garbage Disposal', 'Sump Pump'],
  },
  {
    label: 'Electrical',
    categories: ['Outlet or Switch', 'Light Fixture', 'Circuit Breaker or Power Outage', 'Ceiling Fan', 'Smoke or CO Detector'],
  },
  {
    label: 'Heating & Cooling',
    categories: ['No Heat', 'No A/C', 'Thermostat', 'Air Filter or Ventilation', 'HVAC Noise or Smell'],
  },
  {
    label: 'Appliances',
    categories: ['Refrigerator', 'Oven or Stove', 'Dishwasher', 'Washer or Dryer', 'Microwave'],
  },
  {
    label: 'Structural & Carpentry',
    categories: ['Drywall or Wall Damage', 'Ceiling', 'Cabinet or Countertop', 'Flooring', 'Foundation or Structural'],
  },
  {
    label: 'Doors, Windows & Locks',
    categories: ['Door Won’t Open or Close', 'Lock or Deadbolt', 'Window Won’t Open or Close', 'Window Screen', 'Garage Door'],
  },
  {
    label: 'Exterior & Grounds',
    categories: ['Roof or Gutter Leak', 'Siding', 'Deck or Patio', 'Fence', 'Landscaping or Lawn', 'Snow or Ice Removal'],
  },
  {
    label: 'Pest & Safety',
    categories: ['Pest or Rodent Control', 'Mold or Mildew', 'Water Damage or Leak'],
  },
  {
    label: 'Painting',
    categories: ['Interior Painting', 'Exterior Painting'],
  },
  {
    label: 'Cleaning & Turnover',
    categories: ['Move-Out Cleaning', 'Turnover or Make-Ready'],
  },
  {
    label: 'General',
    categories: ['General Handyman', 'Something Else'],
  },
]

export const FIXED_CATEGORIES = CATEGORY_GROUPS.flatMap((g) => g.categories)

// A reported job's category used to double as a unit's tracked-system
// item_type (plumbing/electrical/hvac/appliance/structural/other, see
// systems/page.tsx's own separate ITEM_TYPES) by direct string equality —
// worked only because the old category list happened to literally be those
// same six words. Splitting "Appliance" into five specific entries (etc.)
// broke that coincidence, so this maps each specific category back to the
// item_type bucket it belongs to, for "is there a tracked system for this
// job's category" lookups (see renter/report/page.tsx).
export const CATEGORY_TO_ITEM_TYPE: Record<string, string> = Object.fromEntries([
  ...CATEGORY_GROUPS[0].categories.map((c) => [c, 'plumbing']),
  ...CATEGORY_GROUPS[1].categories.map((c) => [c, 'electrical']),
  ...CATEGORY_GROUPS[2].categories.map((c) => [c, 'hvac']),
  ...CATEGORY_GROUPS[3].categories.map((c) => [c, 'appliance']),
  ...CATEGORY_GROUPS[4].categories.map((c) => [c, 'structural']),
])

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
