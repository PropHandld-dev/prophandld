'use client'

import { CheckCircleIcon } from '@/components/icons'
import { useLanguage, t } from '@/lib/i18n'

type StepState = 'done' | 'current' | 'upcoming'

// A first-time contractor who just got picked has no obvious way to know
// what happens between "you got the job" and "you got paid" — nothing in
// the app spelled it out end to end, just buttons that quietly appear as
// each stage arrives. This is that missing explanation, shown once a bid
// is accepted and hidden again once the job is actually done — a live
// checklist, not a generic how-it-works page, so it stays accurate to
// where this specific job actually is.
export function JobProcessGuide({
  jobStatus,
  scheduleConfirmed,
  beforePhotoCount,
  afterPhotoCount,
}: {
  jobStatus: string
  scheduleConfirmed: boolean
  beforePhotoCount: number
  afterPhotoCount: number
}) {
  const lang = useLanguage()

  if (['completed', 'archived', 'declined'].includes(jobStatus)) return null

  const stepState = (done: boolean, isCurrent: boolean): StepState =>
    done ? 'done' : isCurrent ? 'current' : 'upcoming'

  const step1Done = scheduleConfirmed || jobStatus === 'scheduled' || jobStatus === 'in_progress' || jobStatus === 'pending_review'
  const step2Done = jobStatus === 'in_progress' || jobStatus === 'pending_review'
  const step3Done = beforePhotoCount > 0
  const step4Current = jobStatus === 'in_progress' && step3Done
  const step5Done = jobStatus === 'pending_review' || afterPhotoCount > 0
  const step6Current = jobStatus === 'pending_review'

  const steps: { label: string; state: StepState }[] = [
    { label: t('howThisWorksStep1', lang), state: stepState(step1Done, jobStatus === 'bid_selected') },
    { label: t('howThisWorksStep2', lang), state: stepState(step2Done, step1Done && !step2Done) },
    { label: t('howThisWorksStep3', lang), state: stepState(step3Done, jobStatus === 'in_progress' && !step3Done) },
    { label: t('howThisWorksStep4', lang), state: stepState(step5Done, step4Current) },
    { label: t('howThisWorksStep5', lang), state: stepState(step5Done, jobStatus === 'in_progress' && step3Done && !step5Done) },
    { label: t('howThisWorksStep6', lang), state: stepState(false, step6Current) },
  ]

  return (
    <div className="bg-white/3 border border-white/8 rounded-2xl p-5 mb-4">
      <h3 className="text-white font-semibold text-sm mb-3">{t('howThisWorksHeading', lang)}</h3>
      <ul className="space-y-2.5">
        {steps.map((step, i) => (
          <li key={i} className="flex items-start gap-2.5">
            {step.state === 'done' ? (
              <CheckCircleIcon className="w-4 h-4 text-[#12A5A9] shrink-0 mt-0.5" />
            ) : (
              <span
                className={`w-4 h-4 rounded-full border shrink-0 mt-0.5 ${
                  step.state === 'current' ? 'border-[#12A5A9] bg-[#12A5A9]/20' : 'border-white/20'
                }`}
              />
            )}
            <span
              className={`text-sm ${
                step.state === 'done'
                  ? 'text-white/40 line-through'
                  : step.state === 'current'
                  ? 'text-white font-medium'
                  : 'text-white/50'
              }`}
            >
              {step.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
