'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { BottomTabBar } from '@/components/BottomTabBar'
import { Skeleton } from '@/components/Skeleton'
import { ScrollReveal } from '@/components/ScrollReveal'
import { RippleButton } from '@/components/RippleButton'
import { CheckCircleIcon } from '@/components/icons'
import { CONTRACTOR_TABS } from '@/lib/navTabs'

const CATEGORIES = [
  'Plumbing', 'Electrical', 'HVAC', 'Appliance',
  'Structural', 'Pest', 'Turnover', 'Other',
]

export default function ContractorSettingsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [zip, setZip] = useState('')
  const [licensed, setLicensed] = useState(false)

  const [userId, setUserId] = useState<string | null>(null)
  const [verification, setVerification] = useState<any>(null)
  const [verifSaving, setVerifSaving] = useState(false)
  const [verifError, setVerifError] = useState<string | null>(null)
  const [verifSuccess, setVerifSuccess] = useState<string | null>(null)
  const [licenseNumber, setLicenseNumber] = useState('')
  const [licenseExpiry, setLicenseExpiry] = useState('')
  const [insuranceExpiry, setInsuranceExpiry] = useState('')
  const [licenseFile, setLicenseFile] = useState<File | null>(null)
  const [insuranceFile, setInsuranceFile] = useState<File | null>(null)

  const loadVerification = async (uid: string) => {
    const { data: verifData } = await supabase
      .from('contractor_verifications')
      .select('*')
      .eq('contractor_user_id', uid)
      .maybeSingle()

    if (verifData) {
      setVerification(verifData)
      setLicenseNumber(verifData.license_number || '')
      setLicenseExpiry(verifData.license_expiry || '')
      setInsuranceExpiry(verifData.insurance_expiry || '')
    }
  }

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }
      setUserId(user.id)

      const { data: profileData } = await supabase
        .from('users')
        .select('service_categories, service_zip, licensed')
        .eq('id', user.id)
        .maybeSingle()

      if (profileData) {
        setSelectedCategories(profileData.service_categories || [])
        setZip(profileData.service_zip || '')
        setLicensed(profileData.licensed || false)
      }

      await loadVerification(user.id)
      setLoading(false)
    }
    init()
  }, [router])

  const toggleCategory = (cat: string) => {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSuccess(null)

    if (selectedCategories.length === 0) {
      setError('Select at least one category you service.')
      setSaving(false)
      return
    }
    if (!zip.trim()) {
      setError('Enter the ZIP code you service.')
      setSaving(false)
      return
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setError('Not authenticated.')
      setSaving(false)
      return
    }

    const { error: updateError } = await supabase
      .from('users')
      .update({
        service_categories: selectedCategories,
        service_zip: zip.trim(),
        licensed,
      })
      .eq('id', user.id)

    if (updateError) {
      console.error('Error saving contractor profile:', updateError)
      setError('Could not save your profile.')
      setSaving(false)
      return
    }

    setSuccess('Profile saved. You\'ll now see matching jobs on your dashboard.')
    setSaving(false)
  }

  const handleVerificationSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!userId) return

    if (!licenseNumber.trim()) {
      setVerifError('Enter your license number.')
      return
    }
    if (!verification?.license_document_url && !licenseFile) {
      setVerifError('Upload a license document.')
      return
    }
    if (!verification?.insurance_document_url && !insuranceFile) {
      setVerifError('Upload an insurance document.')
      return
    }

    setVerifSaving(true)
    setVerifError(null)
    setVerifSuccess(null)

    let licenseDocUrl = verification?.license_document_url || null
    let insuranceDocUrl = verification?.insurance_document_url || null

    if (licenseFile) {
      const ext = licenseFile.name.split('.').pop()
      const path = `${userId}/license-${crypto.randomUUID()}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('contractor-documents')
        .upload(path, licenseFile)

      if (uploadError) {
        console.error('Error uploading license doc:', uploadError)
        setVerifError(`Could not upload license document: ${uploadError.message}`)
        setVerifSaving(false)
        return
      }
      licenseDocUrl = path
    }

    if (insuranceFile) {
      const ext = insuranceFile.name.split('.').pop()
      const path = `${userId}/insurance-${crypto.randomUUID()}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('contractor-documents')
        .upload(path, insuranceFile)

      if (uploadError) {
        console.error('Error uploading insurance doc:', uploadError)
        setVerifError(`Could not upload insurance document: ${uploadError.message}`)
        setVerifSaving(false)
        return
      }
      insuranceDocUrl = path
    }

    const { error: upsertError } = await supabase
      .from('contractor_verifications')
      .upsert(
        {
          contractor_user_id: userId,
          license_number: licenseNumber.trim(),
          license_expiry: licenseExpiry || null,
          license_document_url: licenseDocUrl,
          insurance_document_url: insuranceDocUrl,
          insurance_expiry: insuranceExpiry || null,
          status: 'pending',
          reviewed_by: null,
          reviewed_at: null,
        },
        { onConflict: 'contractor_user_id' }
      )

    if (upsertError) {
      console.error('Error saving verification:', upsertError)
      setVerifError(`Could not save verification info: ${upsertError.message}`)
      setVerifSaving(false)
      return
    }

    setLicenseFile(null)
    setInsuranceFile(null)
    setVerifSuccess('Submitted for review.')
    await loadVerification(userId)
    setVerifSaving(false)
  }

  const verificationStatusBadge = () => {
    const status = verification?.status
    if (!status) return { label: 'Unverified', className: 'bg-white/8 text-white/50', icon: false }
    if (status === 'pending') return { label: 'Pending review', className: 'bg-yellow-500/15 text-yellow-400', icon: false }
    if (status === 'verified') return { label: 'Verified', className: 'bg-[#0A7B7E]/20 text-[#12A5A9]', icon: true }
    return { label: 'Rejected — resubmit', className: 'bg-red-500/15 text-red-400', icon: false }
  }

  return (
    <div className="min-h-screen bg-[#0C1A2E]">
      <nav className="border-b border-white/8 px-6 py-4 flex items-center justify-between">
        <Link href="/contractor" className="text-white/50 hover:text-white text-sm transition">
          ← Dashboard
        </Link>
        <span className="text-white font-semibold text-sm">Prophandld</span>
        <div className="w-24" />
      </nav>

      <main className="max-w-xl mx-auto px-6 py-10 pb-28">
        {loading ? (
          <div className="space-y-4">
            <div className="mb-8">
              <Skeleton className="h-7 w-48 mb-2" />
              <Skeleton className="h-4 w-64" />
            </div>
            <Skeleton className="h-56 mb-6" />
            <Skeleton className="h-16 mb-6" />
            <Skeleton className="h-64" />
          </div>
        ) : (
        <>
        <h1 className="text-2xl font-bold text-white mb-2">Service settings</h1>
        <p className="text-white/50 text-sm mb-8">
          Tell us what you do and where, so we can match you to the right jobs.
        </p>

        <ScrollReveal>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="text-white/70 text-sm block mb-2">Categories you service</label>
            <div className="grid grid-cols-2 gap-2">
              {CATEGORIES.map((cat) => (
                <label
                  key={cat}
                  className={
                    selectedCategories.includes(cat)
                      ? 'flex items-center gap-2 bg-[#0A7B7E]/15 border border-[#12A5A9]/40 rounded-xl px-3 py-2.5 cursor-pointer'
                      : 'flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 cursor-pointer hover:bg-white/8 transition'
                  }
                >
                  <input
                    type="checkbox"
                    checked={selectedCategories.includes(cat)}
                    onChange={() => toggleCategory(cat)}
                    className="w-4 h-4"
                  />
                  <span className="text-white text-sm">{cat}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="text-white/70 text-sm block mb-1">ZIP code you service</label>
            <input
              type="text"
              value={zip}
              onChange={(e) => setZip(e.target.value)}
              placeholder="19136"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-[#12A5A9] transition"
            />
            <p className="text-white/30 text-xs mt-1">
              For now, jobs match on exact ZIP. Wider radius matching is coming soon.
            </p>
          </div>

          <label className="flex items-center gap-3 bg-white/3 border border-white/8 rounded-xl p-4 cursor-pointer hover:bg-white/5 transition-all">
            <input
              type="checkbox"
              checked={licensed}
              onChange={(e) => setLicensed(e.target.checked)}
              className="w-4 h-4"
            />
            <span className="text-white text-sm">I am a licensed contractor</span>
          </label>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
              {error}
            </div>
          )}
          {success && (
            <div className="bg-[#0A7B7E]/15 border border-[#12A5A9]/30 rounded-xl px-4 py-3 text-[#12A5A9] text-sm">
              {success}
            </div>
          )}

          <RippleButton
            type="submit"
            disabled={saving}
            className="w-full bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white font-semibold py-3 rounded-xl transition hover:opacity-90 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save settings'}
          </RippleButton>
        </form>
        </ScrollReveal>

        <ScrollReveal className="mt-10 pt-8 border-t border-white/8">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-white font-semibold">Verification</h2>
            <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${verificationStatusBadge().className}`}>
              {verificationStatusBadge().icon && <CheckCircleIcon className="w-3 h-3" />}
              {verificationStatusBadge().label}
            </span>
          </div>
          <p className="text-white/50 text-sm mb-6">
            Upload your license and insurance so landlords can see you're verified before selecting your bid.
          </p>

          {verification?.status === 'rejected' && verification.admin_notes && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm mb-4">
              Reviewer note: {verification.admin_notes}
            </div>
          )}

          <form onSubmit={handleVerificationSubmit} className="space-y-4">
            <div>
              <label className="text-white/70 text-sm block mb-1">License number</label>
              <input
                type="text"
                value={licenseNumber}
                onChange={(e) => setLicenseNumber(e.target.value)}
                placeholder="e.g. PA-123456"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-[#12A5A9] transition"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-white/70 text-sm block mb-1">License expiry</label>
                <input
                  type="date"
                  value={licenseExpiry}
                  onChange={(e) => setLicenseExpiry(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#12A5A9] transition"
                />
              </div>
              <div>
                <label className="text-white/70 text-sm block mb-1">Insurance expiry</label>
                <input
                  type="date"
                  value={insuranceExpiry}
                  onChange={(e) => setInsuranceExpiry(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#12A5A9] transition"
                />
              </div>
            </div>

            <div>
              <label className="text-white/70 text-sm block mb-1">License document</label>
              <label className="block">
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={(e) => setLicenseFile(e.target.files?.[0] || null)}
                  className="hidden"
                />
                <span className="inline-block bg-white/8 text-white text-sm font-medium px-4 py-2.5 rounded-xl hover:bg-white/12 transition cursor-pointer">
                  {licenseFile ? licenseFile.name : verification?.license_document_url ? 'Replace file' : '+ Choose file'}
                </span>
              </label>
              {!licenseFile && verification?.license_document_url && (
                <p className="text-white/30 text-xs mt-1">On file</p>
              )}
            </div>

            <div>
              <label className="text-white/70 text-sm block mb-1">Insurance document</label>
              <label className="block">
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={(e) => setInsuranceFile(e.target.files?.[0] || null)}
                  className="hidden"
                />
                <span className="inline-block bg-white/8 text-white text-sm font-medium px-4 py-2.5 rounded-xl hover:bg-white/12 transition cursor-pointer">
                  {insuranceFile ? insuranceFile.name : verification?.insurance_document_url ? 'Replace file' : '+ Choose file'}
                </span>
              </label>
              {!insuranceFile && verification?.insurance_document_url && (
                <p className="text-white/30 text-xs mt-1">On file</p>
              )}
            </div>

            {verifError && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
                {verifError}
              </div>
            )}
            {verifSuccess && (
              <div className="bg-[#0A7B7E]/15 border border-[#12A5A9]/30 rounded-xl px-4 py-3 text-[#12A5A9] text-sm">
                {verifSuccess}
              </div>
            )}

            <RippleButton
              type="submit"
              disabled={verifSaving}
              className="w-full bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white font-semibold py-3 rounded-xl transition hover:opacity-90 disabled:opacity-50"
            >
              {verifSaving ? 'Submitting...' : verification ? 'Resubmit for review' : 'Submit for review'}
            </RippleButton>
          </form>
        </ScrollReveal>
        </>
        )}
      </main>

      <BottomTabBar tabs={CONTRACTOR_TABS} />
    </div>
  )
}
