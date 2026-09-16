'use client'

import Link from 'next/link'
import { Logo } from '@/components/Logo'
import { RippleButton } from '@/components/RippleButton'

export type ReceiptRow = { label: string; value: string }

export function ReceiptCard({
  backHref,
  eyebrow,
  title,
  subtitle,
  rows,
  totalLabel,
  totalValue,
  receiptId,
  footerNote,
}: {
  backHref: string
  eyebrow: string
  title: string
  subtitle: string
  rows: ReceiptRow[]
  totalLabel: string
  totalValue: string
  receiptId: string
  footerNote: string
}) {
  const refNumber = receiptId.replace(/-/g, '').slice(0, 12).toUpperCase()

  return (
    <div className="min-h-screen bg-[#0C1A2E] py-10 px-6 print:bg-white print:py-0">
      <style>{`
        @media print {
          nav, .no-print { display: none !important; }
          body { background: white !important; }
        }
      `}</style>

      <nav className="max-w-md mx-auto mb-8 flex items-center justify-between no-print">
        <Link href={backHref} className="text-white/50 hover:text-white text-sm transition">
          ← Back
        </Link>
        <RippleButton
          onClick={() => window.print()}
          className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:opacity-90 transition"
        >
          Print / Save as PDF
        </RippleButton>
      </nav>

      <div className="max-w-md mx-auto pb-4">
        <div className="receipt-torn-edge bg-[#faf9f6] rounded-t-md shadow-[0_30px_80px_-30px_rgba(0,0,0,0.6)] print:shadow-none">
          <div className="px-8 pt-8 pb-6">
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-[#0C1A2E] flex items-center justify-center shrink-0">
                  <Logo className="w-3.5 h-3.5" />
                </div>
                <span className="text-[#0C1A2E] font-bold text-sm tracking-tight">Prophandld</span>
              </div>
              <span className="font-mono text-[10px] text-black/40 text-right leading-tight">
                No. {refNumber}
              </span>
            </div>

            <p className="font-mono text-[10px] tracking-[0.15em] text-black/40 uppercase mb-1">{eyebrow}</p>
            <h1 className="text-[#171717] font-semibold text-lg mb-0.5">{title}</h1>
            <p className="text-black/40 text-xs mb-6">{subtitle}</p>

            <div className="border-t border-dashed border-black/15 pt-5 space-y-3">
              {rows.map((row) => (
                <div key={row.label} className="flex items-baseline gap-2 font-mono text-[13px]">
                  <span className="text-black/50 shrink-0">{row.label}</span>
                  <span className="flex-1 border-b border-dotted border-black/20 translate-y-[-3px]" />
                  <span className="text-[#171717] font-medium shrink-0">{row.value}</span>
                </div>
              ))}
            </div>

            <div className="mt-5 pt-4" style={{ borderTop: '4px double rgba(0,0,0,0.45)' }}>
              <div className="flex items-baseline justify-between font-mono">
                <span className="text-[#171717] font-semibold text-sm">{totalLabel}</span>
                <span className="text-[#171717] font-bold text-xl">{totalValue}</span>
              </div>
            </div>
          </div>

          <div className="px-8 pb-8 pt-1">
            <p className="text-black/30 text-[11px] text-center">{footerNote}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
