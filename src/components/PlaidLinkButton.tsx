'use client'

import { useEffect, useState, useCallback } from 'react'
import { usePlaidLink, type PlaidLinkOnSuccess } from 'react-plaid-link'
import { RippleButton } from '@/components/RippleButton'

export function PlaidLinkButton({
  label,
  onLinked,
  onError,
}: {
  label: string
  onLinked: (args: { publicToken: string; accountId: string }) => void | Promise<void>
  onError?: (message: string) => void
}) {
  const [linkToken, setLinkToken] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch('/api/plaid/link-token', { method: 'POST' })
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data.linkToken) setLinkToken(data.linkToken)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const onSuccess: PlaidLinkOnSuccess = useCallback(
    async (publicToken, metadata) => {
      const accountId = metadata.accounts[0]?.id
      if (!publicToken || !accountId) {
        onError?.('No bank account was selected.')
        return
      }
      setBusy(true)
      try {
        await onLinked({ publicToken, accountId })
      } finally {
        setBusy(false)
      }
    },
    [onLinked, onError]
  )

  const { open, ready } = usePlaidLink({
    token: linkToken || '',
    onSuccess,
    onExit: (error) => {
      if (error) onError?.(error.display_message || 'Bank linking was cancelled.')
    },
  })

  return (
    <RippleButton
      onClick={() => open()}
      disabled={!ready || !linkToken || busy}
      className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:opacity-90 transition disabled:opacity-50"
    >
      {busy ? 'Linking…' : label}
    </RippleButton>
  )
}
