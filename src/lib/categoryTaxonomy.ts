// Pure data/logic half of the category taxonomy — no 'use client', no
// hooks — safe to import from both client components and server route
// handlers. Split out from categories.ts after isNoTroubleshootCategory
// being imported into src/app/api/ai-assist/troubleshoot/route.ts (a
// server-only Route Handler) from that 'use client'-marked file caused
// the route to 500 with an empty body in production, even though it
// typechecked and built cleanly locally — a 'use client' directive pulls
// its whole module into the client bundle graph, which a pure server
// route handler was never meant to be part of. categories.ts re-exports
// everything below for existing client-side imports, so nothing else
// needs to change.
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
    categories: ['Drywall or Wall Damage', 'Ceiling', 'Cabinet or Countertop', 'Flooring', 'Foundation or Structural', 'Fireplace', 'Hardware'],
  },
  {
    label: 'Doors, Windows & Locks',
    categories: ['Door Won’t Open or Close', 'Lock or Deadbolt', 'Window Won’t Open or Close', 'Window Screen', 'Garage Door', 'Blinds'],
  },
  {
    label: 'Exterior & Grounds',
    categories: ['Roof or Gutter Leak', 'Siding', 'Deck or Patio', 'Fence', 'Landscaping or Lawn', 'Snow or Ice Removal', 'Amenity (Pool, Gym, etc.)'],
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
    categories: ['Cleaning', 'Move-Out Cleaning', 'Move-In or Move-Out Inspection', 'Turnover or Make-Ready'],
  },
  {
    label: 'General',
    categories: ['Renovation', 'Warranty Item', 'Common Area Issue', 'General Handyman', 'Something Else'],
  },
]

export const FIXED_CATEGORIES = CATEGORY_GROUPS.flatMap((g) => g.categories)

export const CATEGORY_TO_ITEM_TYPE: Record<string, string> = Object.fromEntries([
  ...CATEGORY_GROUPS[0].categories.map((c) => [c, 'plumbing']),
  ...CATEGORY_GROUPS[1].categories.map((c) => [c, 'electrical']),
  ...CATEGORY_GROUPS[2].categories.map((c) => [c, 'hvac']),
  ...CATEGORY_GROUPS[3].categories.map((c) => [c, 'appliance']),
  ...CATEGORY_GROUPS[4].categories.map((c) => [c, 'structural']),
])

// Only "Foundation or Structural" is excluded at the category level —
// not the rest of the Structural & Carpentry group (drywall, a cabinet,
// flooring are genuinely safe to offer troubleshooting for), and NOT the
// Electrical group either: the model's own system prompt (see
// api/ai-assist/troubleshoot/route.ts) is the real safety backstop for
// everything, not category-level pre-filtering — it already refuses to
// suggest anything touching wiring regardless of category, and escalates
// immediately to "stop and report it" on any danger signal (sparking, a
// shock, a burning smell). A tripped breaker, a dead smoke-detector
// battery, a switch that just needs resetting are all safe, legitimate
// things to ask about — blocking the whole Electrical group pre-emptively
// took those away along with the genuinely unsafe ones.
const NO_TROUBLESHOOT_SET = new Set<string>(['Foundation or Structural'])
export function isNoTroubleshootCategory(category: string): boolean {
  return NO_TROUBLESHOOT_SET.has(category)
}

