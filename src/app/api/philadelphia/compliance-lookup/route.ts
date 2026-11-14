import { NextRequest, NextResponse } from 'next/server'
import { tooManyRequests } from '@/lib/rateLimit'

export const maxDuration = 15

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

async function cartoQuery(sql: string) {
  const res = await fetch(`${CARTO_SQL_URL}?q=${encodeURIComponent(sql)}`, { signal: AbortSignal.timeout(8000) })
  if (!res.ok) throw new Error(`Carto query failed: ${res.status}`)
  const body = await res.json()
  return (body.rows || []) as any[]
}

export async function GET(request: NextRequest) {
  const ip = (request.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim()
  if (await tooManyRequests(`philly-compliance-lookup:ip:${ip}`, 10, 15)) {
    return NextResponse.json({ error: 'Too many lookups. Try again in a few minutes.' }, { status: 429 })
  }

  const rawAddress = request.nextUrl.searchParams.get('address') || ''
  const address = sanitizeAddress(rawAddress)
  if (!address || address.length < 5) {
    return NextResponse.json({ error: 'Enter a street address.' }, { status: 400 })
  }

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
    return NextResponse.json({ error: 'Could not reach the city’s open data right now. Try again shortly.' }, { status: 502 })
  }
}
