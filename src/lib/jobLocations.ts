// Which room/area in the unit, as a separate dimension from category (what
// kind of issue) — added after a side-by-side comparison with a
// competitor's maintenance-request form showed this as a second, distinct
// field their form asks for that this app's report form didn't have at
// all. Optional: a renter who doesn't know the exact room name, or whose
// issue isn't room-specific (e.g. "No Heat"), shouldn't be blocked by it —
// the free-text description already covers anything this list can't name.
// Flat, not grouped — short enough (16 items) not to need it the way the
// 50+ item category list does.
export const LOCATION_OPTIONS = [
  'Living Room',
  'Kitchen',
  'Dining Room',
  'Master Bedroom',
  'Master Bathroom',
  'Guest Bedroom',
  'Guest Bathroom',
  'Hall',
  'Hall Closet',
  'Entry Way',
  'Laundry Room',
  'Patio or Balcony',
  'Garage',
  'Basement',
  'Common Area',
  'Whole Unit or Not Sure',
]