// Spanish display names. The stored value is always the English name
// above; only what's shown changes. A category not listed (an old custom
// one) shows as stored.
const GROUP_ES: Record<string, string> = {
  'Plumbing': 'Plomería', 'Electrical': 'Electricidad', 'Heating & Cooling': 'Calefacción y aire acondicionado',
  'Appliances': 'Electrodomésticos', 'Structural & Carpentry': 'Estructura y carpintería', 'Doors, Windows & Locks': 'Puertas, ventanas y cerraduras',
  'Exterior & Grounds': 'Exterior y terreno', 'Pest & Safety': 'Plagas y seguridad', 'Painting': 'Pintura',
  'Cleaning & Turnover': 'Limpieza y cambio de inquilino', 'General': 'General',
}
const CATEGORY_ES: Record<string, string> = {
  'Leaky Faucet or Pipe': 'Llave o tubería con fuga', 'Clogged Drain or Toilet': 'Desagüe o inodoro tapado', 'Running or Broken Toilet': 'Inodoro que no para o roto',
  'No Hot Water': 'Sin agua caliente', 'Water Heater': 'Calentador de agua', 'Low Water Pressure': 'Poca presión de agua', 'Garbage Disposal': 'Triturador de basura', 'Sump Pump': 'Bomba de sumidero',
  'Outlet or Switch': 'Enchufe o interruptor', 'Light Fixture': 'Lámpara o luminaria', 'Circuit Breaker or Power Outage': 'Breaker o corte de luz', 'Ceiling Fan': 'Ventilador de techo', 'Smoke or CO Detector': 'Detector de humo o CO',
  'No Heat': 'Sin calefacción', 'No A/C': 'Sin aire acondicionado', 'Thermostat': 'Termostato', 'Air Filter or Ventilation': 'Filtro de aire o ventilación', 'HVAC Noise or Smell': 'Ruido u olor en calefacción/aire',
  'Refrigerator': 'Refrigerador', 'Oven or Stove': 'Horno o estufa', 'Dishwasher': 'Lavaplatos', 'Washer or Dryer': 'Lavadora o secadora', 'Microwave': 'Microondas',
  'Drywall or Wall Damage': 'Pared dañada', 'Ceiling': 'Techo interior', 'Cabinet or Countertop': 'Gabinete o encimera', 'Flooring': 'Piso', 'Foundation or Structural': 'Cimientos o estructura', 'Fireplace': 'Chimenea', 'Hardware': 'Herrajes',
  'Door Won’t Open or Close': 'Puerta que no abre o cierra', 'Lock or Deadbolt': 'Cerradura o cerrojo', 'Window Won’t Open or Close': 'Ventana que no abre o cierra', 'Window Screen': 'Malla de ventana', 'Garage Door': 'Puerta de garaje', 'Blinds': 'Persianas',
  'Roof or Gutter Leak': 'Fuga en techo o canaleta', 'Siding': 'Revestimiento exterior', 'Deck or Patio': 'Terraza o patio', 'Fence': 'Cerca', 'Landscaping or Lawn': 'Jardinería o césped', 'Snow or Ice Removal': 'Remoción de nieve o hielo', 'Amenity (Pool, Gym, etc.)': 'Área común (piscina, gimnasio, etc.)',
  'Pest or Rodent Control': 'Control de plagas o roedores', 'Mold or Mildew': 'Moho u hongos', 'Water Damage or Leak': 'Daño por agua o fuga',
  'Interior Painting': 'Pintura interior', 'Exterior Painting': 'Pintura exterior',
  'Cleaning': 'Limpieza', 'Move-Out Cleaning': 'Limpieza de salida', 'Move-In or Move-Out Inspection': 'Inspección de entrada o salida', 'Turnover or Make-Ready': 'Preparación entre inquilinos',
  'Renovation': 'Renovación', 'Warranty Item': 'Artículo en garantía', 'Common Area Issue': 'Problema en área común', 'General Handyman': 'Reparaciones generales', 'Something Else': 'Otra cosa',
  // Older jobs were saved with the original short category names.
  'Appliance': 'Electrodoméstico', 'HVAC': 'Calefacción y aire', 'Pest': 'Plagas', 'Structural': 'Estructura', 'Roofing': 'Techo', 'Landscaping': 'Jardinería', 'Other': 'Otro',
}

export function categoryName(category: string | null | undefined, lang: 'en' | 'es'): string {
  if (!category) return ''
  return lang === 'es' ? CATEGORY_ES[category] || category : category
}

export function categoryGroupName(group: string, lang: 'en' | 'es'): string {
  return lang === 'es' ? GROUP_ES[group] || group : group
}
