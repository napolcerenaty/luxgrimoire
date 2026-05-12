'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { X, ChevronRight, ChevronLeft, BookOpen, Camera, ExternalLink, CreditCard, Sparkles, Check, Loader2, Plus, Trash2 } from 'lucide-react'
import { useAuth } from '@/components/AuthProvider'
import { authFetch } from '@/lib/authFetch'

// ── Preferences data ──────────────────────────────────────────────────────────
const CURRENCIES: [string, string][] = [
  ['EUR', 'EUR - Euro'], ['USD', 'USD - US Dollar'], ['GBP', 'GBP - British Pound'],
  ['PLN', 'PLN - Polish Zloty'], ['CHF', 'CHF - Swiss Franc'], ['CZK', 'CZK - Czech Koruna'],
  ['SEK', 'SEK - Swedish Krona'], ['NOK', 'NOK - Norwegian Krone'], ['DKK', 'DKK - Danish Krone'],
  ['HUF', 'HUF - Hungarian Forint'], ['RON', 'RON - Romanian Leu'], ['CAD', 'CAD - Canadian Dollar'],
  ['AUD', 'AUD - Australian Dollar'], ['JPY', 'JPY - Japanese Yen'],
]

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
  const TOTAL_STEPS = 5

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
    if (goToSubs) router.push('/my-subscriptions')
  }

  const handleNext = async () => {
    if (step === 0) { await savePrefsAndAdvance(); return }
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

    // Step 2: Footer links
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
          <p className="text-sm font-medium text-stone-200">📋 Request Your Data</p>
          <p className="text-xs text-stone-400">Want an export of everything we hold about you? Use this link to request it.</p>
        </div>
      </div>
    </div>,

    // Step 3: Community Photos
    <div key="photos" className="space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
          <Camera size={20} className="text-amber-400" />
        </div>
        <h2 className="font-serif text-xl font-semibold text-stone-100">Community Photos</h2>
      </div>
      <p className="text-stone-400 text-sm leading-relaxed">
        On every edition page you can upload your own photos of the book — shelf shots, unboxings, detail photos. Here&apos;s how it works:
      </p>
      <div className="space-y-3">
        {[
          'Navigate to any edition page and scroll to the Community Photos section.',
          'Upload your photo and optionally add your Instagram handle.',
          'Your photo is reviewed and, once approved, it will appear on the edition page for everyone to see.',
          'Manage all your submitted photos in Profile → My Photos.',
        ].map((text, i) => (
          <div key={i} className="flex items-start gap-3">
            <span className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 text-xs flex items-center justify-center font-semibold shrink-0 mt-0.5">{i + 1}</span>
            <p className="text-sm text-stone-300">{text}</p>
          </div>
        ))}
      </div>
    </div>,

    // Step 4: Subscriptions backfill
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
      <p className="text-xs text-stone-500">You can always adjust individual months, mark skips, or change costs after the fact.</p>
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
            disabled={step === 0 || prefsSaving}
            className="flex items-center gap-1 text-sm text-stone-400 hover:text-stone-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft size={16} /> Back
          </button>

          {step < TOTAL_STEPS - 1 ? (
            <button
              onClick={handleNext}
              disabled={prefsSaving}
              className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-stone-950 font-semibold text-sm px-5 py-2 rounded-xl transition-colors"
            >
              {prefsSaving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : <>Next <ChevronRight size={16} /></>}
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
