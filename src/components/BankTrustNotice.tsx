import { ShieldIcon } from '@/components/icons'
import { useLanguage, t, type TranslationKey } from '@/lib/i18n'

// A plain-language reassurance block shown before and during bank-linking.
// Exists because this form asks for real financial details (routing/account
// numbers, and for landlords, SSN/DOB) — for someone unfamiliar with how
// Dwolla or bank-linking works, that's an understandable moment to hesitate.
// Every claim here is true of the actual implementation, not marketing copy:
// Prophandld's own servers never receive the full account number or SSN
// (see dwolla.ts/DwollaConnectCard), and nothing here is ever sold.
export function BankTrustNotice({ extraPoint }: { extraPoint?: TranslationKey }) {
  const lang = useLanguage()
  const points: TranslationKey[] = ['trustPointEncrypted', 'trustPointPartialNumber', 'trustPointNeverSell']
  if (extraPoint) points.push(extraPoint)

  return (
    <div className="bg-[#0A7B7E]/10 border border-[#0A7B7E]/25 rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-2.5">
        <ShieldIcon className="w-5 h-5 text-[#12A5A9] shrink-0" />
        <span className="text-white font-semibold text-[15px]">{t('trustNoticeHeading', lang)}</span>
      </div>
      <ul className="space-y-1.5">
        {points.map((key) => (
          <li key={key} className="text-white/60 text-[14px] leading-snug pl-1">
            {t(key, lang)}
          </li>
        ))}
      </ul>
    </div>
  )
}
