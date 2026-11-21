// A PM's public profile look: one of a few curated gradient styles, or a
// style generated from their own logo's color. Stored in
// pm_organizations.brand_color as the style key or a strict #RRGGBB, and
// only ever rendered from these resolved values, never raw input.

export const PROFILE_STYLE_KEYS = ['aurora', 'glacier', 'ember', 'orchid', 'verdant', 'graphite'] as const
export type ProfileStyleKey = (typeof PROFILE_STYLE_KEYS)[number]

export const PROFILE_STYLES: Record<ProfileStyleKey, { name: string; stops: [string, string, string]; accent: string }> = {
  aurora: { name: 'Aurora', stops: ['#12A5A9', '#6366F1', '#22D3EE'], accent: '#0E9AA0' },
  glacier: { name: 'Glacier', stops: ['#38BDF8', '#818CF8', '#A5F3FC'], accent: '#2F7FE0' },
  ember: { name: 'Ember', stops: ['#F97316', '#E11D48', '#FBBF24'], accent: '#E2541B' },
  orchid: { name: 'Orchid', stops: ['#A855F7', '#EC4899', '#6366F1'], accent: '#9146E8' },
  verdant: { name: 'Verdant', stops: ['#10B981', '#84CC16', '#06B6D4'], accent: '#0C9A6B' },
  graphite: { name: 'Graphite', stops: ['#475569', '#1E293B', '#94A3B8'], accent: '#3B4A5E' },
}

export const PROFILE_STYLE_PATTERN = /^(aurora|glacier|ember|orchid|verdant|graphite|#[0-9a-fA-F]{6})$/

export function isValidProfileStyle(v: unknown): v is string {
  return typeof v === 'string' && PROFILE_STYLE_PATTERN.test(v)
}

function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l * 100]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  h *= 60
  return [h, s * 100, l * 100]
}

function hsl(h: number, s: number, l: number) {
  return `hsl(${Math.round(((h % 360) + 360) % 360)} ${Math.round(s)}% ${Math.round(l)}%)`
}

export type ResolvedProfileStyle = { stops: [string, string, string]; accent: string; gradient: string }

// Turns the stored value into the colors the page uses. A logo color gets
// two neighbouring hues so it still reads as a modern gradient, not a flat
// fill. Unknown or empty values fall back to Aurora.
export function resolveProfileStyle(value: string | null | undefined): ResolvedProfileStyle {
  let stops: [string, string, string]
  let accent: string
  if (value && /^#[0-9a-fA-F]{6}$/.test(value)) {
    const [h, s, l] = hexToHsl(value)
    // One hue, three depths: reads as a considered brand, not a rainbow.
    const sat = Math.max(45, Math.min(85, s))
    const light = Math.max(38, Math.min(56, l))
    stops = [hsl(h, sat, light), hsl(h + 12, sat - 8, Math.max(18, light - 16)), hsl(h - 8, sat, Math.min(68, light + 10))]
    accent = hsl(h, sat, Math.min(light, 46))
  } else {
    const style = PROFILE_STYLES[(value as ProfileStyleKey) || 'aurora'] || PROFILE_STYLES.aurora
    stops = style.stops
    accent = style.accent
  }
  return { stops, accent, gradient: `linear-gradient(135deg, ${stops[0]}, ${stops[1]})` }
}

// The most prominent saturated color in an image, as #RRGGBB, for "Match my
// logo". Browser only; null when the image can't be read.
export async function dominantColorFromImage(url: string): Promise<string | null> {
  try {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.src = url
    await img.decode()
    const size = 48
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(img, 0, 0, size, size)
    const { data } = ctx.getImageData(0, 0, size, size)
    const buckets = new Map<number, { r: number; g: number; b: number; n: number; w: number }>()
    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]]
      if (a < 128) continue
      const max = Math.max(r, g, b)
      const min = Math.min(r, g, b)
      const sat = max === 0 ? 0 : (max - min) / max
      if (sat < 0.25 || max < 40 || min > 235) continue
      const key = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5)
      const bucket = buckets.get(key) || { r: 0, g: 0, b: 0, n: 0, w: 0 }
      bucket.r += r
      bucket.g += g
      bucket.b += b
      bucket.n += 1
      bucket.w += sat
      buckets.set(key, bucket)
    }
    let best: { r: number; g: number; b: number; n: number; w: number } | null = null
    for (const bucket of buckets.values()) if (!best || bucket.w > best.w) best = bucket
    if (!best) return null
    const hex = (v: number) => Math.round(v / best!.n).toString(16).padStart(2, '0')
    return `#${hex(best.r)}${hex(best.g)}${hex(best.b)}`.toUpperCase()
  } catch {
    return null
  }
}

// The brand colors offered in the profile editor: solid, well-tested on both
// dark and light grounds. Stored as #RRGGBB like any custom color.
export const BRAND_COLORS: { name: string; hex: string }[] = [
  { name: 'Teal', hex: '#0E9AA0' },
  { name: 'Ocean', hex: '#2563EB' },
  { name: 'Indigo', hex: '#4F46E5' },
  { name: 'Plum', hex: '#7C3AED' },
  { name: 'Rose', hex: '#E11D48' },
  { name: 'Ember', hex: '#EA580C' },
  { name: 'Gold', hex: '#CA8A04' },
  { name: 'Forest', hex: '#15803D' },
  { name: 'Slate', hex: '#475569' },
  { name: 'Ink', hex: '#1E293B' },
]
