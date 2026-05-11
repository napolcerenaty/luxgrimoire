'use client'

import { parseDecimalInput } from '@/lib/parseDecimalInput'

export const SALE_PLATFORMS = [
  { value: 'ebay', label: 'eBay' },
  { value: 'facebook', label: 'Facebook Marketplace' },
  { value: 'vinted', label: 'Vinted' },
  { value: 'depop', label: 'Depop' },
  { value: 'discord', label: 'Discord' },
  { value: 'other', label: 'Other' },
]

export const CURRENCIES = ['EUR', 'USD', 'GBP', 'PLN', 'CAD', 'AUD', 'CHF', 'SEK', 'NOK', 'DKK', 'CZK', 'HUF']

const INP = 'w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-stone-100 focus:outline-none focus:border-amber-400 text-sm'
const LBL = 'block text-sm text-stone-400 mb-1'

interface SaleFormFieldsProps {
  title: string
  setTitle: (v: string) => void
  platform: string
  setPlatform: (v: string) => void
  customPlatform: string
  setCustomPlatform: (v: string) => void
  total: string
  setTotal?: (v: string) => void
  currency: string
  setCurrency: (v: string) => void
  soldAt: string
  setSoldAt: (v: string) => void
  notes: string
  setNotes: (v: string) => void
  /** If true, the total field is hidden (e.g. custom distribution in edit mode) */
  hideTotalField?: boolean
  /** Extra content to render after the currency row */
  afterCurrencyRow?: React.ReactNode
  /** Extra content to render before the submit button */
  beforeSubmit?: React.ReactNode
  pending?: boolean
  submitLabel?: string
}

export function SaleFormFields({
  title, setTitle,
  platform, setPlatform,
  customPlatform, setCustomPlatform,
  total, setTotal,
  currency, setCurrency,
  soldAt, setSoldAt,
  notes, setNotes,
  hideTotalField = false,
  afterCurrencyRow,
  beforeSubmit,
  pending,
  submitLabel = 'Save',
}: SaleFormFieldsProps) {
  return (
    <>
      <div>
        <label className={LBL}>Sale title (optional)</label>
        <input className={INP} value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Book set" />
      </div>
      <div>
        <label className={LBL}>Platform</label>
        <select className={INP} value={platform} onChange={e => setPlatform(e.target.value)}>
          <option value="">— Select platform —</option>
          {SALE_PLATFORMS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        {platform === 'other' && (
          <input className={`${INP} mt-2`} value={customPlatform} onChange={e => setCustomPlatform(e.target.value)} placeholder="Platform name…" />
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {!hideTotalField && setTotal && (
          <div>
            <label className={LBL}>Total sold for *</label>
            <input required type="number" step="0.01" min="0.01" className={INP} value={total}
              onChange={e => setTotal(e.target.value)} />
          </div>
        )}
        <div className={hideTotalField ? 'col-span-2' : ''}>
          <label className={LBL}>Currency</label>
          <select className={INP} value={currency} onChange={e => setCurrency(e.target.value)}>
            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>
      {afterCurrencyRow}
      <div>
        <label className={LBL}>Sale date *</label>
        <input required type="date" className={INP} value={soldAt} onChange={e => setSoldAt(e.target.value)} />
      </div>
      <div>
        <label className={LBL}>Notes</label>
        <input className={INP} value={notes} onChange={e => setNotes(e.target.value)} />
      </div>
      {beforeSubmit}
      <button type="submit" disabled={pending}
        className="bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-50"
      >
        {pending ? 'Saving…' : submitLabel}
      </button>
    </>
  )
}
