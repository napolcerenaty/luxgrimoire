'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Bell, BellOff, RefreshCw, Megaphone } from 'lucide-react'
import { authFetch } from '@/lib/authFetch'
import { usePushNotifications } from '@/hooks/usePushNotifications'

interface NotificationPreferences {
  renewalReminderEnabled: boolean
  renewalReminderDays: number
  saleReminderEnabled: boolean
  saleReminderDays: number
  pushEnabled: boolean
}

interface ReminderSettings {
  appNotifPushEnabled: boolean
}

const DAYS_OPTIONS = [1, 3, 7]

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative w-10 h-5 rounded-full transition-colors ${checked ? 'bg-brand-500' : 'bg-stone-700'}`}
    >
      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  )
}

export default function NotificationSettingsPage() {
  const queryClient = useQueryClient()
  const { permission, isSubscribed, isLoading: pushLoading, isSupported, subscribe, unsubscribe } = usePushNotifications()

  const { data: prefs, isLoading } = useQuery({
    queryKey: ['notification-preferences'],
    queryFn: () => authFetch<NotificationPreferences>('/notifications/preferences'),
  })

  const mutation = useMutation({
    mutationFn: (dto: Partial<NotificationPreferences>) =>
      authFetch('/notifications/preferences', { method: 'PUT', body: JSON.stringify(dto) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notification-preferences'] }),
  })

  const { data: reminderSettings } = useQuery({
    queryKey: ['reminder-settings'],
    queryFn: () => authFetch<ReminderSettings>('/reminder-settings'),
  })

  const reminderMutation = useMutation({
    mutationFn: (dto: Partial<ReminderSettings>) =>
      authFetch('/reminder-settings', { method: 'PUT', body: JSON.stringify(dto) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reminder-settings'] }),
  })

  if (isLoading || !prefs) {
    return (
      <div className="max-w-xl mx-auto px-4 py-10 space-y-6">
        <div className="h-8 bg-stone-800 rounded-lg w-48 animate-pulse" />
        <div className="h-32 bg-stone-800 rounded-2xl animate-pulse" />
      </div>
    )
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-10 space-y-8">
      <div>
        <h1 className="text-2xl font-serif text-stone-100">Notification Settings</h1>
        <p className="text-sm text-stone-400 mt-1">Control when and how you receive notifications.</p>
      </div>

      {/* Push Notifications */}
      <section className="bg-stone-900 border border-stone-800 rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Bell size={16} className="text-brand-400" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-stone-300">Push Notifications</h2>
        </div>

        {!isSupported ? (
          <p className="text-sm text-stone-500">Push notifications are not supported in your browser.</p>
        ) : permission === 'denied' ? (
          <p className="text-sm text-stone-500">
            Push notifications are blocked. Enable them in your browser settings, then refresh.
          </p>
        ) : (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-stone-200">
                {isSubscribed ? 'Push notifications are enabled on this device.' : 'Receive notifications on this device.'}
              </p>
              <p className="text-xs text-stone-500 mt-0.5">
                {isSubscribed ? 'You\'ll receive push alerts for renewals and sales.' : 'Works in browser and when installed as an app.'}
              </p>
            </div>
            <button
              onClick={isSubscribed ? unsubscribe : subscribe}
              disabled={pushLoading}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                isSubscribed
                  ? 'bg-stone-700 hover:bg-stone-600 text-stone-200'
                  : 'bg-brand-500 hover:bg-brand-400 text-stone-950'
              } disabled:opacity-50`}
            >
              {pushLoading ? (
                <RefreshCw size={14} className="animate-spin" />
              ) : isSubscribed ? (
                <><BellOff size={14} /> Disable</>
              ) : (
                <><Bell size={14} /> Enable</>
              )}
            </button>
          </div>
        )}
      </section>

      {/* Renewal Reminders */}
      <section className="bg-stone-900 border border-stone-800 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-base">🔄</span>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-stone-300">Renewal Reminders</h2>
          </div>
          <Toggle
            checked={prefs.renewalReminderEnabled}
            onChange={(v) => mutation.mutate({ renewalReminderEnabled: v })}
          />
        </div>
        {prefs.renewalReminderEnabled && (
          <div>
            <p className="text-xs text-stone-400 mb-2">Remind me this many days before renewal:</p>
            <div className="flex gap-2">
              {DAYS_OPTIONS.map(d => (
                <button
                  key={d}
                  onClick={() => mutation.mutate({ renewalReminderDays: d })}
                  className={`px-4 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                    prefs.renewalReminderDays === d
                      ? 'bg-brand-500/20 border-brand-500/50 text-brand-400'
                      : 'bg-stone-800 border-stone-700 text-stone-400 hover:border-stone-500'
                  }`}
                >
                  {d} {d === 1 ? 'day' : 'days'}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Sale Reminders */}
      <section className="bg-stone-900 border border-stone-800 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell size={15} className="text-stone-400" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-stone-300">Sale Reminders</h2>
          </div>
          <Toggle
            checked={prefs.saleReminderEnabled}
            onChange={(v) => mutation.mutate({ saleReminderEnabled: v })}
          />
        </div>
        {prefs.saleReminderEnabled && (
          <div>
            <p className="text-xs text-stone-400 mb-2">Remind me this many days before a tracked sale opens:</p>
            <div className="flex gap-2">
              {DAYS_OPTIONS.map(d => (
                <button
                  key={d}
                  onClick={() => mutation.mutate({ saleReminderDays: d })}
                  className={`px-4 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                    prefs.saleReminderDays === d
                      ? 'bg-brand-500/20 border-brand-500/50 text-brand-400'
                      : 'bg-stone-800 border-stone-700 text-stone-400 hover:border-stone-500'
                  }`}
                >
                  {d} {d === 1 ? 'day' : 'days'}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* App Notifications */}
      <section className="bg-stone-900 border border-stone-800 rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Megaphone size={16} className="text-brand-400" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-stone-300">App Notifications</h2>
        </div>
        <p className="text-xs text-stone-500 -mt-2">
          Updates, bug fixes and important announcements from the LuxGrimoire team. Delivered immediately when sent.
        </p>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-stone-200">In-app</p>
              <p className="text-xs text-stone-500">Always shown in your notification bell</p>
            </div>
            <div className="relative w-10 h-5 rounded-full bg-brand-500 opacity-60 cursor-not-allowed">
              <span className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-white shadow" />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-stone-200">Push</p>
              <p className="text-xs text-stone-500">Send to this device</p>
            </div>
            <Toggle
              checked={reminderSettings?.appNotifPushEnabled ?? false}
              onChange={(v) => reminderMutation.mutate({ appNotifPushEnabled: v })}
            />
          </div>
        </div>
      </section>
    </div>
  )
}
