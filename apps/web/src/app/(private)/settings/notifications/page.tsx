'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Bell, BellOff, RefreshCw, Megaphone, Heart } from 'lucide-react'
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
  newEditionFollowInAppEnabled: boolean
  newEditionFollowPushEnabled: boolean
}

const DAYS_OPTIONS = [1, 3, 7]

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative w-10 h-5 rounded-full transition-colors ${checked ? 'bg-brand-500' : 'bg-navy-700'}`}
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
        <div className="h-8 bg-navy-800 rounded-lg w-48 animate-pulse" />
        <div className="h-32 bg-navy-800 rounded-2xl animate-pulse" />
      </div>
    )
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-10 space-y-8">
      <div>
        <h1 className="text-2xl font-serif text-navy-100">Notification Settings</h1>
        <p className="text-sm text-navy-400 mt-1">Control when and how you receive notifications.</p>
      </div>

      {/* Push Notifications */}
      <section className="bg-navy-900 border border-navy-800 rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Bell size={16} className="text-brand-400" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-navy-300">Push Notifications</h2>
        </div>

        {!isSupported ? (
          <p className="text-sm text-navy-500">Push notifications are not supported in your browser.</p>
        ) : permission === 'denied' ? (
          <p className="text-sm text-navy-500">
            Push notifications are blocked. Enable them in your browser settings, then refresh.
          </p>
        ) : (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-navy-200">
                {isSubscribed ? 'Push notifications are enabled on this device.' : 'Receive notifications on this device.'}
              </p>
              <p className="text-xs text-navy-500 mt-0.5">
                {isSubscribed ? 'You\'ll receive push alerts for renewals and sales.' : 'Works in browser and when installed as an app.'}
              </p>
            </div>
            <button
              onClick={isSubscribed ? unsubscribe : subscribe}
              disabled={pushLoading}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                isSubscribed
                  ? 'bg-navy-700 hover:bg-navy-600 text-navy-200'
                  : 'bg-brand-500 hover:bg-brand-400 text-navy-950'
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
      <section className="bg-navy-900 border border-navy-800 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-base">🔄</span>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-navy-300">Renewal Reminders</h2>
          </div>
          <Toggle
            checked={prefs.renewalReminderEnabled}
            onChange={(v) => mutation.mutate({ renewalReminderEnabled: v })}
          />
        </div>
        {prefs.renewalReminderEnabled && (
          <div>
            <p className="text-xs text-navy-400 mb-2">Remind me this many days before renewal:</p>
            <div className="flex gap-2">
              {DAYS_OPTIONS.map(d => (
                <button
                  key={d}
                  onClick={() => mutation.mutate({ renewalReminderDays: d })}
                  className={`px-4 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                    prefs.renewalReminderDays === d
                      ? 'bg-brand-500/20 border-brand-500/50 text-brand-400'
                      : 'bg-navy-800 border-navy-700 text-navy-400 hover:border-navy-500'
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
      <section className="bg-navy-900 border border-navy-800 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell size={15} className="text-navy-400" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-navy-300">Sale Reminders</h2>
          </div>
          <Toggle
            checked={prefs.saleReminderEnabled}
            onChange={(v) => mutation.mutate({ saleReminderEnabled: v })}
          />
        </div>
        {prefs.saleReminderEnabled && (
          <div>
            <p className="text-xs text-navy-400 mb-2">Remind me this many days before a tracked sale opens:</p>
            <div className="flex gap-2">
              {DAYS_OPTIONS.map(d => (
                <button
                  key={d}
                  onClick={() => mutation.mutate({ saleReminderDays: d })}
                  className={`px-4 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                    prefs.saleReminderDays === d
                      ? 'bg-brand-500/20 border-brand-500/50 text-brand-400'
                      : 'bg-navy-800 border-navy-700 text-navy-400 hover:border-navy-500'
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
      <section className="bg-navy-900 border border-navy-800 rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Megaphone size={16} className="text-brand-400" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-navy-300">App Notifications</h2>
        </div>
        <p className="text-xs text-navy-500 -mt-2">
          Updates, bug fixes and important announcements from the LuxGrimoire team. Delivered immediately when sent.
        </p>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-navy-200">In-app</p>
              <p className="text-xs text-navy-500">Always shown in your notification bell</p>
            </div>
            <div className="relative w-10 h-5 rounded-full bg-brand-500 opacity-60 cursor-not-allowed">
              <span className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-white shadow" />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-navy-200">Push</p>
              <p className="text-xs text-navy-500">Send to this device</p>
            </div>
            <Toggle
              checked={reminderSettings?.appNotifPushEnabled ?? false}
              onChange={(v) => reminderMutation.mutate({ appNotifPushEnabled: v })}
            />
          </div>
        </div>
      </section>

      {/* New Editions from Follows */}
      <section className="bg-navy-900 border border-navy-800 rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Heart size={16} className="text-brand-400" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-navy-300">New Editions from Follows</h2>
        </div>
        <p className="text-xs text-navy-500 -mt-2">
          When a new edition appears for an artist, author, or book you follow. Choose how you want to hear about it —
          following is itself the opt-in, so at least one channel stays useful.
        </p>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-navy-200">In-app</p>
              <p className="text-xs text-navy-500">Shown in your notification bell</p>
            </div>
            <Toggle
              checked={reminderSettings?.newEditionFollowInAppEnabled ?? true}
              onChange={(v) => reminderMutation.mutate({ newEditionFollowInAppEnabled: v })}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-navy-200">Push</p>
              <p className="text-xs text-navy-500">Send to this device</p>
            </div>
            <Toggle
              checked={reminderSettings?.newEditionFollowPushEnabled ?? true}
              onChange={(v) => reminderMutation.mutate({ newEditionFollowPushEnabled: v })}
            />
          </div>
        </div>
      </section>
    </div>
  )
}
