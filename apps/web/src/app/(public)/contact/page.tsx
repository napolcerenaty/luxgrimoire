'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Mail, Send } from 'lucide-react'
import { API_BASE } from '@/lib/authFetch'

export default function ContactPage() {
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('sending')
    try {
      const res = await fetch(
        `${API_BASE}/bug-reports`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: `Contact: ${form.subject || '(no subject)'}`,
            description: `Name: ${form.name}\nEmail: ${form.email}\n\n${form.message}`,
            category: 'OTHER',
            pageUrl: typeof window !== 'undefined' ? window.location.href : undefined,
          }),
        },
      )
      if (!res.ok) throw new Error('Failed')
      setStatus('sent')
    } catch {
      setStatus('error')
    }
  }

  return (
    <div className="container mx-auto max-w-lg px-4 py-16">
      <div className="flex items-center gap-3 mb-3">
        <Mail size={22} className="text-brand-400" />
        <h1 className="text-4xl font-serif font-bold text-brand-400 tracking-wide">Contact Us</h1>
      </div>
      <p className="text-stone-400 text-sm mb-10">
        Questions, feedback, partnership enquiries, or want to become a contributor?
        We'd love to hear from you.
        For copyright or data issues please use the{' '}
        <Link href="/report" className="text-brand-500 hover:text-brand-400 underline underline-offset-2">
          report page
        </Link>{' '}
        instead.
      </p>

      {status === 'sent' ? (
        <div className="rounded-xl border border-emerald-800 bg-emerald-950/30 px-6 py-8 text-center">
          <p className="text-lg font-serif text-emerald-400 mb-2">Message sent!</p>
          <p className="text-sm text-stone-400">We'll get back to you as soon as possible.</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-stone-400 mb-1.5">Name</label>
              <input
                required
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-stone-700 bg-stone-800/60 text-stone-200 text-sm focus:outline-none focus:border-brand-600 placeholder:text-stone-600"
                placeholder="Your name"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-400 mb-1.5">Email</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-stone-700 bg-stone-800/60 text-stone-200 text-sm focus:outline-none focus:border-brand-600 placeholder:text-stone-600"
                placeholder="you@example.com"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-400 mb-1.5">Subject</label>
            <input
              required
              value={form.subject}
              onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-stone-700 bg-stone-800/60 text-stone-200 text-sm focus:outline-none focus:border-brand-600 placeholder:text-stone-600"
              placeholder="What is this about?"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-400 mb-1.5">Message</label>
            <textarea
              required
              rows={6}
              value={form.message}
              onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-stone-700 bg-stone-800/60 text-stone-200 text-sm focus:outline-none focus:border-brand-600 placeholder:text-stone-600 resize-none"
              placeholder="Your message…"
            />
          </div>

          {status === 'error' && (
            <p className="text-sm text-rose-400">Something went wrong. Please try again.</p>
          )}

          <button
            type="submit"
            disabled={status === 'sending'}
            className="flex items-center gap-2 px-6 py-2.5 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-stone-950 font-serif font-semibold rounded-full transition-colors text-sm"
          >
            <Send size={14} />
            {status === 'sending' ? 'Sending…' : 'Send message'}
          </button>
        </form>
      )}
    </div>
  )
}
