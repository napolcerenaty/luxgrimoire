'use client'

import { useState } from 'react'
import { AlertTriangle, CheckCircle } from 'lucide-react'
import { API_BASE } from '@/lib/authFetch'

const REPORT_TYPES = [
  { value: 'copyright',    label: '© Copyright / DMCA Violation', description: 'Unauthorized use of copyrighted images, text, or artwork' },
  { value: 'incorrect',    label: '📖 Incorrect Book Data',        description: 'Wrong title, author, cover image, or other factual error' },
  { value: 'inappropriate',label: '🚫 Inappropriate Content',      description: 'Offensive, misleading, or harmful content' },
  { value: 'spam',         label: '📣 Spam or Fake Listing',       description: 'Duplicate, spam, or fraudulent entry' },
  { value: 'privacy',      label: '🔒 Privacy Concern',            description: 'Personal data that should not be public' },
  { value: 'other',        label: '✏️ Other',                      description: 'Something else not listed above' },
]


export default function ReportPage() {
  const [type, setType] = useState('')
  const [description, setDescription] = useState('')
  const [url, setUrl] = useState('')
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!type || !description.trim()) return
    setSubmitting(true)
    setError('')

    const selectedType = REPORT_TYPES.find((r) => r.value === type)
    const title = `Report: ${selectedType?.label ?? type}`
    const fullDescription = email
      ? `${description}\n\n— Contact: ${email}`
      : description

    try {
      const res = await fetch(`${API_BASE}/bug-reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description: fullDescription,
          pageUrl: url || undefined,
          category: type,
        }),
      })
      if (res.ok) {
        setDone(true)
      } else {
        const data = await res.json().catch(() => ({}))
        setError(data.message ?? 'Failed to submit report. Please try again.')
      }
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <div className="min-h-screen bg-stone-950 flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center">
          <CheckCircle size={48} className="text-green-400 mx-auto mb-4" />
          <h1 className="font-serif text-2xl text-stone-100 mb-2">Report submitted</h1>
          <p className="text-stone-400 text-sm leading-relaxed">
            Thank you for helping keep LuxGrimoire accurate and safe. We will review your report and take appropriate action.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-stone-950 px-4 py-12">
      <div className="max-w-xl mx-auto">
        <div className="flex items-center gap-3 mb-2">
          <AlertTriangle size={22} className="text-rose-500" />
          <h1 className="font-serif text-2xl text-stone-100">Report an Issue</h1>
        </div>
        <p className="text-stone-400 text-sm mb-8 leading-relaxed">
          Use this form to report copyright violations, incorrect data, inappropriate content, or any other concern.
          For DMCA take-down requests please include the specific URL and your contact email.
        </p>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Type */}
          <div>
            <label className="block text-sm text-stone-400 mb-2">Report type <span className="text-rose-500">*</span></label>
            <div className="space-y-2">
              {REPORT_TYPES.map((rt) => (
                <label
                  key={rt.value}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    type === rt.value
                      ? 'border-brand-600 bg-brand-950/20'
                      : 'border-stone-700 hover:border-stone-500'
                  }`}
                >
                  <input
                    type="radio"
                    name="type"
                    value={rt.value}
                    checked={type === rt.value}
                    onChange={() => setType(rt.value)}
                    className="mt-0.5 accent-brand-500"
                  />
                  <div>
                    <p className="text-sm text-stone-200">{rt.label}</p>
                    <p className="text-xs text-stone-500">{rt.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* URL */}
          <div>
            <label className="block text-sm text-stone-400 mb-1">
              Page or content URL <span className="text-stone-600">(optional but helpful)</span>
            </label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://luxgrimoire.com/editions/..."
              className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-stone-100 text-sm focus:outline-none focus:border-brand-500 transition-colors"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm text-stone-400 mb-1">
              Description <span className="text-rose-500">*</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              placeholder="Please describe the issue in detail…"
              className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-stone-100 text-sm focus:outline-none focus:border-brand-500 transition-colors resize-none"
              required
            />
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm text-stone-400 mb-1">
              Your email <span className="text-stone-600">(optional — needed if you want a response)</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-stone-100 text-sm focus:outline-none focus:border-brand-500 transition-colors"
            />
          </div>

          {error && (
            <p className="text-sm text-rose-400 bg-rose-950/30 border border-rose-900/50 rounded-lg px-3 py-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={!type || !description.trim() || submitting}
            className="w-full py-3 bg-rose-800 hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-full transition-colors text-sm"
          >
            {submitting ? 'Submitting…' : 'Submit Report'}
          </button>
        </form>
      </div>
    </div>
  )
}
