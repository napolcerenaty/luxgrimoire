'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, Link2, Mail, Share2 } from 'lucide-react'

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  )
}

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.148-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
      <path d="M20.52 3.449C12.831-3.984.106 1.407.101 11.893c0 2.096.549 4.14 1.595 5.945L0 24l6.335-1.652c1.742.943 3.708 1.444 5.71 1.446h.005c9.61 0 14.75-11.386 8.475-18.09zM12.05 21.785h-.004a9.81 9.81 0 01-5.001-1.373l-.359-.213-3.72.968.995-3.638-.235-.375A9.792 9.792 0 012.148 11.9c0-5.463 4.448-9.91 9.923-9.91 2.652 0 5.144 1.038 7.021 2.916 1.876 1.878 2.909 4.373 2.907 7.028-.003 5.462-4.45 9.851-9.949 9.851z" />
    </svg>
  )
}

interface BlogShareButtonProps {
  url: string
  title: string
  imageUrl?: string | null
  className?: string
}

// Hybrid share UI: on devices/browsers that support the native Web Share API (mostly mobile),
// tapping the button opens the OS share sheet directly — no menu needed. Everywhere else
// (desktop browsers largely don't implement it) it falls back to a small dropdown of per-platform
// share-intent links plus copy-link, since there's no native equivalent to defer to.
export default function BlogShareButton({ url, title, imageUrl, className }: BlogShareButtonProps) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  async function handleShareClick() {
    if (navigator.share) {
      const shareData: ShareData = { title, url }

      // Instagram (and some other apps) only offer "Add to Story" in the native share
      // sheet when the payload includes an actual image file — a URL/text-only share
      // just gets the DM/message option. Fetch the post's feature image and attach it
      // as a File when the browser supports file sharing; silently fall back to the
      // link-only share if the fetch fails or files aren't supported (desktop browsers,
      // CORS-blocked hosts, etc).
      if (imageUrl) {
        try {
          const res = await fetch(imageUrl)
          const blob = await res.blob()
          const ext = blob.type.split('/')[1] ?? 'jpg'
          const file = new File([blob], `share.${ext}`, { type: blob.type })
          if (navigator.canShare?.({ files: [file] })) {
            shareData.files = [file]
          }
        } catch {
          // Image fetch/CORS failed — share without an image instead of blocking the action.
        }
      }

      try {
        await navigator.share(shareData)
      } catch {
        // User cancelled the native share sheet, or it failed silently — nothing to do.
      }
      return
    }
    setOpen((v) => !v)
  }

  function openSharePopup(shareUrl: string) {
    window.open(shareUrl, '_blank', 'noopener,noreferrer,width=550,height=420')
    setOpen(false)
  }

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard API unavailable (e.g. insecure context) — nothing to do.
    }
  }

  const encodedUrl = encodeURIComponent(url)
  const encodedTitle = encodeURIComponent(title)
  const menuItemClass = 'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors hover:bg-[var(--accent-glow)]'

  return (
    <div ref={containerRef} className={`relative inline-block ${className ?? ''}`}>
      <button
        onClick={handleShareClick}
        className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-serif uppercase tracking-wide transition-colors hover:text-[var(--accent-bright)]"
        style={{ borderColor: 'var(--border)', color: 'var(--text-dim)' }}
      >
        <Share2 size={14} />
        Share
      </button>

      {open && (
        <div
          className="absolute right-0 z-20 mt-2 w-48 rounded-xl border p-1.5 shadow-xl"
          style={{ background: 'var(--bg-raised)', borderColor: 'var(--border)' }}
        >
          <button
            onClick={() => openSharePopup(`https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`)}
            className={menuItemClass}
            style={{ color: 'var(--text)' }}
          >
            <XIcon className="w-4 h-4 shrink-0" />
            X (Twitter)
          </button>
          <button
            onClick={() => openSharePopup(`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`)}
            className={menuItemClass}
            style={{ color: 'var(--text)' }}
          >
            <FacebookIcon className="w-4 h-4 shrink-0" />
            Facebook
          </button>
          <button
            onClick={() => openSharePopup(`https://wa.me/?text=${encodedTitle}%20${encodedUrl}`)}
            className={menuItemClass}
            style={{ color: 'var(--text)' }}
          >
            <WhatsAppIcon className="w-4 h-4 shrink-0" />
            WhatsApp
          </button>
          <a
            href={`mailto:?subject=${encodedTitle}&body=${encodedUrl}`}
            className={menuItemClass}
            style={{ color: 'var(--text)' }}
          >
            <Mail size={16} className="shrink-0" />
            Email
          </a>
          <div className="my-1 h-px" style={{ background: 'var(--border)' }} />
          <button onClick={handleCopyLink} className={menuItemClass} style={{ color: 'var(--text)' }}>
            {copied ? <Check size={16} className="shrink-0 text-emerald-400" /> : <Link2 size={16} className="shrink-0" />}
            {copied ? 'Copied!' : 'Copy link'}
          </button>
        </div>
      )}
    </div>
  )
}
