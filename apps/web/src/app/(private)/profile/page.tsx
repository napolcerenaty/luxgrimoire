'use client'

import { useState, useRef, useMemo, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/components/AuthProvider'
import { authFetch, API_BASE } from '@/lib/authFetch'
import { cloudinaryUrl } from '@/lib/cloudinary'
import StatsSettingsPanel from '@/components/stats/StatsSettingsPanel'
import { useRouter } from 'next/navigation'
import { Camera, Loader2, Check, User, Settings, CreditCard, BookOpen, Trash2, AlertTriangle, Image, PlayCircle, Upload, BookMarked, Bell } from 'lucide-react'
import FeeTemplateManager from '@/components/fees/FeeTemplateManager'
import WaitlistPanel from '@/components/subscriptions/WaitlistPanel'
import { CURRENCIES_LABELED } from '@/lib/currencies'
import { usePushNotifications } from '@/hooks/usePushNotifications'



interface CommunityPhoto {
  id: string
  cloudinaryId: string
  url: string
  status: 'PENDING' | 'APPROVED'
  instagramHandle: string | null
  createdAt: string
  edition: {
    slug: string
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

type Tab = 'profile' | 'account' | 'preferences' | 'subscriptions' | 'notifications' | 'photos' | 'import'

const TAB_CONFIG: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'account', label: 'Account', icon: Settings },
  { id: 'preferences', label: 'Preferences', icon: CreditCard },
  { id: 'subscriptions', label: 'Taxes & Fees', icon: BookOpen },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'photos', label: 'My Photos', icon: Image },
  { id: 'import', label: 'Import', icon: Upload },
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
  const [mobileShowContent, setMobileShowContent] = useState(false)

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

  const restartTutorialMutation = useMutation({
    mutationFn: () => authFetch('/auth/onboarding', { method: 'PATCH', body: JSON.stringify({ completed: false }) }),
    onSuccess: async () => {
      const r = await fetch(`${API_BASE}/auth/me`, { credentials: 'include' })
      if (r.ok) login(await r.json())
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
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-serif font-bold text-stone-100">Settings</h1>
      </div>

      <div className="flex gap-6 items-start">
        {/* Sidebar nav */}
        <nav className={`w-52 shrink-0 bg-stone-900 border border-stone-800 rounded-2xl p-2 ${mobileShowContent ? 'hidden md:block' : 'block w-full md:w-52'}`}>
          {TAB_CONFIG.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => { setActiveTab(id); setMobileShowContent(true) }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors text-left ${
                activeTab === id
                  ? 'bg-amber-500/10 text-amber-400'
                  : 'text-stone-400 hover:text-stone-200 hover:bg-stone-800'
              }`}
            >
              <Icon size={15} className="shrink-0" />
              {label}
            </button>
          ))}
        </nav>

        {/* Content panel */}
        <div className={`flex-1 min-w-0 ${!mobileShowContent ? 'hidden md:block' : 'block'}`}>
          {/* Back button — mobile only */}
          <button
            onClick={() => setMobileShowContent(false)}
            className="md:hidden flex items-center gap-1.5 text-sm text-stone-400 hover:text-stone-200 mb-4 transition-colors"
          >
            ← Settings
          </button>

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

          {/* Restart Tutorial */}
          <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6 space-y-3">
            <div className="flex items-center gap-2">
              <PlayCircle size={16} className="text-amber-400 shrink-0" />
              <h2 className="font-serif font-semibold text-stone-100">Tutorial</h2>
            </div>
            <p className="text-sm text-stone-400">
              Want to see the getting started wizard again? Restart it any time.
            </p>
            <button
              onClick={() => restartTutorialMutation.mutate()}
              disabled={restartTutorialMutation.isPending}
              className="flex items-center gap-2 border border-amber-500/50 hover:border-amber-400 text-amber-400 hover:bg-amber-500/10 disabled:opacity-50 disabled:cursor-not-allowed font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors"
            >
              {restartTutorialMutation.isPending
                ? <><Loader2 size={14} className="animate-spin" /> Restarting…</>
                : <><PlayCircle size={14} /> Restart Tutorial</>}
            </button>
          </div>

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
        <div className="space-y-6">
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
                {CURRENCIES_LABELED.map(([code, label]) => (
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

          <div className="bg-stone-900 border border-stone-800 rounded-2xl overflow-hidden">
            <StatsSettingsPanel />
          </div>
        </div>
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

      {/* Import tab */}
      {activeTab === 'import' && <ReadingHistoryImport />}

      {/* Notifications tab */}
      {activeTab === 'notifications' && <NotificationsTab />}
        </div>{/* end content panel */}
      </div>{/* end flex row */}
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
            const editionLabel = photo.edition.bookBoxCompany?.name ?? 'Edition'
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

interface MatchedBook {
  title: string
  authors: string[]
  readingStatus: 'READ' | 'READING' | 'DNF'
  readPeriods: { startedAt: string | null; finishedAt: string | null; isDnf: boolean }[]
  entryIds: string[]
  editionSlugs: string[]
}

interface ImportPreview {
  format: 'storygraph' | 'goodreads'
  total: number
  matched: MatchedBook[]
  unmatched: { title: string; authors: string[] }[]
}

interface ImportResult {
  imported: number
  skipped: number
}

const STATUS_LABEL: Record<string, string> = { READ: 'Read', READING: 'Currently reading', DNF: 'Did not finish' }
const STATUS_COLOR: Record<string, string> = { READ: 'text-emerald-400', READING: 'text-amber-400', DNF: 'text-red-400' }

function ReadingHistoryImport() {
  const fileRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()
  const [csvContent, setCsvContent] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const previewMutation = useMutation({
    mutationFn: (csv: string) =>
      authFetch<ImportPreview>('/reading-import/preview', {
        method: 'POST',
        body: JSON.stringify({ csv }),
      }),
    onSuccess: (data) => { setPreview(data); setError(null) },
    onError: (e: Error) => setError(e.message),
  })

  const executeMutation = useMutation({
    mutationFn: (csv: string) =>
      authFetch<ImportResult>('/reading-import/execute', {
        method: 'POST',
        body: JSON.stringify({ csv }),
      }),
    onSuccess: (data) => {
      setResult(data); setPreview(null); setError(null)
      queryClient.invalidateQueries({ queryKey: ['stats-collection'] })
    },
    onError: (e: Error) => setError(e.message),
  })

  const handleFile = (file: File) => {
    setFileName(file.name)
    setPreview(null)
    setResult(null)
    setConfirmed(false)
    setError(null)
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      setCsvContent(text)
      previewMutation.mutate(text)
    }
    reader.onerror = () => setError('Failed to read file')
    reader.readAsText(file, 'utf-8')
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const reset = () => {
    setCsvContent(null); setFileName(null); setPreview(null); setResult(null); setConfirmed(false); setError(null)
  }

  return (
    <div className="space-y-5">
      {/* Info banner */}
      <div className="bg-stone-900 border border-stone-800 rounded-2xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          <BookMarked size={16} className="text-amber-400 shrink-0" />
          <h2 className="font-serif font-semibold text-stone-100">Reading History Import</h2>
        </div>
        <p className="text-sm text-stone-400">
          Import your reading history from <strong className="text-stone-200">Goodreads</strong> or{' '}
          <strong className="text-stone-200">StoryGraph</strong>. The format is detected automatically.
          StoryGraph exports also include reading start dates, while Goodreads provides only finish dates.
        </p>
        <div className="bg-amber-950/60 border border-amber-700 rounded-xl p-4 space-y-1.5 text-sm text-amber-400">
          <p className="font-semibold text-amber-500">⚠️ Before you import — please read</p>
          <ul className="list-disc list-inside space-y-1 text-amber-400/90">
            <li>Import matches books by the <strong className="text-amber-500">title + author pair</strong>. Only books already in your collection will be updated.</li>
            <li>If you have <strong className="text-amber-500">multiple editions</strong> of the same book, <strong className="text-amber-500">all of them</strong> will receive the same reading data.</li>
            <li><strong className="text-amber-500">Repeated imports create duplicates</strong> in reading history — import data only once.</li>
          </ul>
        </div>
      </div>

      {/* Upload area */}
      {!result && (
        <div className="bg-stone-900 border border-stone-800 rounded-2xl p-5">
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-stone-700 hover:border-amber-500/50 rounded-xl p-8 flex flex-col items-center gap-3 cursor-pointer transition-colors"
          >
            <Upload size={28} className="text-stone-500" />
            {fileName ? (
              <div className="text-center">
                <p className="text-sm font-medium text-stone-200">{fileName}</p>
                <p className="text-xs text-stone-500 mt-0.5">Click to replace</p>
              </div>
            ) : (
              <div className="text-center">
                <p className="text-sm text-stone-400">Drop your CSV here or click to browse</p>
                <p className="text-xs text-stone-600 mt-0.5">Goodreads or StoryGraph export (.csv)</p>
              </div>
            )}
          </div>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
        </div>
      )}

      {error && (
        <p className="text-xs text-red-400 bg-red-950/30 border border-red-900 rounded-xl px-4 py-3">{error}</p>
      )}

      {/* Preview loading */}
      {previewMutation.isPending && (
        <div className="flex items-center gap-2 text-sm text-stone-400 px-1">
          <Loader2 size={14} className="animate-spin" />
          Analysing file…
        </div>
      )}

      {/* Preview results */}
      {preview && !result && (
        <div className="space-y-4">
          <div className="bg-stone-900 border border-stone-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-serif font-semibold text-stone-100">
                Preview — {preview.format === 'storygraph' ? 'StoryGraph' : 'Goodreads'} export
              </h3>
              <button onClick={reset} className="text-xs text-stone-500 hover:text-stone-300 transition-colors">
                Upload different file
              </button>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="bg-stone-800/60 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-stone-100">{preview.total}</p>
                <p className="text-xs text-stone-500 mt-0.5">Books to process</p>
              </div>
              <div className="bg-emerald-950/40 border border-emerald-800/30 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-emerald-400">{preview.matched.length}</p>
                <p className="text-xs text-stone-500 mt-0.5">Matched in collection</p>
              </div>
              <div className="bg-stone-800/60 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-stone-400">{preview.unmatched.length}</p>
                <p className="text-xs text-stone-500 mt-0.5">Not in collection</p>
              </div>
            </div>

            {preview.matched.length > 0 && (
              <div>
                <p className="text-xs font-medium text-stone-400 mb-2">Books that will be updated</p>
                <div className="space-y-1 max-h-60 overflow-y-auto pr-1">
                  {preview.matched.map((b, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg bg-stone-800/50 text-sm">
                      <div className="min-w-0">
                        <p className="text-stone-200 truncate">{b.title}</p>
                        <p className="text-xs text-stone-500 truncate">{b.authors.join(', ')}</p>
                      </div>
                      <div className="flex flex-col items-end gap-0.5 shrink-0 ml-3">
                        <span className={`text-xs font-medium ${STATUS_COLOR[b.readingStatus] ?? ''}`}>
                          {STATUS_LABEL[b.readingStatus] ?? b.readingStatus}
                        </span>
                        {b.readPeriods.length > 1 && (
                          <span className="text-[10px] text-sky-400/80">{b.readPeriods.length}× read</span>
                        )}
                        {b.entryIds.length > 1 && (
                          <span className="text-[10px] text-amber-500/80">{b.entryIds.length} editions</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {preview.unmatched.length > 0 && (
              <details className="group">
                <summary className="text-xs text-stone-500 cursor-pointer hover:text-stone-300 transition-colors">
                  {preview.unmatched.length} book{preview.unmatched.length > 1 ? 's' : ''} not found in your collection (click to expand)
                </summary>
                <div className="mt-2 space-y-1 max-h-48 overflow-y-auto pr-1">
                  {preview.unmatched.map((b, i) => (
                    <div key={i} className="px-3 py-1.5 rounded-lg bg-stone-800/30 text-sm">
                      <p className="text-stone-400 truncate">{b.title}</p>
                      <p className="text-xs text-stone-600 truncate">{b.authors.join(', ')}</p>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>

          {preview.matched.length > 0 && (
            <div className="bg-stone-900 border border-stone-800 rounded-2xl p-5 space-y-3">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  className="accent-amber-400 mt-0.5"
                />
                <span className="text-sm text-stone-400">
                  I understand that this will update reading status and add reading history entries for{' '}
                  <strong className="text-stone-200">{preview.matched.length} book{preview.matched.length > 1 ? 's' : ''}</strong>.
                  I have not imported this file before and will not import it again.
                </span>
              </label>
              <button
                onClick={() => { if (csvContent) executeMutation.mutate(csvContent) }}
                disabled={!confirmed || executeMutation.isPending}
                className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-stone-950 font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors"
              >
                {executeMutation.isPending
                  ? <><Loader2 size={14} className="animate-spin" /> Importing…</>
                  : <><Upload size={14} /> Import {preview.matched.length} books</>}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Success */}
      {result && (
        <div className="bg-emerald-950/30 border border-emerald-800/40 rounded-2xl p-6 space-y-3">
          <div className="flex items-center gap-2">
            <Check size={18} className="text-emerald-400" />
            <h3 className="font-serif font-semibold text-emerald-300">Import complete</h3>
          </div>
          <p className="text-sm text-stone-400">
            <strong className="text-stone-200">{result.imported}</strong> reading history{' '}
            {result.imported === 1 ? 'entry' : 'entries'} created.
            {result.skipped > 0 && ` ${result.skipped} skipped due to errors.`}
          </p>
          <button onClick={reset} className="text-sm text-amber-400 hover:text-amber-300 transition-colors">
            Import another file
          </button>
        </div>
      )}
    </div>
  )
}

interface ReminderSettings {
  renewalEnabled: boolean
  renewalInAppEnabled: boolean
  renewalPushEnabled: boolean
  renewalDaysBefore: number
  renewalHour: number | null
  renewalDigest: boolean
  saleEnabled: boolean
  saleInAppEnabled: boolean
  salePushEnabled: boolean
  saleDaysBefore: number
  saleMinutesBefore: number | null
  saleDigest: boolean
  appNotifInAppEnabled: boolean
  appNotifPushEnabled: boolean
}

interface PushNotifPreferences {
  pushEnabled: boolean
}

const SECTION = 'bg-stone-900 border border-stone-800 rounded-2xl p-5 space-y-4'
const TOGGLE_ROW = 'flex items-center justify-between'
const TOGGLE_LABEL = 'text-sm text-stone-200'
const TOGGLE_SUBLABEL = 'text-xs text-stone-500 mt-0.5'

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed ${checked ? 'bg-amber-500' : 'bg-stone-700'}`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`}
      />
    </button>
  )
}

function NotificationsTab() {
  const queryClient = useQueryClient()
  const { permission, isSubscribed, isLoading: pushLoading, isSupported, subscribe, unsubscribe } = usePushNotifications()

  const { data: prefs } = useQuery({
    queryKey: ['notification-preferences'],
    queryFn: () => authFetch<PushNotifPreferences>('/notifications/preferences'),
  })

  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ['reminder-settings'],
    queryFn: () => authFetch<ReminderSettings>('/reminder-settings'),
  })

  const prefsMutation = useMutation({
    mutationFn: (dto: Partial<PushNotifPreferences>) =>
      authFetch('/notifications/preferences', { method: 'PUT', body: JSON.stringify(dto) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notification-preferences'] }),
  })

  const settingsMutation = useMutation({
    mutationFn: (dto: Partial<ReminderSettings>) =>
      authFetch<ReminderSettings>('/reminder-settings', { method: 'PUT', body: JSON.stringify(dto) }),
    onSuccess: (data) => queryClient.setQueryData(['reminder-settings'], data),
  })

  const update = (dto: Partial<ReminderSettings>) => settingsMutation.mutate(dto)
  const HOURS = Array.from({ length: 24 }, (_, i) => i)

  if (settingsLoading) {
    return (
      <div className="space-y-4">
        <div className="h-32 bg-stone-800 rounded-2xl animate-pulse" />
        <div className="h-32 bg-stone-800 rounded-2xl animate-pulse" />
      </div>
    )
  }

  const s: ReminderSettings = settings ?? {
    renewalEnabled: false, renewalInAppEnabled: true, renewalPushEnabled: false,
    renewalDaysBefore: 1, renewalHour: null, renewalDigest: true,
    saleEnabled: false, saleInAppEnabled: true, salePushEnabled: false,
    saleDaysBefore: 0, saleMinutesBefore: 180, saleDigest: false,
    appNotifInAppEnabled: true, appNotifPushEnabled: false,
  }

  return (
    <div className="space-y-6">
      {/* Push Notifications */}
      {isSupported && (
        <section className={SECTION}>
          <h3 className="text-sm font-semibold text-stone-300 uppercase tracking-wide">Push Notifications</h3>
          {permission === 'denied' ? (
            <p className="text-sm text-amber-400">Push notifications are blocked in your browser. Enable them in browser settings to use this feature.</p>
          ) : (
            <div className={TOGGLE_ROW}>
              <div>
                <p className={TOGGLE_LABEL}>This browser / device</p>
                <p className={TOGGLE_SUBLABEL}>Register this browser to receive push notifications. You can enable it on multiple devices independently.</p>
              </div>
              <Toggle
                checked={isSubscribed}
                onChange={(v) => { v ? subscribe() : unsubscribe(); prefsMutation.mutate({ pushEnabled: v }) }}
                disabled={pushLoading}
              />
            </div>
          )}
          {isSubscribed && (
            <div className={TOGGLE_ROW}>
              <div>
                <p className={TOGGLE_LABEL}>Push notifications globally</p>
                <p className={TOGGLE_SUBLABEL}>Master switch — turn off to pause all push notifications across every device without unregistering them.</p>
              </div>
              <Toggle checked={prefs?.pushEnabled ?? false} onChange={(v) => prefsMutation.mutate({ pushEnabled: v })} />
            </div>
          )}
        </section>
      )}

      {/* App Notifications */}
      <section className={SECTION}>
        <div className={TOGGLE_ROW}>
          <div>
            <h3 className="text-sm font-semibold text-stone-300 uppercase tracking-wide">App Notifications</h3>
            <p className={TOGGLE_SUBLABEL}>Updates, bug fixes and announcements from the LuxGrimoire team</p>
          </div>
        </div>
        <div className="space-y-3 pt-1">
          <div className={TOGGLE_ROW}>
            <div>
              <p className={TOGGLE_LABEL}>In-app</p>
              <p className={TOGGLE_SUBLABEL}>Always shown in your notification bell</p>
            </div>
            <Toggle checked={true} onChange={() => {}} disabled={true} />
          </div>
          {isSubscribed && (
            <div className={TOGGLE_ROW}>
              <div>
                <p className={TOGGLE_LABEL}>Push</p>
                <p className={TOGGLE_SUBLABEL}>Send to this device when a new announcement is posted</p>
              </div>
              <Toggle checked={s.appNotifPushEnabled} onChange={(v) => update({ appNotifPushEnabled: v })} />
            </div>
          )}
        </div>
      </section>

      {/* Renewal Reminders */}
      <section className={SECTION}>
        <div className={TOGGLE_ROW}>
          <div>
            <h3 className="text-sm font-semibold text-stone-300 uppercase tracking-wide">Renewal Reminders</h3>
            <p className={TOGGLE_SUBLABEL}>Get reminded before your subscriptions renew</p>
          </div>
          <Toggle checked={s.renewalEnabled} onChange={(v) => update({ renewalEnabled: v })} />
        </div>

        {s.renewalEnabled && (
          <div className="space-y-4 pt-2 border-t border-stone-800">
            {/* Delivery channels */}
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <Toggle checked={s.renewalInAppEnabled} onChange={(v) => update({ renewalInAppEnabled: v })} />
                <span className={TOGGLE_LABEL}>In-app</span>
              </label>
              {isSupported && isSubscribed && (
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <Toggle checked={s.renewalPushEnabled} onChange={(v) => update({ renewalPushEnabled: v })} />
                  <span className={TOGGLE_LABEL}>Push</span>
                </label>
              )}
            </div>

            {/* Timing */}
            <div>
              <p className="text-xs text-stone-400 mb-2">When to remind</p>
              <div className="flex flex-wrap gap-2">
                <select
                  value={s.renewalDaysBefore}
                  onChange={(e) => update({ renewalDaysBefore: Number(e.target.value) })}
                  className="bg-stone-800 border border-stone-700 text-stone-100 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-amber-400"
                >
                  {[0, 1, 2, 3, 4, 5, 6, 7].map((d) => (
                    <option key={d} value={d}>{d === 0 ? 'On the day of renewal' : `${d} day${d > 1 ? 's' : ''} before`}</option>
                  ))}
                </select>
                <select
                  value={s.renewalHour ?? ''}
                  onChange={(e) => update({ renewalHour: e.target.value === '' ? null : Number(e.target.value) })}
                  className="bg-stone-800 border border-stone-700 text-stone-100 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-amber-400"
                >
                  <option value="">at 18:00 (default)</option>
                  {HOURS.map((h) => (
                    <option key={h} value={h}>at {String(h).padStart(2, '0')}:00</option>
                  ))}
                </select>
              </div>
            </div>

            <div className={TOGGLE_ROW}>
              <div>
                <p className={TOGGLE_LABEL}>Digest mode</p>
                <p className={TOGGLE_SUBLABEL}>Combine multiple renewals into one notification</p>
              </div>
              <Toggle checked={s.renewalDigest} onChange={(v) => update({ renewalDigest: v })} />
            </div>
          </div>
        )}
      </section>

      {/* Sale Reminders */}
      <section className={SECTION}>
        <div className={TOGGLE_ROW}>
          <div>
            <h3 className="text-sm font-semibold text-stone-300 uppercase tracking-wide">Sale Reminders</h3>
            <p className={TOGGLE_SUBLABEL}>Get reminded about sales you're interested in</p>
          </div>
          <Toggle checked={s.saleEnabled} onChange={(v) => update({ saleEnabled: v })} />
        </div>

        {s.saleEnabled && (
          <div className="space-y-4 pt-2 border-t border-stone-800">
            {/* Delivery channels */}
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <Toggle checked={s.saleInAppEnabled} onChange={(v) => update({ saleInAppEnabled: v })} />
                <span className={TOGGLE_LABEL}>In-app</span>
              </label>
              {isSupported && isSubscribed && (
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <Toggle checked={s.salePushEnabled} onChange={(v) => update({ salePushEnabled: v })} />
                  <span className={TOGGLE_LABEL}>Push</span>
                </label>
              )}
            </div>

            {/* Timing */}
            <div>
              <p className="text-xs text-stone-400 mb-2">When to remind</p>
              <select
                value={s.saleMinutesBefore ?? 180}
                onChange={(e) => update({ saleMinutesBefore: Number(e.target.value) })}
                className="bg-stone-800 border border-stone-700 text-stone-100 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-amber-400"
              >
                <option value={0}>At sale time</option>
                <option value={15}>15 min before</option>
                <option value={30}>30 min before</option>
                {[1, 2, 3, 6, 12, 24].map((h) => (
                  <option key={h} value={h * 60}>{h}h before</option>
                ))}
              </select>
            </div>

            <div className={TOGGLE_ROW}>
              <div>
                <p className={TOGGLE_LABEL}>Digest mode</p>
                <p className={TOGGLE_SUBLABEL}>Combine multiple sales on the same day into one notification</p>
              </div>
              <Toggle checked={s.saleDigest} onChange={(v) => update({ saleDigest: v })} />
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
