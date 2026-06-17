'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { X, ChevronRight, ChevronLeft, BookOpen, Camera, ExternalLink, CreditCard, Sparkles, Check, Loader2, Plus, Trash2 } from 'lucide-react'
import { useAuth } from '@/components/AuthProvider'
import { authFetch } from '@/lib/authFetch'
import { CURRENCIES_LABELED as CURRENCIES } from '@/lib/currencies'
import { usePushNotifications } from '@/hooks/usePushNotifications'

// ── Preferences data ──────────────────────────────────────────────────────────

const COUNTRIES: [string, string][] = [
  ['AL', 'Albania'], ['AD', 'Andorra'], ['AT', 'Austria'], ['BE', 'Belgium'],
  ['BA', 'Bosnia and Herzegovina'], ['BG', 'Bulgaria'], ['HR', 'Croatia'], ['CY', 'Cyprus'],
  ['CZ', 'Czech Republic'], ['DK', 'Denmark'], ['EE', 'Estonia'], ['FI', 'Finland'],
  ['FR', 'France'], ['DE', 'Germany'], ['GR', 'Greece'], ['HU', 'Hungary'],
  ['IS', 'Iceland'], ['IE', 'Ireland'], ['IT', 'Italy'], ['LV', 'Latvia'],
  ['LT', 'Lithuania'], ['LU', 'Luxembourg'], ['MT', 'Malta'], ['NL', 'Netherlands'],
  ['NO', 'Norway'], ['PL', 'Poland'], ['PT', 'Portugal'], ['RO', 'Romania'],
  ['RS', 'Serbia'], ['SK', 'Slovakia'], ['SI', 'Slovenia'], ['ES', 'Spain'],
  ['SE', 'Sweden'], ['CH', 'Switzerland'], ['UA', 'Ukraine'], ['GB', 'United Kingdom'],
  ['AU', 'Australia'], ['CA', 'Canada'], ['US', 'United States'],
]

// ── Fees data ─────────────────────────────────────────────────────────────────
const FEE_CATEGORIES = ['VAT', 'CUSTOMS', 'PROCESSING', 'FORWARDING', 'OTHER']

interface FeeTemplate { id: string; name: string; category: string | null; defaultAmount: number | null; defaultCurrency: string | null }
interface FeeTemplateForm { name: string; category: string; defaultAmount: string }

