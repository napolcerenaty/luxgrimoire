'use client'

import { useState, useRef, useMemo } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/components/AuthProvider'
import { authFetch } from '@/lib/authFetch'
import { cloudinaryUrl } from '@/lib/cloudinary'
import { Camera, Loader2, Check } from 'lucide-react'
import FeeTemplateManager from '@/components/fees/FeeTemplateManager'
import WaitlistPanel from '@/components/subscriptions/WaitlistPanel'

interface UpdateProfilePayload {
  displayName?: string
  bio?: string
  avatar?: string
  preferredCurrency?: string
  timezone?: string
}

interface UpdateUsernamePayload {
  username: string
}

interface UploadResponse {
  publicId: string
  url: string
}

export default function ProfilePage() {
  const { user, login } = useAuth()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [displayName, setDisplayName] = useState(user?.displayName ?? '')
  const [bio, setBio] = useState('')
  const [preferredCurrency, setPreferredCurrency] = useState(user?.preferredCurrency ?? 'EUR')
  const [timezone, setTimezone] = useState(
    user?.timezone && user.timezone !== 'UTC'
      ? user.timezone
      : Intl.DateTimeFormat().resolvedOptions().timeZone
  )
  const [newUsername, setNewUsername] = useState(user?.username ?? '')
  const [profileSuccess, setProfileSuccess] = useState(false)

  const timezoneOptions = useMemo(() => {
    const now = new Date()
    function parseOffsetMinutes(offset: string): number {
      const match = offset.match(/GMT([+-])(\d+)(?::(\d+))?/)
      if (!match) return 0
      const sign = match[1] === '+' ? 1 : -1
      return sign * (parseInt(match[2]) * 60 + parseInt(match[3] ?? '0'))
    }
    return Intl.supportedValuesOf('timeZone')
      .map((tz) => {
        const offsetStr = new Intl.DateTimeFormat('en', { timeZone: tz, timeZoneName: 'shortOffset' })
          .formatToParts(now).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT'
        const abbrev = new Intl.DateTimeFormat('en', { timeZone: tz, timeZoneName: 'short' })
          .formatToParts(now).find((p) => p.type === 'timeZoneName')?.value ?? ''
        const extra = abbrev && abbrev !== offsetStr ? ` (${abbrev})` : ''
        return {
          tz,
          label: `${offsetStr} — ${tz.replace(/_/g, ' ')}${extra}`,
          offsetNum: parseOffsetMinutes(offsetStr),
        }
      })
      .sort((a, b) => a.offsetNum - b.offsetNum || a.tz.localeCompare(b.tz))
  }, [])
  const [usernameSuccess, setUsernameSuccess] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [usernameError, setUsernameError] = useState<string | null>(null)

  const [avatarPreview, setAvatarPreview] = useState<string | null>(
    user?.avatar ? cloudinaryUrl(user.avatar, 'w_200,h_200,c_fill,q_auto,f_auto') : null,
  )

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const token = typeof window !== 'undefined' ? localStorage.getItem('luxgrimoire_token') : null
      const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api'
      const formData = new FormData()
      formData.append('file', file)
      formData.append('folder', 'luxgrimoire/avatars')
      const res = await fetch(`${API_BASE}/upload/image`, {
        method: 'POST',
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: formData,
      })
      if (!res.ok) throw new Error(await res.text())
      return res.json() as Promise<UploadResponse>
    },
    onSuccess: async (data) => {
      setAvatarPreview(cloudinaryUrl(data.publicId, 'w_200,h_200,c_fill,q_auto,f_auto'))
      setUploadError(null)
      await updateProfileMutation.mutateAsync({ avatar: data.publicId })
    },
    onError: (e: Error) => setUploadError(e.message),
  })

  const updateProfileMutation = useMutation({
    mutationFn: (payload: UpdateProfilePayload) =>
      authFetch<{ user: typeof user }>('/profile', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    onSuccess: (data) => {
      if (data?.user && user) {
        const token = typeof window !== 'undefined' ? localStorage.getItem('luxgrimoire_token') : ''
        login(token ?? '', { ...user, ...data.user })
      }
      void queryClient.invalidateQueries({ queryKey: ['me'] })
      setProfileSuccess(true)
      setProfileError(null)
      setTimeout(() => setProfileSuccess(false), 3000)
    },
    onError: (e: Error) => setProfileError(e.message),
  })

  const updateUsernameMutation = useMutation({
    mutationFn: (payload: UpdateUsernamePayload) =>
      authFetch<{ user: typeof user }>('/profile/username', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    onSuccess: (data) => {
      if (data?.user && user) {
        const token = typeof window !== 'undefined' ? localStorage.getItem('luxgrimoire_token') : ''
        login(token ?? '', { ...user, ...data.user })
      }
      setUsernameSuccess(true)
      setUsernameError(null)
      setTimeout(() => setUsernameSuccess(false), 3000)
    },
    onError: (e: Error) => setUsernameError(e.message),
  })

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const preview = URL.createObjectURL(file)
    setAvatarPreview(preview)
    uploadMutation.mutate(file)
  }

  const handleProfileSave = (e: React.FormEvent) => {
    e.preventDefault()
    updateProfileMutation.mutate({ displayName, bio: bio || undefined, preferredCurrency, timezone })
  }

  const handleUsernameSave = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newUsername.trim()) return
    updateUsernameMutation.mutate({ username: newUsername.trim() })
  }

  if (!user) return null

  const initials = (user.displayName ?? user.username).slice(0, 2).toUpperCase()

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-serif font-bold text-stone-100">Profile</h1>
        <p className="text-stone-400 text-sm mt-1">Manage your account details</p>
      </div>

      {/* Avatar */}
      <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6 mb-6">
        <h2 className="font-serif font-semibold text-stone-100 mb-4">Avatar</h2>
        <div className="flex items-center gap-6">
          <div className="relative">
            <div className="w-20 h-20 rounded-full overflow-hidden bg-stone-800 border-2 border-stone-700">
              {avatarPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarPreview} alt={user.username} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xl font-serif font-bold text-amber-400">
                  {initials}
                </div>
              )}
            </div>
            {uploadMutation.isPending && (
              <div className="absolute inset-0 bg-stone-950/70 rounded-full flex items-center justify-center">
                <Loader2 size={20} className="text-amber-400 animate-spin" />
              </div>
            )}
          </div>
          <div>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadMutation.isPending}
              className="flex items-center gap-2 border border-stone-600 hover:border-amber-400 text-stone-300 hover:text-amber-400 px-4 py-2 rounded-xl text-sm transition-colors disabled:opacity-50"
            >
              <Camera size={14} />
              {uploadMutation.isPending ? 'Uploading…' : 'Change Avatar'}
            </button>
            {uploadError && <p className="text-xs text-red-400 mt-1">{uploadError}</p>}
            <p className="text-xs text-stone-500 mt-1">JPG, PNG or WEBP, max 5MB</p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarChange}
          />
        </div>
      </div>

      {/* Profile form */}
      <form onSubmit={handleProfileSave} className="bg-stone-900 border border-stone-800 rounded-2xl p-6 mb-6 space-y-4">
        <h2 className="font-serif font-semibold text-stone-100">Profile Info</h2>

        <div>
          <label className="block text-xs font-medium text-stone-400 mb-1.5">Email</label>
          <input
            type="email"
            disabled
            value={user.email}
            className="w-full bg-stone-800 border border-stone-700 text-stone-500 rounded-xl px-4 py-2.5 text-sm cursor-not-allowed"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-stone-400 mb-1.5">Display Name</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your display name"
            className="w-full bg-stone-800 border border-stone-700 text-stone-100 rounded-xl px-4 py-2.5 text-sm placeholder:text-stone-500 focus:outline-none focus:border-amber-400 transition-colors"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-stone-400 mb-1.5">Bio</label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Tell us about yourself…"
            rows={3}
            className="w-full bg-stone-800 border border-stone-700 text-stone-100 rounded-xl px-4 py-2.5 text-sm placeholder:text-stone-500 focus:outline-none focus:border-amber-400 transition-colors resize-none"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-stone-400 mb-1.5">Preferred Currency</label>
          <select
            value={preferredCurrency}
            onChange={(e) => setPreferredCurrency(e.target.value)}
            className="w-full bg-stone-800 border border-stone-700 text-stone-100 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-amber-400 transition-colors"
          >
            {[
              ['EUR', 'EUR — Euro'],
              ['USD', 'USD — US Dollar'],
              ['GBP', 'GBP — British Pound'],
              ['PLN', 'PLN — Polish Złoty'],
              ['CHF', 'CHF — Swiss Franc'],
              ['CZK', 'CZK — Czech Koruna'],
              ['SEK', 'SEK — Swedish Krona'],
              ['NOK', 'NOK — Norwegian Krone'],
              ['DKK', 'DKK — Danish Krone'],
              ['HUF', 'HUF — Hungarian Forint'],
              ['RON', 'RON — Romanian Leu'],
              ['CAD', 'CAD — Canadian Dollar'],
              ['AUD', 'AUD — Australian Dollar'],
              ['JPY', 'JPY — Japanese Yen'],
            ].map(([code, label]) => (
              <option key={code} value={code}>{label}</option>
            ))}
          </select>
          <p className="text-xs text-stone-500 mt-1">Used for spending statistics and cost summaries</p>
        </div>

        <div>
          <label className="block text-xs font-medium text-stone-400 mb-1.5">Timezone</label>
          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="w-full bg-stone-800 border border-stone-700 text-stone-100 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-amber-400 transition-colors"
          >
            {timezoneOptions.map(({ tz, label }) => (
              <option key={tz} value={tz}>{label}</option>
            ))}
          </select>
          <p className="text-xs text-stone-500 mt-1">Used for skip deadlines and renewal date display</p>
        </div>

        {profileError && (
          <p className="text-xs text-red-400 bg-red-950/30 border border-red-900 rounded-lg px-3 py-2">
            {profileError}
          </p>
        )}

        <button
          type="submit"
          disabled={updateProfileMutation.isPending}
          className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-stone-950 font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors"
        >
          {updateProfileMutation.isPending ? (
            <><Loader2 size={14} className="animate-spin" /> Saving…</>
          ) : profileSuccess ? (
            <><Check size={14} /> Saved!</>
          ) : (
            'Save Changes'
          )}
        </button>
      </form>

      {/* Change username */}
      <form onSubmit={handleUsernameSave} className="bg-stone-900 border border-stone-800 rounded-2xl p-6 space-y-4 mb-6">
        <div>
          <h2 className="font-serif font-semibold text-stone-100">Change Username</h2>
          <p className="text-xs text-stone-400 mt-1">
            Changing your username may break existing links to your profile.
          </p>
        </div>

        <div>
          <label className="block text-xs font-medium text-stone-400 mb-1.5">Username</label>
          <input
            type="text"
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value)}
            placeholder={user.username}
            className="w-full bg-stone-800 border border-stone-700 text-stone-100 rounded-xl px-4 py-2.5 text-sm placeholder:text-stone-500 focus:outline-none focus:border-amber-400 transition-colors"
          />
        </div>

        {usernameError && (
          <p className="text-xs text-red-400 bg-red-950/30 border border-red-900 rounded-lg px-3 py-2">
            {usernameError}
          </p>
        )}

        <button
          type="submit"
          disabled={updateUsernameMutation.isPending || newUsername === user.username}
          className="flex items-center gap-2 border border-amber-500/50 hover:border-amber-400 text-amber-400 hover:bg-amber-500/10 disabled:opacity-50 disabled:cursor-not-allowed font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors"
        >
          {updateUsernameMutation.isPending ? (
            <><Loader2 size={14} className="animate-spin" /> Updating…</>
          ) : usernameSuccess ? (
            <><Check size={14} /> Updated!</>
          ) : (
            'Update Username'
          )}
        </button>
      </form>
      {/* Fee Templates */}
      <FeeTemplateManager />

      {/* Waitlist */}
      <WaitlistPanel />
    </div>
  )
}
