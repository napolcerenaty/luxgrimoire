'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { DollarSign, ShoppingBag, BookOpen, Sparkles, X } from 'lucide-react'
import { authFetch } from '@/lib/authFetch'

interface StatsSettings {
  spending: boolean
  sales: boolean
  reading: boolean
  features: boolean
}

const SETTINGS_CONFIG = [
  {
    key: 'spending' as keyof StatsSettings,
    icon: DollarSign,
    title: 'Book spending',
    offMessage: "I'd rather not know how much I've spent on books 💸",
    onMessage: 'Show me the damage 📊',
  },
  {
    key: 'sales' as keyof StatsSettings,
    icon: ShoppingBag,
    title: 'Book sales',
    offMessage: "I don't sell my books 📦",
    onMessage: 'Track my sales & P&L 💰',
  },
  {
    key: 'reading' as keyof StatsSettings,
    icon: BookOpen,
    title: 'Reading tracker',
    offMessage: "I'm not tracking my reading journey 📖",
    onMessage: 'Track my reading progress 📚',
  },
  {
    key: 'features' as keyof StatsSettings,
    icon: Sparkles,
    title: 'Special features',
    offMessage: "Special features aren't my thing ✨",
    onMessage: 'Show feature analytics 🔍',
  },
]

interface StatsSettingsPanelProps {
  onClose?: () => void
}

export default function StatsSettingsPanel({ onClose }: StatsSettingsPanelProps) {
  const queryClient = useQueryClient()

  const { data: settings, isLoading } = useQuery<StatsSettings>({
    queryKey: ['stats-settings'],
    queryFn: () => authFetch('/stats/settings'),
    staleTime: 5 * 60_000,
  })

  const mutation = useMutation({
    mutationFn: (patch: Partial<StatsSettings>) =>
      authFetch<StatsSettings>('/stats/settings', { method: 'PATCH', body: JSON.stringify(patch) }),
    onSuccess: (data) => {
      queryClient.setQueryData(['stats-settings'], data)
      void queryClient.invalidateQueries({ queryKey: ['stats-collection'] })
      void queryClient.invalidateQueries({ queryKey: ['stats-spending'] })
      void queryClient.invalidateQueries({ queryKey: ['stats-sales'] })
      void queryClient.invalidateQueries({ queryKey: ['stats-features'] })
    },
  })

  const toggle = (key: keyof StatsSettings) => {
    if (!settings) return
    mutation.mutate({ [key]: !settings[key] })
  }

  const current: StatsSettings = settings ?? { spending: true, sales: true, reading: true, features: true }

  if (isLoading) return <div className="p-6 text-sm text-stone-500 animate-pulse">Loading settings…</div>

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-stone-800">
        <div>
          <h2 className="text-base font-serif font-semibold text-stone-100">Your stats, your way</h2>
          <p className="text-xs text-stone-500 mt-0.5">Choose what you want to see in your statistics</p>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-stone-500 hover:text-stone-300 transition-colors p-1">
            <X size={16} />
          </button>
        )}
      </div>
      <div className="px-6 pb-6 pt-3 space-y-3">
        {SETTINGS_CONFIG.map(({ key, icon: Icon, title, onMessage, offMessage }) => {
          const isOn = current[key]
          return (
            <button
              key={key}
              onClick={() => toggle(key)}
              disabled={mutation.isPending}
              className={`w-full text-left p-4 rounded-2xl border transition-all ${
                isOn
                  ? 'bg-stone-900 border-stone-700 hover:border-stone-600'
                  : 'bg-stone-950 border-stone-800 hover:border-stone-700 opacity-70'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`mt-0.5 p-1.5 rounded-lg ${isOn ? 'bg-amber-500/10 text-amber-400' : 'bg-stone-800 text-stone-600'}`}>
                  <Icon size={14} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-sm font-medium ${isOn ? 'text-stone-200' : 'text-stone-500'}`}>{title}</span>
                    <div className={`shrink-0 w-9 h-5 rounded-full transition-colors relative ${isOn ? 'bg-amber-500' : 'bg-stone-700'}`}>
                      <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${isOn ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
                    </div>
                  </div>
                  <p className={`text-xs mt-1 italic ${isOn ? 'text-stone-400' : 'text-amber-600/70'}`}>
                    {isOn ? onMessage : offMessage}
                  </p>
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
