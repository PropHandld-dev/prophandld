'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { BottomTabBar } from '@/components/BottomTabBar'
import { LANDLORD_TABS } from '@/lib/navTabs'
import { getLandlordIds } from '@/lib/landlordIds'
import { useLanguage } from '@/lib/i18n'

type Doc = { id: string; property_id: string; document_type: string | null; filename: string; file_url: string; created_at: string }

// Every document across all of your properties, grouped by property, with
// a search box. Uploading still happens on each property's own page.
export default function DocumentsOverviewPage() {
  const router = useRouter()
  const lang = useLanguage()
  const es = lang === 'es'
  const [props, setProps] = useState<{ id: string; address: string }[]>([])
  const [docs, setDocs] = useState<Doc[] | null>(null)
  const [query, setQuery] = useState('')
  const [opening, setOpening] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/login')
        return
      }
      const ids = await getLandlordIds(supabase, user.id)
      const { data: p } = await supabase.from('properties').select('id, address').in('owner_user_id', ids).eq('archived', false).order('address')
      setProps(p || [])
      const propIds = (p || []).map((x) => x.id)
      if (!propIds.length) {
        setDocs([])
        return
      }
      const { data } = await supabase
        .from('documents')
        .select('id, property_id, document_type, filename, file_url, created_at')
        .in('property_id', propIds)
        .order('created_at', { ascending: false })
        .limit(500)
      setDocs((data || []) as Doc[])
    }
    load()
  }, [router])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (docs || []).filter((d) => !q || `${d.filename} ${d.document_type || ''}`.toLowerCase().includes(q))
  }, [docs, query])

  const open = async (d: Doc) => {
    setOpening(d.id)
    const { data } = await supabase.storage.from('documents').createSignedUrl(d.file_url, 3600)
    setOpening(null)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="min-h-screen bg-[#0C1A2E] pb-28">
      <nav className="border-b border-white/8 px-5 py-4 flex items-center justify-between">
        <Link href="/landlord" className="text-white/50 hover:text-white text-sm">← {es ? 'Inicio' : 'Dashboard'}</Link>
        <span className="text-white font-semibold text-sm">{es ? 'Documentos' : 'Documents'}</span>
        <span className="w-16" />
      </nav>
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">{es ? 'Todos tus documentos' : 'All your documents'}</h1>
        <p className="text-white/55 text-sm mt-1">{es ? 'Contratos, facturas, licencias y más, de todas tus propiedades.' : 'Leases, bills, licenses and more, from every property.'}</p>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={es ? 'Buscar por nombre o tipo' : 'Search by name or type'}
          aria-label={es ? 'Buscar documentos' : 'Search documents'}
          className="w-full mt-5 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-white/40 focus:outline-none focus:border-[#12A5A9]"
        />
        {docs === null ? (
          <div className="mt-6 space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-16 rounded-2xl bg-white/5 animate-pulse" />)}</div>
        ) : (
          <div className="mt-6 space-y-6">
            {props.map((p) => {
              const list = filtered.filter((d) => d.property_id === p.id)
              if (query && list.length === 0) return null
              return (
                <section key={p.id}>
                  <div className="flex items-center justify-between gap-3 mb-2 px-1">
                    <h2 className="text-white font-semibold text-sm truncate">{p.address}</h2>
                    <Link href={`/landlord/properties/${p.id}/documents`} className="text-[#12A5A9] text-xs font-semibold shrink-0">{es ? '+ Subir' : '+ Upload'}</Link>
                  </div>
                  {list.length === 0 ? (
                    <p className="text-white/40 text-sm px-1">{es ? 'Sin documentos todavía.' : 'No documents yet.'}</p>
                  ) : (
                    <ul className="rounded-2xl border border-white/8 bg-white/3 divide-y divide-white/6 overflow-hidden">
                      {list.slice(0, 12).map((d) => (
                        <li key={d.id}>
                          <button onClick={() => open(d)} className="w-full text-left flex items-center gap-3 px-4 py-3 hover:bg-white/4">
                            <div className="min-w-0 flex-1">
                              <p className="text-white text-sm truncate">{d.filename}</p>
                              <p className="text-white/45 text-xs">{d.document_type || (es ? 'Documento' : 'Document')} · {new Date(d.created_at).toLocaleDateString()}</p>
                            </div>
                            <span className="text-[#12A5A9] text-xs font-semibold shrink-0">{opening === d.id ? '…' : es ? 'Abrir' : 'Open'}</span>
                          </button>
                        </li>
                      ))}
                      {list.length > 12 && (
                        <li><Link href={`/landlord/properties/${p.id}/documents`} className="block px-4 py-3 text-[#12A5A9] text-xs font-semibold">{es ? `Ver los ${list.length}` : `See all ${list.length}`} →</Link></li>
                      )}
                    </ul>
                  )}
                </section>
              )
            })}
          </div>
        )}
      </main>
      <BottomTabBar tabs={LANDLORD_TABS} />
    </div>
  )
}
