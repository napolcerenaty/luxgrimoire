'use client'

import { useState, useRef, useMemo, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/components/AuthProvider'
import { authFetch } from '@/lib/authFetch'
import { cloudinaryUrl } from '@/lib/cloudinary'
import { useRouter } from 'next/navigation'
import { Camera, Loader2, Check, User, Settings, CreditCard, BookOpen, Trash2, AlertTriangle, Image } from 'lucide-react'
import FeeTemplateManager from '@/components/fees/FeeTemplateManager'
import WaitlistPanel from '@/components/subscriptions/WaitlistPanel'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api'

interface CommunityPhoto {
  id: string
  cloudinaryId: string
  url: string
  status: 'PENDING' | 'APPROVED'
  instagramHandle: string | null
  createdAt: string
  edition: {
    slug: string
    editionName: string | null
    bookBoxCompany: { name: string } | null
  }
}

interface UpdateProfilePayload {
  displayName?: string
  bio?: string
  avatar?: string
  preferredCurrency?: string
  timezone?: string
  timeFormat?: string
  shippingCountry?: string
}

interface UpdateUsernamePayload {
  username: string
}

interface UploadResponse {
  publicId: string
  url: string
}

type Tab = 'profile' | 'account' | 'preferences' | 'subscriptions' | 'photos'

const TAB_CONFIG: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'account', label: 'Account', icon: Settings },
  { id: 'preferences', label: 'Preferences', icon: CreditCard },
  { id: 'subscriptions', label: 'Subscriptions & Fees', icon: BookOpen },
  { id: 'photos', label: 'My Photos', icon: Image },
]

const INPUT = 'w-full bg-stone-800 border border-stone-700 text-stone-100 rounded-xl px-4 py-2.5 text-sm placeholder:text-stone-500 focus:outline-none focus:border-amber-400 transition-colors'
const LABEL = 'block text-xs font-medium text-stone-400 mb-1.5'

const COUNTRIES: [string, string][] = [
  ['AL', 'Albania'], ['AD', 'Andorra'], ['AT', 'Austria'], ['BY', 'Belarus'],
  ['BE', 'Belgium'], ['BA', 'Bosnia and Herzegovina'], ['BG', 'Bulgaria'],
  ['HR', 'Croatia'], ['CY', 'Cyprus'], ['CZ', 'Czech Republic'],
  ['DK', 'Denmark'], ['EE', 'Estonia'], ['FI', 'Finland'], ['FR', 'France'],
  ['DE', 'Germany'], ['GR', 'Greece'], ['HU', 'Hungary'], ['IS', 'Iceland'],
  ['IE', 'Ireland'], ['IT', 'Italy'], ['LV', 'Latvia'], ['LI', 'Liechtenstein'],
  ['LT', 'Lithuania'], ['LU', 'Luxembourg'], ['MT', 'Malta'], ['MD', 'Moldova'],
  ['MC', 'Monaco'], ['ME', 'Montenegro'], ['NL', 'Netherlands'], ['MK', 'North Macedonia'],
  ['NO', 'Norway'], ['PL', 'Poland'], ['PT', 'Portugal'], ['RO', 'Romania'],
  ['RU', 'Russia'], ['SM', 'San Marino'], ['RS', 'Serbia'], ['SK', 'Slovakia'],
  ['SI', 'Slovenia'], ['ES', 'Spain'], ['SE', 'Sweden'], ['CH', 'Switzerland'],
  ['UA', 'Ukraine'], ['GB', 'United Kingdom'], ['VA', 'Vatican City'],
  ['AU', 'Australia'], ['CA', 'Canada'], ['CN', 'China'], ['IN', 'India'],
  ['JP', 'Japan'], ['MX', 'Mexico'], ['NZ', 'New Zealand'], ['US', 'United States'],
  ['AR', 'Argentina'], ['BR', 'Brazil'], ['ZA', 'South Africa'],
]

