'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { getComplianceStatus, type ComplianceStatusKey } from '@/lib/complianceStatus'
import { Skeleton } from '@/components/Skeleton'

const STATUS_LABEL: Record<ComplianceStatusKey, string> = {
  no_expiry: 'No expiry on file',
  expired: 'Expired',
  expiring_soon: 'Expiring soon',
  current: 'Current',
}
const STATUS_COLOR: Record<ComplianceStatusKey, string> = {
  no_expiry: '#6b7280',
  expired: '#dc2626',
  expiring_soon: '#d97706',
  current: '#0a7b7e',
}

type CityLicense = { licenseNumber: string; status: string; mostRecentIssueDate: string | null; unitCount: number | null }
type CityViolation = { title: string; status: string; date: string | null }

// A single, audit-ready document a landlord can hand to the city, an
// insurer, or a court in an eviction case -- the whole point of tracking
// compliance in the first place, per the strategic brief this was built
// from: "give each property a single compliance record." Deliberately
// its own light, print-optimized page rather than the app's dark theme --
// this is meant to be printed or saved as a PDF and read as a plain
// document, not viewed as a product screen. No PDF library added (there
// isn't one in this project and this doesn't need one): the browser's own
// Print > Save as PDF does the whole job for free.
export default function CompliancePrintableReportPage() {
  const router = useRouter()
  const params = useParams()
  const propertyId = params.id as string

  const [loading, setLoading] = useState(true)
  const [property, setProperty] = useState<any>(null)
  const [items, setItems] = useState<any[]>([])
  const [itemDocuments, setItemDocuments] = useState<Record<string, any>>({})
  const [cityLicenses, setCityLicenses] = useState<CityLicense[] | null>(null)
  const [cityViolations, setCityViolations] = useState<CityViolation[] | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/login')
        return
      }

      const { data: propertyData } = await supabase.from('properties').select('*').eq('id', propertyId).maybeSingle()
      if (cancelled) return
      if (!propertyData) {
        router.replace('/landlord/properties')
        return
      }
      setProperty(propertyData)

      const { data: itemsData } = await supabase
        .from('compliance_items')
        .select('*')
        .eq('property_id', propertyId)
        .order('expiry_date', { ascending: true, nullsFirst: false })
      if (cancelled) return
      setItems(itemsData || [])

      if (itemsData && itemsData.length > 0) {
        const { data: docsData } = await supabase
          .from('documents')
          .select('*')
          .in('compliance_item_id', itemsData.map((i) => i.id))
        if (cancelled) return
        const enriched: Record<string, any> = {}
        for (const doc of docsData || []) enriched[doc.compliance_item_id] = doc
        setItemDocuments(enriched)
      }

      if (propertyData.city && propertyData.city.trim().toLowerCase() === 'philadelphia') {
        fetch(`/api/philadelphia/compliance-lookup?address=${encodeURIComponent(propertyData.address)}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => {
            if (cancelled || !data) return
            setCityLicenses(data.licenses || [])
            setCityViolations(data.openViolations || [])
          })
          .catch(() => {})
      }

      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [propertyId, router])

  if (loading || !property) {
    return (
      <div className="min-h-screen bg-white px-6 py-10 max-w-2xl mx-auto">
        <Skeleton className="h-8 w-64 mb-6" />
        <Skeleton className="h-40" />
      </div>
    )
  }

  const generatedAt = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

  return (
    <div className="min-h-screen bg-white text-[#111827]">
      <div className="max-w-2xl mx-auto px-8 py-10 print:px-0 print:py-0">
        <div className="flex items-center justify-between mb-8 print:hidden">
          <Link href={`/landlord/properties/${propertyId}/compliance`} className="text-sm text-gray-500 hover:text-gray-800">
            ← Back
          </Link>
          <button
            onClick={() => window.print()}
            className="bg-[#12A5A9] text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:opacity-90"
          >
            Print / Save as PDF
          </button>
        </div>

        <div className="border-b border-gray-200 pb-6 mb-6">
          <p className="text-xs uppercase tracking-wide text-gray-400 font-semibold mb-1">Compliance Record</p>
          <h1 className="text-2xl font-bold">{property.address}</h1>
          <p className="text-gray-500 text-sm mt-1">
            {property.city}{property.state ? `, ${property.state}` : ''} {property.zip || ''}
          </p>
          <p className="text-gray-400 text-xs mt-3">Generated {generatedAt} via Prophandld</p>
        </div>

        <section className="mb-8">
          <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500 mb-3">Compliance items on file</h2>
          {items.length === 0 ? (
            <p className="text-gray-500 text-sm">No compliance items have been logged for this property.</p>
          ) : (
            <div className="space-y-3">
              {items.map((item) => {
                const status = getComplianceStatus(item.expiry_date, item.reminder_days)
                const doc = itemDocuments[item.id]
                return (
                  <div key={item.id} className="border border-gray-200 rounded-lg px-4 py-3 flex items-center justify-between gap-4 break-inside-avoid">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm">{item.item_type}</p>
                      <p className="text-gray-500 text-xs mt-0.5">
                        {item.expiry_date ? `Expires ${new Date(item.expiry_date + 'T00:00:00').toLocaleDateString()}` : 'No expiry date on file'}
                        {doc ? ` · Document on file: ${doc.filename}` : ' · No document on file'}
                      </p>
                    </div>
                    <span
                      className="text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 whitespace-nowrap"
                      style={{ color: STATUS_COLOR[status.key], backgroundColor: `${STATUS_COLOR[status.key]}1a` }}
                    >
                      {STATUS_LABEL[status.key]}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {cityLicenses !== null && (
          <section className="mb-8 break-inside-avoid">
            <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500 mb-3">City of Philadelphia public records</h2>
            <div className="space-y-2">
              {cityLicenses.length === 0 ? (
                <p className="text-gray-500 text-sm">No rental license found on file with the city for this address.</p>
              ) : (
                cityLicenses.map((l) => (
                  <p key={l.licenseNumber} className="text-sm">
                    Rental license #{l.licenseNumber} — <span className="font-semibold">{l.status}</span>
                    {l.unitCount ? ` (${l.unitCount} unit${l.unitCount === 1 ? '' : 's'})` : ''}
                  </p>
                ))
              )}
              {cityViolations && cityViolations.length > 0 ? (
                cityViolations.map((v, i) => (
                  <p key={i} className="text-sm text-gray-700">
                    Open violation: {v.title}{v.date ? ` (cited ${new Date(v.date).toLocaleDateString()})` : ''}
                  </p>
                ))
              ) : (
                <p className="text-gray-500 text-sm">No open violations on file with the city.</p>
              )}
            </div>
            <p className="text-gray-400 text-xs mt-2">Source: City of Philadelphia public open data, checked at the time this record was generated.</p>
          </section>
        )}

        <p className="text-gray-400 text-xs border-t border-gray-200 pt-4">
          This record reflects information entered into Prophandld{cityLicenses !== null ? ' and public City of Philadelphia records at the time of generation' : ''}.
          It is not a certified city document and does not replace confirming current status directly with the relevant authority.
        </p>
      </div>
    </div>
  )
}
