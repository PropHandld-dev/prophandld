import { NextRequest, NextResponse } from 'next/server'
import { tooManyRequests } from '@/lib/rateLimit'

// Worst case is two sequential 10s attempts (initial + one retry) per
// query, with the license and violations queries themselves running in
// parallel -- so ~20s, not 2x that.
export const maxDuration = 50

// Public, no-login lookup against the City of Philadelphia's own open data
// (phl.carto.com, the same backend opendataphilly.org uses) -- rental
// license status (li_business_licenses) and open code violations
// (violations). Nothing here is Prophandld's own data or judgment; it's a
// read-through to the city's public record, framed that way on purpose so
// nobody mistakes "the city says this license is active" for "Prophandld
// verified this."
//
// Carto's SQL API takes a raw SQL string with no parameterized-query
// option over HTTP GET, so the address has to be sanitized before it's
// ever concatenated into that string -- stripped to a safe charset and
// single quotes escaped, same discipline as any other hand-built SQL
// string, even though the target isn't our own database.
const CARTO_SQL_URL = 'https://phl.carto.com/api/v2/sql'
const SAFE_ADDRESS_RE = /[^A-Za-z0-9#.,\-\s]/g

function sanitizeAddress(raw: string): string {
  return raw.replace(SAFE_ADDRESS_RE, '').replace(/'/g, "''").trim().slice(0, 120)
}

// Found live: a search for "8058 Walker Street" returned nothing even
// though the city's own record for that exact property exists and has an
// active rental license -- stored as "8058 WALKER ST". The city's address
// data (and Google Places' own autocomplete output, which feeds this
// field from the property form and the lookup tool alike) consistently
// uses USPS-style abbreviations, so a literal substring match on the
// spelled-out word never matches. This normalizes the common ones,
// word-boundary-aware, before the address is used in either query --
// without it, this silently failed for what's likely the majority of
// real addresses (anyone whose street type wasn't already abbreviated).
const STREET_SUFFIX_MAP: [RegExp, string][] = [
  [/\bstreet\b/gi, 'St'],
  [/\bavenue\b/gi, 'Ave'],
  [/\bboulevard\b/gi, 'Blvd'],
  [/\bdrive\b/gi, 'Dr'],
  [/\broad\b/gi, 'Rd'],
  [/\blane\b/gi, 'Ln'],
  [/\bcourt\b/gi, 'Ct'],
  [/\bplace\b/gi, 'Pl'],
  [/\bcircle\b/gi, 'Cir'],
  [/\bterrace\b/gi, 'Ter'],
  [/\bparkway\b/gi, 'Pkwy'],
  [/\bhighway\b/gi, 'Hwy'],
  [/\bsquare\b/gi, 'Sq'],
  [/\btrail\b/gi, 'Trl'],
  [/\bnorth\b/gi, 'N'],
  [/\bsouth\b/gi, 'S'],
  [/\beast\b/gi, 'E'],
  [/\bwest\b/gi, 'W'],
]

function normalizeStreetSuffix(address: string): string {
  let result = address
  for (const [pattern, replacement] of STREET_SUFFIX_MAP) {
    result = result.replace(pattern, replacement)
  }
  return result
}

// phl.carto.com is a free public service with real latency variance --
// confirmed live: three back-to-back real requests came back in 4.3s,
// 4.8s, and one that didn't finish inside 8s at all. A single timeout
// surfaced that as a user-facing failure roughly half the time, even
// though the service recovers almost immediately on a retry. One retry
// (fresh timeout, not a shared budget) covers that without making a
// genuinely down service hang the request forever.
async function cartoQueryOnce(sql: string) {
  const res = await fetch(`${CARTO_SQL_URL}?q=${encodeURIComponent(sql)}`, { signal: AbortSignal.timeout(14000) })
  if (!res.ok) throw new Error(`Carto query failed: ${res.status}`)
  const body = await res.json()
  return (body.rows || []) as any[]
}

async function cartoQuery(sql: string) {
  // Up to three tries: the city's service is usually fast but has slow
  // spells that clear within seconds.
  let lastErr: unknown
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await cartoQueryOnce(sql)
    } catch (err) {
      lastErr = err
      console.error(`philadelphia/compliance-lookup: attempt ${attempt + 1} failed`, err)
      if (attempt < 2) await new Promise((r) => setTimeout(r, 600 * (attempt + 1)))
    }
  }
  throw lastErr
}

export async function GET(request: NextRequest) {
  const ip = (request.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim()
  // Loosened from 10 after it turned out too strict for ordinary
  // exploratory use -- a ceiling against scripted abuse, not a normal
  // usage cap, same reasoning aiAssistRateLimit's own comment uses.
  if (await tooManyRequests(`philly-compliance-lookup:ip:${ip}`, 30, 15)) {
    return NextResponse.json({ error: 'Too many lookups. Try again in a few minutes.' }, { status: 429 })
  }

  const rawAddress = request.nextUrl.searchParams.get('address') || ''
  const sanitized = sanitizeAddress(rawAddress)
  if (!sanitized || sanitized.length < 5) {
    return NextResponse.json({ error: 'Enter a street address.' }, { status: 400 })
  }
  // Only the street part ("8058 WALKER ST"): the city stores addresses as
  // "8058 WALKER ST, Philadelphia, PA 19136-2722", so a full address with
  // a 5-digit ZIP or ", USA" from Google Places can miss.
  const address = normalizeStreetSuffix(sanitized.split(',')[0].trim())

  try {
    const [licenses, violations] = await Promise.all([
      cartoQuery(
        `SELECT licensenum, licensetype, licensestatus, mostrecentissuedate, numberofunits, fulladdress ` +
          `FROM li_business_licenses WHERE licensetype = 'Rental' AND fulladdress ILIKE '%${address}%' ` +
          `ORDER BY mostrecentissuedate DESC LIMIT 5`
      ),
      cartoQuery(
        `SELECT violationcodetitle, violationstatus, violationdate, casestatus, address ` +
          `FROM violations WHERE address ILIKE '%${address}%' AND violationstatus = 'OPEN' ` +
          `ORDER BY violationdate DESC LIMIT 10`
      ),
    ])

    return NextResponse.json({
      licenses: licenses.map((l) => ({
        licenseNumber: l.licensenum,
        status: l.licensestatus,
        mostRecentIssueDate: l.mostrecentissuedate,
        unitCount: l.numberofunits,
        address: l.fulladdress,
      })),
      openViolations: violations.map((v) => ({
        title: v.violationcodetitle,
        status: v.violationstatus,
        date: v.violationdate,
        caseStatus: v.casestatus,
        address: v.address,
      })),
    })
  } catch (err) {
    console.error('philadelphia/compliance-lookup: query failed', err)
    return NextResponse.json(
      {
        error: "The city's records site is slow right now. Try again in a minute, or look the address up on the city's own site.",
        atlasUrl: `https://atlas.phila.gov/${encodeURIComponent(address)}`,
      },
      { status: 502 }
    )
  }
}