export default function ProfilePage() {
  const { user, login, logout } = useAuth()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<Tab>('profile')

  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const DELETE_PHRASE = 'yes i want to delete my account'

  const [displayName, setDisplayName] = useState(user?.displayName ?? '')
  const [bio, setBio] = useState(user?.bio ?? '')
  const [preferredCurrency, setPreferredCurrency] = useState(user?.preferredCurrency ?? 'EUR')
  const [shippingCountry, setShippingCountry] = useState(user?.shippingCountry ?? '')
  const [timezone, setTimezone] = useState(
    user?.timezone && user.timezone !== 'UTC'
      ? user.timezone
      : Intl.DateTimeFormat().resolvedOptions().timeZone
  )
  const [timeFormat, setTimeFormat] = useState(user?.timeFormat ?? '24h')
  const [newUsername, setNewUsername] = useState(user?.username ?? '')

  const [profileSuccess, setProfileSuccess] = useState(false)
  const [prefsSuccess, setPrefsSuccess] = useState(false)
  const [usernameSuccess, setUsernameSuccess] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [prefsError, setPrefsError] = useState<string | null>(null)
  const [usernameError, setUsernameError] = useState<string | null>(null)

  const [avatarPreview, setAvatarPreview] = useState<string | null>(
    user?.avatar ? cloudinaryUrl(user.avatar, 'w_200,h_200,c_fill,q_auto,f_auto') : null,
  )

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

  const updateProfileMutation = useMutation({
    mutationFn: (payload: UpdateProfilePayload) =>
      authFetch<typeof user>('/profile', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    onSuccess: (data, variables) => {
      if (data && user) {
        login({ ...user, ...data })
      }
      void queryClient.invalidateQueries({ queryKey: ['me'] })
      if ('preferredCurrency' in variables || 'timezone' in variables || 'shippingCountry' in variables || 'timeFormat' in variables) {
        setPrefsSuccess(true)
        setPrefsError(null)
        setTimeout(() => setPrefsSuccess(false), 3000)
      } else {
        setProfileSuccess(true)
        setProfileError(null)
        setTimeout(() => setProfileSuccess(false), 3000)
      }
    },
    onError: (e: Error, variables) => {
      if ('preferredCurrency' in variables || 'timezone' in variables || 'shippingCountry' in variables || 'timeFormat' in variables) {
        setPrefsError(e.message)
      } else {
        setProfileError(e.message)
      }
    },
  })

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const dataUri = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = () => reject(new Error('Failed to read file'))
        reader.readAsDataURL(file)
      })
      const res = await fetch(`${API_BASE}/upload/avatar`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: dataUri }),
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

  const updateUsernameMutation = useMutation({
    mutationFn: (payload: UpdateUsernamePayload) =>
      authFetch<{ id: string; username: string; email: string; updatedAt: string }>('/profile/username', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    onSuccess: (data) => {
      if (data && user) {
        login({ ...user, ...data })
      }
      setUsernameSuccess(true)
      setUsernameError(null)
      setTimeout(() => setUsernameSuccess(false), 3000)
    },
    onError: (e: Error) => setUsernameError(e.message),
  })

  const deleteAccountMutation = useMutation({
    mutationFn: () => authFetch<{ ok: boolean }>('/profile/account', { method: 'DELETE' }),
    onSuccess: () => {
      logout()
      router.push('/')
    },
  })

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarPreview(URL.createObjectURL(file))
    uploadMutation.mutate(file)
  }

  if (!user) return null

  const initials = (user.displayName ?? user.username).slice(0, 2).toUpperCase()

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-serif font-bold text-stone-100">Settings</h1>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-stone-900 border border-stone-800 rounded-2xl p-1 mb-6">
        {TAB_CONFIG.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
              activeTab === id
                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                : 'text-stone-400 hover:text-stone-200 hover:bg-stone-800'
            }`}
          >
            <Icon size={14} />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {/* Profile tab */}
      {activeTab === 'profile' && (
        <div className="space-y-6">
          <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6">
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
                  {uploadMutation.isPending ? 'Uploading...' : 'Change Avatar'}
                </button>
                {uploadError && <p className="text-xs text-red-400 mt-1">{uploadError}</p>}
                <p className="text-xs text-stone-500 mt-1">JPG, PNG or WEBP, max 5MB</p>
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
            </div>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              updateProfileMutation.mutate({ displayName, bio: bio || undefined })
            }}
            className="bg-stone-900 border border-stone-800 rounded-2xl p-6 space-y-4"
          >
            <h2 className="font-serif font-semibold text-stone-100">Public Info</h2>
            <div>
              <label className={LABEL}>Display Name</label>
              <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Your display name" className={INPUT} />
            </div>
            <div>
              <label className={LABEL}>Bio</label>
              <textarea value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Tell us about yourself..." rows={3} className={`${INPUT} resize-none`} />
            </div>
            {profileError && (
              <p className="text-xs text-red-400 bg-red-950/30 border border-red-900 rounded-lg px-3 py-2">{profileError}</p>
            )}
            <button type="submit" disabled={updateProfileMutation.isPending} className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-stone-950 font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors">
              {updateProfileMutation.isPending ? <><Loader2 size={14} className="animate-spin" /> Saving...</> : profileSuccess ? <><Check size={14} /> Saved!</> : 'Save Changes'}
            </button>
          </form>
        </div>
      )}

      {/* Account tab */}
      {activeTab === 'account' && (
        <div className="space-y-6">
          <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6">
            <h2 className="font-serif font-semibold text-stone-100 mb-4">Email</h2>
            <p className="text-xs text-stone-500 mb-3">Your email address cannot be changed here.</p>
            <input type="email" disabled value={user.email} className="w-full bg-stone-800 border border-stone-700 text-stone-500 rounded-xl px-4 py-2.5 text-sm cursor-not-allowed" />
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (!newUsername.trim()) return
              updateUsernameMutation.mutate({ username: newUsername.trim() })
            }}
            className="bg-stone-900 border border-stone-800 rounded-2xl p-6 space-y-4"
          >
            <div>
              <h2 className="font-serif font-semibold text-stone-100">Change Username</h2>
              <p className="text-xs text-stone-400 mt-1">Changing your username may break existing links to your profile.</p>
            </div>
            <div>
              <label className={LABEL}>Username</label>
              <input type="text" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} placeholder={user.username} className={INPUT} />
            </div>
            {usernameError && (
              <p className="text-xs text-red-400 bg-red-950/30 border border-red-900 rounded-lg px-3 py-2">{usernameError}</p>
            )}
            <button type="submit" disabled={updateUsernameMutation.isPending || newUsername === user.username} className="flex items-center gap-2 border border-amber-500/50 hover:border-amber-400 text-amber-400 hover:bg-amber-500/10 disabled:opacity-50 disabled:cursor-not-allowed font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors">
              {updateUsernameMutation.isPending ? <><Loader2 size={14} className="animate-spin" /> Updating...</> : usernameSuccess ? <><Check size={14} /> Updated!</> : 'Update Username'}
            </button>
          </form>

          {/* Delete Account */}
          <div className="bg-stone-900 border border-red-900/40 rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-red-400 shrink-0" />
              <h2 className="font-serif font-semibold text-red-400">Delete Account</h2>
            </div>
            <p className="text-sm text-stone-400">
              This will permanently delete your account and all associated data — collection, wishlist, subscriptions, spending history, and more.{' '}
              <strong className="text-stone-200">This action cannot be undone.</strong>
            </p>
            <div>
              <label className={LABEL}>
                Type <span className="text-red-400 font-mono text-xs">{DELETE_PHRASE}</span> to confirm
              </label>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder={DELETE_PHRASE}
                className="w-full bg-stone-800 border border-red-900/50 text-stone-100 rounded-xl px-4 py-2.5 text-sm placeholder:text-stone-600 focus:outline-none focus:border-red-500 transition-colors"
              />
            </div>
            {deleteAccountMutation.isError && (
              <p className="text-xs text-red-400 bg-red-950/30 border border-red-900 rounded-lg px-3 py-2">
                {(deleteAccountMutation.error as Error).message}
              </p>
            )}
            <button
              onClick={() => deleteAccountMutation.mutate()}
              disabled={deleteConfirmText !== DELETE_PHRASE || deleteAccountMutation.isPending}
              className="flex items-center gap-2 bg-red-900 hover:bg-red-800 disabled:opacity-40 disabled:cursor-not-allowed text-red-200 font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors"
            >
              {deleteAccountMutation.isPending
                ? <><Loader2 size={14} className="animate-spin" /> Deleting…</>
                : <><Trash2 size={14} /> Delete My Account</>}
            </button>
          </div>
        </div>
      )}

      {/* Preferences tab */}
      {activeTab === 'preferences' && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            updateProfileMutation.mutate({ preferredCurrency, timezone, timeFormat, shippingCountry: shippingCountry.toUpperCase() || undefined })
          }}
          className="bg-stone-900 border border-stone-800 rounded-2xl p-6 space-y-5"
        >
          <h2 className="font-serif font-semibold text-stone-100">Preferences</h2>
          <div>
            <label className={LABEL}>Preferred Currency</label>
            <select value={preferredCurrency} onChange={(e) => setPreferredCurrency(e.target.value)} className={INPUT}>
              {[
                ['EUR', 'EUR - Euro'],
                ['USD', 'USD - US Dollar'],
                ['GBP', 'GBP - British Pound'],
                ['PLN', 'PLN - Polish Zloty'],
                ['CHF', 'CHF - Swiss Franc'],
                ['CZK', 'CZK - Czech Koruna'],
                ['SEK', 'SEK - Swedish Krona'],
                ['NOK', 'NOK - Norwegian Krone'],
                ['DKK', 'DKK - Danish Krone'],
                ['HUF', 'HUF - Hungarian Forint'],
                ['RON', 'RON - Romanian Leu'],
                ['CAD', 'CAD - Canadian Dollar'],
                ['AUD', 'AUD - Australian Dollar'],
                ['JPY', 'JPY - Japanese Yen'],
              ].map(([code, label]) => (
                <option key={code} value={code}>{label}</option>
              ))}
            </select>
            <p className="text-xs text-stone-500 mt-1">Used for spending statistics and cost summaries</p>
          </div>
          <div>
            <label className={LABEL}>Default Shipping Country</label>
            <select value={shippingCountry} onChange={(e) => setShippingCountry(e.target.value)} className={INPUT}>
              <option value="">— None —</option>
              {COUNTRIES.map(([code, name]) => (
                <option key={code} value={code}>{name}</option>
              ))}
            </select>
            <p className="text-xs text-stone-500 mt-1">Used as default when adding subscription shipping costs</p>
          </div>
          <div>
            <label className={LABEL}>Timezone</label>
            <select value={timezone} onChange={(e) => setTimezone(e.target.value)} className={INPUT}>
              {timezoneOptions.map(({ tz, label }) => (
                <option key={tz} value={tz}>{label}</option>
              ))}
            </select>
            <p className="text-xs text-stone-500 mt-1">Used for skip deadlines and renewal date display</p>
          </div>
          <div>
            <label className={LABEL}>Time Format</label>
            <div className="flex gap-3">
              {([['24h', '24-hour (e.g. 14:30)'], ['12h', '12-hour (e.g. 2:30 PM)']] as [string, string][]).map(([val, desc]) => (
                <label key={val} className={`flex-1 flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                  timeFormat === val
                    ? 'border-amber-500/50 bg-amber-500/10 text-amber-400'
                    : 'border-stone-700 bg-stone-800/50 text-stone-400 hover:border-stone-600'
                }`}>
                  <input type="radio" name="timeFormat" value={val} checked={timeFormat === val}
                    onChange={() => setTimeFormat(val)} className="accent-amber-400" />
                  <div>
                    <div className="text-sm font-medium">{val.toUpperCase()}</div>
                    <div className="text-xs text-stone-500">{desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
          {prefsError && (
            <p className="text-xs text-red-400 bg-red-950/30 border border-red-900 rounded-lg px-3 py-2">{prefsError}</p>
          )}
          <button type="submit" disabled={updateProfileMutation.isPending} className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-stone-950 font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors">
            {updateProfileMutation.isPending ? <><Loader2 size={14} className="animate-spin" /> Saving...</> : prefsSuccess ? <><Check size={14} /> Saved!</> : 'Save Preferences'}
          </button>
        </form>
      )}

      {/* Subscriptions & Fees tab */}
      {activeTab === 'subscriptions' && (
        <div className="space-y-6">
          <FeeTemplateManager />
          <WaitlistPanel />
        </div>
      )}

      {/* My Photos tab */}
      {activeTab === 'photos' && <MyCommunityPhotos />}
    </div>
  )
}

function MyCommunityPhotos() {
  const [photos, setPhotos] = useState<CommunityPhoto[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`${API_BASE}/profile/community-images`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then((data: CommunityPhoto[]) => setPhotos(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const toggle = (id: string) =>
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const toggleAll = () =>
    setSelected(prev => prev.size === photos.length ? new Set() : new Set(photos.map(p => p.id)))

  const deleteSelected = async () => {
    if (!selected.size) return
    if (!confirm(`Delete ${selected.size} photo${selected.size > 1 ? 's' : ''}? This cannot be undone.`)) return
    setDeleting(true)
    setError(null)
    const ids = [...selected]
    const results = await Promise.allSettled(
      ids.map(id =>
        fetch(`${API_BASE}/profile/community-images/${id}`, { method: 'DELETE', credentials: 'include' })
      )
    )
    const failed = results.filter(r => r.status === 'rejected').length
    if (failed > 0) setError(`${failed} photo${failed > 1 ? 's' : ''} could not be deleted.`)
    const succeeded = ids.filter((_, i) => results[i].status === 'fulfilled')
    setPhotos(prev => prev.filter(p => !succeeded.includes(p.id)))
    setSelected(new Set())
    setDeleting(false)
  }

  if (loading) return (
    <div className="grid grid-cols-6 gap-2">
      {[...Array(12)].map((_, i) => (
        <div key={i} className="aspect-[2/3] rounded-lg bg-stone-800 animate-pulse" />
      ))}
    </div>
  )

  if (photos.length === 0) return (
    <div className="bg-stone-900 border border-stone-800 rounded-2xl p-8 text-center text-stone-500">
      <p className="text-sm">You haven&apos;t submitted any community photos yet.</p>
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="bg-stone-900 border border-stone-800 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-serif font-semibold text-stone-100">My Community Photos</h2>
          <div className="flex items-center gap-3">
            <button
              onClick={toggleAll}
              className="text-xs text-stone-400 hover:text-stone-200 transition-colors"
            >
              {selected.size === photos.length ? 'Deselect all' : 'Select all'}
            </button>
            {selected.size > 0 && (
              <button
                onClick={() => void deleteSelected()}
                disabled={deleting}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-900/60 hover:bg-red-800 text-red-200 disabled:opacity-50 transition-colors"
              >
                {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                Delete {selected.size} selected
              </button>
            )}
          </div>
        </div>

        {error && <p className="text-xs text-red-400 mb-3">{error}</p>}

        <div className="grid grid-cols-6 gap-2">
          {photos.map(photo => {
            const isSelected = selected.has(photo.id)
            const thumb = cloudinaryUrl(photo.cloudinaryId, 'w_120,h_180,c_fill,q_auto,f_auto')
            const editionLabel = photo.edition.editionName ?? photo.edition.bookBoxCompany?.name ?? 'Edition'
            return (
              <div
                key={photo.id}
                onClick={() => toggle(photo.id)}
                className={`relative cursor-pointer rounded-lg overflow-hidden aspect-[2/3] ring-2 transition-all ${
                  isSelected ? 'ring-amber-500 ring-offset-2 ring-offset-stone-900' : 'ring-transparent hover:ring-stone-600'
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={thumb ?? photo.url} alt={editionLabel} className="w-full h-full object-cover" />
                {/* Status badge */}
                {photo.status === 'PENDING' && (
                  <span className="absolute top-1 left-1 px-1 py-0.5 rounded-full text-[7px] font-semibold bg-amber-500/80 text-stone-950">
                    Pending
                  </span>
                )}
                {/* Selection overlay */}
                {isSelected && (
                  <div className="absolute inset-0 bg-amber-500/20 flex items-center justify-center">
                    <div className="w-4 h-4 rounded-full bg-amber-500 flex items-center justify-center">
                      <Check size={10} className="text-stone-950" />
                    </div>
                  </div>
                )}
                {/* Edition label */}
                <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-stone-950/90 to-transparent px-1 py-1">
                  <a
                    href={`/editions/${photo.edition.slug}`}
                    onClick={e => e.stopPropagation()}
                    className="text-[8px] text-stone-200 hover:text-amber-400 transition-colors line-clamp-1 leading-tight"
                  >
                    {editionLabel}
                  </a>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