// ── Component ─────────────────────────────────────────────────────────────────
export function OnboardingWizard() {
  const { user, refreshUser } = useAuth()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [step, setStep] = useState(0)
  const TOTAL_STEPS = 6

  // ── Step 0: Preferences state ────────────────────────────────────────────
  const [prefsCurrency, setPrefsCurrency] = useState(user?.preferredCurrency ?? 'EUR')
  const [prefsCountry, setPrefsCountry] = useState(user?.shippingCountry ?? '')
  const [prefsTimezone, setPrefsTimezone] = useState(
    user?.timezone && user.timezone !== 'UTC'
      ? user.timezone
      : Intl.DateTimeFormat().resolvedOptions().timeZone
  )
  const [prefsTimeFormat, setPrefsTimeFormat] = useState(user?.timeFormat ?? '24h')
  const [prefsSaving, setPrefsSaving] = useState(false)
  const [prefsError, setPrefsError] = useState<string | null>(null)

  const timezoneOptions = useMemo(() => {
    try {
      return Intl.supportedValuesOf('timeZone').map(tz => ({ tz, label: tz.replace(/_/g, ' ') }))
    } catch {
      return [{ tz: Intl.DateTimeFormat().resolvedOptions().timeZone, label: 'Local timezone' }]
    }
  }, [])

  // ── Step 2: Notification preferences state ───────────────────────────────
  const { isSupported: pushSupported, isSubscribed, isLoading: pushLoading, permission, subscribe, unsubscribe } = usePushNotifications()
  const [notifRenewalEnabled, setNotifRenewalEnabled] = useState(false)
  const [notifRenewalInApp, setNotifRenewalInApp] = useState(true)
  const [notifRenewalPush, setNotifRenewalPush] = useState(false)
  const [notifRenewalDaysBefore, setNotifRenewalDaysBefore] = useState(1)
  const [notifRenewalHour, setNotifRenewalHour] = useState<number | null>(null)
  const [notifSaleEnabled, setNotifSaleEnabled] = useState(false)
  const [notifSaleInApp, setNotifSaleInApp] = useState(true)
  const [notifSalePush, setNotifSalePush] = useState(false)
  const [notifSaleHoursBefore, setNotifSaleHoursBefore] = useState(3)
  const [notifSaving, setNotifSaving] = useState(false)

  const saveNotifAndAdvance = async () => {
    setNotifSaving(true)
    try {
      await authFetch('/reminder-settings', {
        method: 'PUT',
        body: JSON.stringify({
          renewalEnabled: notifRenewalEnabled,
          renewalInAppEnabled: notifRenewalInApp,
          renewalPushEnabled: notifRenewalPush,
          renewalDaysBefore: notifRenewalDaysBefore,
          renewalHour: notifRenewalHour,
          saleEnabled: notifSaleEnabled,
          saleInAppEnabled: notifSaleInApp,
          salePushEnabled: notifSalePush,
          saleHoursBefore: notifSaleHoursBefore,
        }),
      })
    } catch {} finally {
      setNotifSaving(false)
    }
    setStep(s => s + 1)
  }

  // ── Step 1: Fees state ────────────────────────────────────────────────────
  const { data: existingTemplates = [], isLoading: feesLoading } = useQuery<FeeTemplate[]>({
    queryKey: ['fees', 'templates', 'onboarding'],
    queryFn: () => authFetch<FeeTemplate[]>('/fees/templates'),
    staleTime: 0,
  })
  const [feeForm, setFeeForm] = useState<FeeTemplateForm>({ name: '', category: 'VAT', defaultAmount: '' })
  const [feeSaving, setFeeSaving] = useState(false)
  const [feeError, setFeeError] = useState<string | null>(null)
  const [feeSuccess, setFeeSuccess] = useState(false)

  // ── Handlers ──────────────────────────────────────────────────────────────
  const savePrefsAndAdvance = async () => {
    setPrefsSaving(true)
    setPrefsError(null)
    try {
      await authFetch('/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          preferredCurrency: prefsCurrency,
          shippingCountry: prefsCountry || undefined,
          timezone: prefsTimezone,
          timeFormat: prefsTimeFormat,
        }),
      })
      await refreshUser()
      setStep(s => s + 1)
    } catch (e: any) {
      setPrefsError(e?.message ?? 'Failed to save preferences')
    } finally {
      setPrefsSaving(false)
    }
  }

  const addFeeTemplate = async () => {
    if (!feeForm.name.trim()) return
    setFeeSaving(true)
    setFeeError(null)
    setFeeSuccess(false)
    try {
      await authFetch('/fees/templates', {
        method: 'POST',
        body: JSON.stringify({
          name: feeForm.name.trim(),
          category: feeForm.category || undefined,
          defaultAmount: feeForm.defaultAmount ? parseFloat(feeForm.defaultAmount) : undefined,
          defaultCurrency: prefsCurrency,
        }),
      })
      setFeeForm({ name: '', category: 'VAT', defaultAmount: '' })
      setFeeSuccess(true)
      queryClient.invalidateQueries({ queryKey: ['fees', 'templates', 'onboarding'] })
      setTimeout(() => setFeeSuccess(false), 3000)
    } catch (e: any) {
      setFeeError(e?.message ?? 'Failed to save template')
    } finally {
      setFeeSaving(false)
    }
  }

  const completeOnboarding = async (goToSubs = false) => {
    try {
      await authFetch('/auth/onboarding', { method: 'PATCH', body: JSON.stringify({ completed: true }) })
      await refreshUser()
    } catch {}
    if (goToSubs) router.push('/subscriptions')
  }

  const handleNext = async () => {
    if (step === 0) { await savePrefsAndAdvance(); return }
    if (step === 2) { await saveNotifAndAdvance(); return }
    setStep(s => s + 1)
  }

  // ── INPUT / LABEL classes ─────────────────────────────────────────────────
  const INPUT = 'w-full bg-stone-800 border border-stone-700 text-stone-100 rounded-lg px-3 py-2 text-sm placeholder:text-stone-500 focus:outline-none focus:border-amber-400 transition-colors'
  const LABEL = 'block text-xs text-stone-400 mb-1'

  // ── Steps ─────────────────────────────────────────────────────────────────
  const steps = [
    // Step 0: Preferences
    <div key="prefs" className="space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
          <CreditCard size={20} className="text-amber-400" />
        </div>
        <div>
          <h2 className="font-serif text-xl font-semibold text-stone-100">Your preferences</h2>
          <p className="text-xs text-stone-500">Used for spending stats, fees and renewal dates</p>
        </div>
      </div>
      <div>
        <label className={LABEL}>Preferred Currency</label>
        <select value={prefsCurrency} onChange={e => setPrefsCurrency(e.target.value)} className={INPUT}>
          {CURRENCIES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
        </select>
      </div>
      <div>
        <label className={LABEL}>Shipping Country</label>
        <select value={prefsCountry} onChange={e => setPrefsCountry(e.target.value)} className={INPUT}>
          <option value="">— None —</option>
          {COUNTRIES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
        </select>
        <p className="text-xs text-stone-500 mt-1">Used as default when adding subscription shipping costs</p>
      </div>
      <div>
        <label className={LABEL}>Timezone</label>
        <select value={prefsTimezone} onChange={e => setPrefsTimezone(e.target.value)} className={INPUT}>
          {timezoneOptions.map(({ tz, label }) => <option key={tz} value={tz}>{label}</option>)}
        </select>
        <p className="text-xs text-stone-500 mt-1">Used for skip deadlines and renewal date display</p>
      </div>
      <div>
        <label className={LABEL}>Time Format</label>
        <div className="flex gap-3">
          {([['24h', '24-hour (14:30)'], ['12h', '12-hour (2:30 PM)']] as [string, string][]).map(([val, desc]) => (
            <label key={val} className={`flex-1 flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
              prefsTimeFormat === val
                ? 'border-amber-500/50 bg-amber-500/10 text-amber-400'
                : 'border-stone-700 bg-stone-800/50 text-stone-400 hover:border-stone-600'
            }`}>
              <input type="radio" name="onb-timeFormat" value={val} checked={prefsTimeFormat === val}
                onChange={() => setPrefsTimeFormat(val)} className="accent-amber-400" />
              <div>
                <div className="text-sm font-medium">{val.toUpperCase()}</div>
                <div className="text-xs text-stone-500">{desc}</div>
              </div>
            </label>
          ))}
        </div>
      </div>
      {prefsError && <p className="text-xs text-red-400 bg-red-950/30 border border-red-900 rounded-lg px-3 py-2">{prefsError}</p>}
    </div>,

    // Step 1: Taxes & Fees
    <div key="fees" className="space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
          <span className="text-amber-400 font-semibold text-sm">%</span>
        </div>
        <div>
          <h2 className="font-serif text-xl font-semibold text-stone-100">Taxes & Fees</h2>
          <p className="text-xs text-stone-500">Reusable templates for VAT, customs, processing fees</p>
        </div>
      </div>
      {feesLoading ? (
        <div className="flex items-center gap-2 text-sm text-stone-400 py-2"><Loader2 size={14} className="animate-spin" /> Loading…</div>
      ) : existingTemplates.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-stone-400 font-medium uppercase tracking-wide">Your templates</p>
          {existingTemplates.map(t => (
            <div key={t.id} className="flex items-center justify-between bg-stone-800/50 border border-stone-700 rounded-lg px-3 py-2">
              <div>
                <span className="text-sm text-stone-200 font-medium">{t.name}</span>
                {t.category && <span className="ml-2 text-xs text-stone-500">{t.category}</span>}
              </div>
              {t.defaultAmount != null && (
                <span className="text-sm text-amber-400">{t.defaultAmount} {t.defaultCurrency ?? prefsCurrency}</span>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="space-y-3 bg-stone-800/50 border border-stone-700 rounded-xl p-4">
        <p className="text-xs text-stone-400 font-medium uppercase tracking-wide">
          {existingTemplates.length > 0 ? 'Add another template' : 'Add a fee template (optional)'}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className={LABEL}>Name *</label>
            <input type="text" value={feeForm.name} onChange={e => setFeeForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. UK VAT" className={INPUT} />
          </div>
          <div>
            <label className={LABEL}>Category</label>
            <select value={feeForm.category} onChange={e => setFeeForm(f => ({ ...f, category: e.target.value }))} className={INPUT}>
              {FEE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className={LABEL}>Amount ({prefsCurrency})</label>
            <input type="number" value={feeForm.defaultAmount} onChange={e => setFeeForm(f => ({ ...f, defaultAmount: e.target.value }))}
              placeholder="0.00" min="0" step="0.01" className={INPUT} />
          </div>
        </div>
        {feeError && <p className="text-xs text-red-400">{feeError}</p>}
        {feeSuccess && (
          <div className="flex items-center gap-2 text-xs text-emerald-400"><Check size={13} /> Template saved!</div>
        )}
        <button onClick={addFeeTemplate} disabled={feeSaving || !feeForm.name.trim()}
          className="flex items-center gap-2 text-sm font-medium text-amber-400 border border-amber-500/40 hover:border-amber-400 hover:bg-amber-500/10 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-2 rounded-lg transition-colors">
          {feeSaving ? <><Loader2 size={13} className="animate-spin" /> Saving…</> : <><Plus size={13} /> Add template</>}
        </button>
      </div>
      <p className="text-xs text-stone-500">You can manage templates any time in <strong className="text-stone-400">Profile → Taxes & Fees</strong>.</p>
    </div>,

    // Step 2: Notification Preferences
    <div key="notif" className="space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
          <span className="text-amber-400 text-lg">🔔</span>
        </div>
        <div>
          <h2 className="font-serif text-xl font-semibold text-stone-100">Notification Preferences</h2>
          <p className="text-xs text-stone-500">Get reminded about renewals and sales</p>
        </div>
      </div>

      <div className="space-y-3">
        {/* Push subscribe */}
        {pushSupported && permission !== 'denied' && (
          <div className="bg-stone-800/50 border border-stone-700 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-stone-200">Enable push notifications</p>
                <p className="text-xs text-stone-500">Receive reminders even when the app is closed</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={isSubscribed}
                disabled={pushLoading}
                onClick={() => isSubscribed ? unsubscribe() : subscribe()}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors disabled:opacity-40 ${isSubscribed ? 'bg-amber-500' : 'bg-stone-700'}`}
              >
                <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg transition-transform ${isSubscribed ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>
          </div>
        )}
        {pushSupported && permission === 'denied' && (
          <p className="text-xs text-amber-400 px-1">Push notifications are blocked in your browser. You can enable them later in browser settings.</p>
        )}

        {/* Renewal reminders */}
        <div className="bg-stone-800/50 border border-stone-700 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-stone-200">Renewal reminders</p>
              <p className="text-xs text-stone-500">Get notified before your subscriptions renew</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={notifRenewalEnabled}
              onClick={() => setNotifRenewalEnabled(v => !v)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${notifRenewalEnabled ? 'bg-amber-500' : 'bg-stone-700'}`}
            >
              <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg transition-transform ${notifRenewalEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>
          {notifRenewalEnabled && (
            <div className="space-y-3 pt-1 border-t border-stone-700/50">
              {/* Channels */}
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <button type="button" role="switch" aria-checked={notifRenewalInApp}
                    onClick={() => setNotifRenewalInApp(v => !v)}
                    className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors ${notifRenewalInApp ? 'bg-amber-500' : 'bg-stone-700'}`}>
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${notifRenewalInApp ? 'translate-x-4' : 'translate-x-0'}`} />
                  </button>
                  <span className="text-xs text-stone-300">In-app</span>
                </label>
                {pushSupported && isSubscribed && (
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <button type="button" role="switch" aria-checked={notifRenewalPush}
                      onClick={() => setNotifRenewalPush(v => !v)}
                      className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors ${notifRenewalPush ? 'bg-amber-500' : 'bg-stone-700'}`}>
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${notifRenewalPush ? 'translate-x-4' : 'translate-x-0'}`} />
                    </button>
                    <span className="text-xs text-stone-300">Push</span>
                  </label>
                )}
              </div>
              {/* Timing */}
              <div>
                <label className={LABEL}>When to remind</label>
                <div className="flex flex-wrap gap-2">
                  <select value={notifRenewalDaysBefore} onChange={e => setNotifRenewalDaysBefore(Number(e.target.value))} className={INPUT}>
                    {[0, 1, 2, 3, 4, 5, 6, 7].map(d => (
                      <option key={d} value={d}>{d === 0 ? 'On the day of renewal' : `${d} day${d > 1 ? 's' : ''} before`}</option>
                    ))}
                  </select>
                  <select value={notifRenewalHour ?? ''} onChange={e => setNotifRenewalHour(e.target.value === '' ? null : Number(e.target.value))} className={INPUT}>
                    <option value="">at 18:00 (default)</option>
                    {Array.from({ length: 24 }, (_, h) => (
                      <option key={h} value={h}>at {String(h).padStart(2, '0')}:00</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Sale reminders */}
        <div className="bg-stone-800/50 border border-stone-700 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-stone-200">Sale reminders</p>
              <p className="text-xs text-stone-500">Get reminded about sales you're interested in</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={notifSaleEnabled}
              onClick={() => setNotifSaleEnabled(v => !v)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${notifSaleEnabled ? 'bg-amber-500' : 'bg-stone-700'}`}
            >
              <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg transition-transform ${notifSaleEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>
          {notifSaleEnabled && (
            <div className="space-y-3 pt-1 border-t border-stone-700/50">
              {/* Channels */}
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <button type="button" role="switch" aria-checked={notifSaleInApp}
                    onClick={() => setNotifSaleInApp(v => !v)}
                    className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors ${notifSaleInApp ? 'bg-amber-500' : 'bg-stone-700'}`}>
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${notifSaleInApp ? 'translate-x-4' : 'translate-x-0'}`} />
                  </button>
                  <span className="text-xs text-stone-300">In-app</span>
                </label>
                {pushSupported && isSubscribed && (
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <button type="button" role="switch" aria-checked={notifSalePush}
                      onClick={() => setNotifSalePush(v => !v)}
                      className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors ${notifSalePush ? 'bg-amber-500' : 'bg-stone-700'}`}>
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${notifSalePush ? 'translate-x-4' : 'translate-x-0'}`} />
                    </button>
                    <span className="text-xs text-stone-300">Push</span>
                  </label>
                )}
              </div>
              {/* Timing */}
              <div>
                <label className={LABEL}>When to remind</label>
                <select value={notifSaleHoursBefore} onChange={e => setNotifSaleHoursBefore(Number(e.target.value))} className={INPUT}>
                  <option value={0}>At sale time</option>
                  {[1, 2, 3, 6, 12, 24].map(h => (
                    <option key={h} value={h}>{h}h before sale</option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>
      </div>
      <p className="text-xs text-stone-500">You can adjust all notification settings any time in <strong className="text-stone-400">Profile → Notifications</strong>.</p>
    </div>,

    // Step 3: Footer links (was Step 2)
    <div key="footer" className="space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
          <ExternalLink size={20} className="text-amber-400" />
        </div>
        <h2 className="font-serif text-xl font-semibold text-stone-100">Footer links</h2>
      </div>
      <p className="text-stone-400 text-sm">In the footer you&apos;ll find several useful links:</p>
      <div className="space-y-3">
        <div className="bg-stone-800/50 border border-stone-700 rounded-xl p-3 space-y-1">
          <p className="text-sm font-medium text-stone-200">🐛 Bug Report</p>
          <p className="text-xs text-stone-400">Found something broken? Submit a bug report and we&apos;ll look into it.</p>
        </div>
        <div className="bg-stone-800/50 border border-stone-700 rounded-xl p-3 space-y-1">
          <p className="text-sm font-medium text-stone-200">💡 Feature Request</p>
          <p className="text-xs text-stone-400">Have an idea for a new feature? Tell us — we read every request.</p>
        </div>
        <div className="bg-stone-800/50 border border-stone-700 rounded-xl p-3 space-y-1">
          <p className="text-sm font-medium text-stone-200">📦 Sale Request</p>
          <p className="text-xs text-stone-400">Know about an upcoming sale or promotion? Submit it so the community can see it.</p>
        </div>
        <div className="bg-stone-800/50 border border-stone-700 rounded-xl p-3 space-y-1">
          <p className="text-sm font-medium text-stone-200">📋 Request Data</p>
          <p className="text-xs text-stone-400">Missing a book, edition, or other data in the system? Submit a data request and we&apos;ll add it.</p>
        </div>
      </div>
    </div>,

    // Step 4: Community Photos (was Step 3)
    <div key="photos" className="space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
          <Camera size={20} className="text-amber-400" />
        </div>
        <h2 className="font-serif text-xl font-semibold text-stone-100">Community Photos</h2>
      </div>
      <p className="text-stone-400 text-sm leading-relaxed">
        When an edition doesn&apos;t have an official cover photo yet, a community photo takes its place. Here&apos;s how it works:
      </p>
      <div className="space-y-3">
        {[
          'Open any edition page that has no official cover image — you\'ll see an upload placeholder instead.',
          'Upload your own photo (shelf shot, unboxing, detail) — up to 5 photos per submission.',
          'Optionally add your Instagram handle to get credited as the photographer.',
          'Your photo is reviewed and, once approved, it becomes the cover and appears across the app.',
          'Manage all your submitted photos in Profile → My Photos.',
        ].map((text, i) => (
          <div key={i} className="flex items-start gap-3">
            <span className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 text-xs flex items-center justify-center font-semibold shrink-0 mt-0.5">{i + 1}</span>
            <p className="text-sm text-stone-300">{text}</p>
          </div>
        ))}
      </div>
    </div>,

    // Step 5: Subscriptions backfill (was Step 4)
    <div key="subs" className="space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
          <BookOpen size={20} className="text-amber-400" />
        </div>
        <h2 className="font-serif text-xl font-semibold text-stone-100">Tracking Subscriptions</h2>
      </div>
      <p className="text-stone-400 text-sm leading-relaxed">
        LuxGrimoire can backfill your entire subscription history — you don&apos;t need to add each box manually.
      </p>
      <div className="bg-stone-800/50 border border-amber-500/20 rounded-xl p-4 space-y-3">
        <p className="text-sm font-medium text-amber-300 flex items-center gap-2"><Sparkles size={14} /> Here&apos;s what happens automatically:</p>
        <ul className="space-y-2 text-sm text-stone-300">
          <li className="flex items-start gap-2"><span className="text-amber-400 mt-0.5">→</span><span><strong>Set the start date</strong> of your subscription</span></li>
          <li className="flex items-start gap-2"><span className="text-amber-400 mt-0.5">→</span><span><strong>Enter your costs</strong> (price, shipping, fees)</span></li>
          <li className="flex items-start gap-2"><span className="text-amber-400 mt-0.5">→</span><span>We <strong>calculate all past boxes</strong>, skipped months, and your next renewal date</span></li>
          <li className="flex items-start gap-2"><span className="text-amber-400 mt-0.5">→</span><span>Books are <strong>automatically linked</strong> to the correct months</span></li>
        </ul>
      </div>
      <p className="text-xs text-stone-500">You can always adjust individual months or change costs after the fact.</p>
    </div>,
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-stone-950 border border-stone-800 rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-stone-800 shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-amber-400" />
            <span className="text-sm font-medium text-stone-300">Getting started</span>
          </div>
          <button onClick={() => completeOnboarding(false)} className="text-stone-500 hover:text-stone-300 transition-colors" title="Skip tutorial">
            <X size={18} />
          </button>
        </div>

        {/* Step indicators */}
        <div className="flex items-center gap-1.5 px-6 py-3 shrink-0">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <div key={i} className={`h-1 rounded-full transition-all ${i <= step ? 'bg-amber-400' : 'bg-stone-700'} ${i === step ? 'flex-[2]' : 'flex-1'}`} />
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-2">
          {steps[step]}
        </div>

        {/* Footer buttons */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-stone-800 shrink-0">
          <button
            onClick={() => setStep(s => Math.max(0, s - 1))}
            disabled={step === 0 || prefsSaving || notifSaving}
            className="flex items-center gap-1 text-sm text-stone-400 hover:text-stone-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft size={16} /> Back
          </button>

          {step < TOTAL_STEPS - 1 ? (
            <button
              onClick={handleNext}
              disabled={prefsSaving || notifSaving}
              className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-stone-950 font-semibold text-sm px-5 py-2 rounded-xl transition-colors"
            >
              {(prefsSaving || notifSaving) ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : <>Next <ChevronRight size={16} /></>}
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button onClick={() => completeOnboarding(false)} className="text-sm text-stone-400 hover:text-stone-200 px-4 py-2 rounded-xl transition-colors">
                Done
              </button>
              <button
                onClick={() => completeOnboarding(true)}
                className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold text-sm px-5 py-2 rounded-xl transition-colors"
              >
                Add my first subscription <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
