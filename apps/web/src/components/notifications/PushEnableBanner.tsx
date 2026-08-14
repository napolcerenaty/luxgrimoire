'use client'

import { useState, useEffect } from 'react'
import { Bell, X } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'
import { usePushNotifications } from '@/hooks/usePushNotifications'

const DISMISSED_KEY = 'push-banner-dismissed'

interface Prefs {
  pushEnabled: boolean
  renewalPushEnabled: boolean
  salePushEnabled: boolean
}

export function PushEnableBanner() {
  const [dismissed, setDismissed] = useState(true) // start hidden to avoid flash
  const { isSupported, isSubscribed, isLoading, subscribe, permission } = usePushNotifications()

  const { data: prefs } = useQuery({
    queryKey: ['notification-preferences'],
    queryFn: () => authFetch<Prefs>('/notifications/preferences'),
    staleTime: 5 * 60 * 1000,
  })

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setDismissed(sessionStorage.getItem(DISMISSED_KEY) === '1')
    }
  }, [])

  const dismiss = () => {
    sessionStorage.setItem(DISMISSED_KEY, '1')
    setDismissed(true)
  }

  const handleEnable = async () => {
    await subscribe()
    dismiss()
  }

  // Show only when:
  // - push supported + not denied
  // - user has push enabled on account (renewalPush or salePush)
  // - this browser is NOT yet subscribed
  // - not dismissed this session
  const wantsPush = prefs && (prefs.renewalPushEnabled || prefs.salePushEnabled)
  const shouldShow = isSupported && permission !== 'denied' && wantsPush && !isSubscribed && !dismissed

  if (!shouldShow) return null

  return (
    <div className="flex items-center gap-3 bg-brand-500/10 border-b border-brand-500/20 px-4 py-2.5 text-sm">
      <Bell size={15} className="text-brand-400 shrink-0" />
      <p className="flex-1 text-stone-200">
        You have push notifications enabled — 
        <button
          onClick={handleEnable}
          disabled={isLoading}
          className="ml-1 text-brand-400 hover:text-brand-300 underline underline-offset-2 disabled:opacity-50"
        >
          {isLoading ? 'Enabling…' : 'enable on this device'}
        </button>
        {' '}to receive alerts here too.
      </p>
      <button onClick={dismiss} className="text-stone-500 hover:text-stone-300 shrink-0" aria-label="Dismiss">
        <X size={15} />
      </button>
    </div>
  )
}
