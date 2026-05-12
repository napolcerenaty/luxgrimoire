'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { X, ChevronRight, ChevronLeft, BookOpen, Camera, ExternalLink, CreditCard, Sparkles, Check } from 'lucide-react'
import { useAuth } from '@/components/AuthProvider'
import { authFetch } from '@/lib/authFetch'

interface FeeTemplateForm {
  name: string
  category: string
  defaultAmount: string
  defaultCurrency: string
}

const FEE_CATEGORIES = ['VAT', 'CUSTOMS', 'PROCESSING', 'FORWARDING', 'OTHER']

export function OnboardingWizard() {
  const { refreshUser } = useAuth()
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [feeForm, setFeeForm] = useState<FeeTemplateForm>({
    name: '',
    category: 'VAT',
    defaultAmount: '',
    defaultCurrency: 'EUR',
  })
  const [feeAdded, setFeeAdded] = useState(false)
  const [feeSaving, setFeeSaving] = useState(false)
  const [feeError, setFeeError] = useState<string | null>(null)

  const TOTAL_STEPS = 5

  const completeOnboarding = async (goToSubs = false) => {
    try {
      await authFetch('/auth/onboarding', { method: 'PATCH', body: JSON.stringify({ completed: true }) })
      await refreshUser()
    } catch {}
    if (goToSubs) router.push('/my-subscriptions')
  }

  const addFeeTemplate = async () => {
    if (!feeForm.name.trim()) return
    setFeeSaving(true)
    setFeeError(null)
    try {
      await authFetch('/fees/templates', {
        method: 'POST',
        body: JSON.stringify({
          name: feeForm.name.trim(),
          category: feeForm.category || undefined,
          defaultAmount: feeForm.defaultAmount ? parseFloat(feeForm.defaultAmount) : undefined,
          defaultCurrency: feeForm.defaultCurrency || undefined,
        }),
      })
      setFeeAdded(true)
    } catch (e: any) {
      setFeeError(e?.message ?? 'Failed to save template')
    } finally {
      setFeeSaving(false)
    }
  }

  const steps = [
    // Step 0: Preferences
    <div key="prefs" className="space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
          <CreditCard size={20} className="text-amber-400" />
        </div>
        <h2 className="font-serif text-xl font-semibold text-stone-100">Set your preferences</h2>
      </div>
      <p className="text-stone-400 text-sm leading-relaxed">
        LuxGrimoire tracks your spending in your preferred currency and calculates import fees based on your shipping country.
        Head to <strong className="text-amber-400">Profile → Preferences</strong> to configure:
      </p>
      <ul className="space-y-2 text-sm text-stone-300">
        <li className="flex items-start gap-2"><span className="text-amber-400 mt-0.5">•</span><span><strong>Preferred currency</strong> — all spending displayed in this currency</span></li>
        <li className="flex items-start gap-2"><span className="text-amber-400 mt-0.5">•</span><span><strong>Shipping country</strong> — used for customs/VAT suggestions</span></li>
        <li className="flex items-start gap-2"><span className="text-amber-400 mt-0.5">•</span><span><strong>Timezone</strong> — keeps your calendar and renewal dates accurate</span></li>
      </ul>
      <a
        href="/profile?tab=preferences"
        target="_blank"
        rel="noopener"
        className="inline-flex items-center gap-2 text-sm text-amber-400 hover:text-amber-300 underline underline-offset-2 transition-colors"
      >
        Open Preferences <ExternalLink size={13} />
      </a>
    </div>,

    // Step 1: Taxes & Fees
    <div key="fees" className="space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
          <span className="text-amber-400 font-semibold text-sm">%</span>
        </div>
        <h2 className="font-serif text-xl font-semibold text-stone-100">Taxes & Fees</h2>
      </div>
      <p className="text-stone-400 text-sm leading-relaxed">
        Fee templates let you quickly apply recurring charges (VAT, customs, processing fees) to your purchases.
        You can add, edit, and delete them any time under <strong className="text-amber-400">Profile → Taxes & Fees</strong>.
      </p>
      {feeAdded ? (
        <div className="flex items-center gap-2 text-sm text-emerald-400 bg-emerald-950/30 border border-emerald-800 rounded-xl px-4 py-3">
          <Check size={15} /> Template saved! You can add more in profile settings.
        </div>
      ) : (
        <div className="space-y-3 bg-stone-800/50 border border-stone-700 rounded-xl p-4">
          <p className="text-xs text-stone-400 font-medium uppercase tracking-wide">Add your first fee template (optional)</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs text-stone-400 mb-1">Name *</label>
              <input
                type="text"
                value={feeForm.name}
                onChange={e => setFeeForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. UK VAT"
                className="w-full bg-stone-800 border border-stone-700 text-stone-100 rounded-lg px-3 py-2 text-sm placeholder:text-stone-500 focus:outline-none focus:border-amber-400 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs text-stone-400 mb-1">Category</label>
              <select
                value={feeForm.category}
                onChange={e => setFeeForm(f => ({ ...f, category: e.target.value }))}
                className="w-full bg-stone-800 border border-stone-700 text-stone-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-400 transition-colors"
              >
                {FEE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-stone-400 mb-1">Default amount</label>
              <input
                type="number"
                value={feeForm.defaultAmount}
                onChange={e => setFeeForm(f => ({ ...f, defaultAmount: e.target.value }))}
                placeholder="0.00"
                min="0"
                step="0.01"
                className="w-full bg-stone-800 border border-stone-700 text-stone-100 rounded-lg px-3 py-2 text-sm placeholder:text-stone-500 focus:outline-none focus:border-amber-400 transition-colors"
              />
            </div>
          </div>
          {feeError && <p className="text-xs text-red-400">{feeError}</p>}
          <button
            onClick={addFeeTemplate}
            disabled={feeSaving || !feeForm.name.trim()}
            className="text-sm font-medium text-amber-400 border border-amber-500/40 hover:border-amber-400 hover:bg-amber-500/10 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-2 rounded-lg transition-colors"
          >
            {feeSaving ? 'Saving…' : 'Save template'}
          </button>
        </div>
      )}
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
        On every edition page you can upload your own photos of the book — beautiful shelf shots, unboxings, detail photos. Here&apos;s how it works:
      </p>
      <div className="space-y-3">
        <div className="flex items-start gap-3">
          <span className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 text-xs flex items-center justify-center font-semibold shrink-0 mt-0.5">1</span>
          <p className="text-sm text-stone-300">Navigate to any edition page and scroll to the Community Photos section.</p>
        </div>
        <div className="flex items-start gap-3">
          <span className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 text-xs flex items-center justify-center font-semibold shrink-0 mt-0.5">2</span>
          <p className="text-sm text-stone-300">Upload your photo and optionally add your Instagram handle.</p>
        </div>
        <div className="flex items-start gap-3">
          <span className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 text-xs flex items-center justify-center font-semibold shrink-0 mt-0.5">3</span>
          <p className="text-sm text-stone-300">Your photo is reviewed and, once approved, it will appear on the edition page for everyone to see.</p>
        </div>
        <div className="flex items-start gap-3">
          <span className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 text-xs flex items-center justify-center font-semibold shrink-0 mt-0.5">4</span>
          <p className="text-sm text-stone-300">Manage all your submitted photos in <strong className="text-amber-400">Profile → My Photos</strong>.</p>
        </div>
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
          <button
            onClick={() => completeOnboarding(false)}
            className="text-stone-500 hover:text-stone-300 transition-colors"
            title="Skip tutorial"
          >
            <X size={18} />
          </button>
        </div>

        {/* Step indicators */}
        <div className="flex items-center gap-1.5 px-6 py-3 shrink-0">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <div
              key={i}
              className={`h-1 rounded-full transition-all ${i <= step ? 'bg-amber-400' : 'bg-stone-700'} ${i === step ? 'flex-[2]' : 'flex-1'}`}
            />
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
            disabled={step === 0}
            className="flex items-center gap-1 text-sm text-stone-400 hover:text-stone-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft size={16} /> Back
          </button>

          {step < TOTAL_STEPS - 1 ? (
            <button
              onClick={() => setStep(s => s + 1)}
              className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold text-sm px-5 py-2 rounded-xl transition-colors"
            >
              Next <ChevronRight size={16} />
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={() => completeOnboarding(false)}
                className="text-sm text-stone-400 hover:text-stone-200 px-4 py-2 rounded-xl transition-colors"
              >
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
