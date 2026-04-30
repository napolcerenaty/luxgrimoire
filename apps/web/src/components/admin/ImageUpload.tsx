'use client'

import { useRef, useState } from 'react'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api'
const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD ?? ''

function buildPreviewUrl(publicId: string) {
  if (!publicId) return null
  // Already a full URL
  if (publicId.startsWith('http')) return publicId
  return `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/w_160,h_160,c_fill,q_auto,f_auto/${publicId}`
}

interface Props {
  label: string
  folder: string             // e.g. 'luxgrimoire/books'
  value: string              // Cloudinary publicId stored in state
  onChange: (publicId: string) => void
  aspectRatio?: string       // e.g. '2/3' (default) or '1/1'
}

export default function ImageUpload({ label, folder, value, onChange, aspectRatio = '2/3' }: Props) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const previewUrl = buildPreviewUrl(value)

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('luxgrimoire_token') : null
      // Read file as base64 data URI (works with JPEG, PNG, WebP, AVIF, etc.)
      const dataUri = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      const res = await fetch(`${API_BASE}/upload/image`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ data: dataUri, folder }),
      })
      if (!res.ok) throw new Error(await res.text())
      const json = await res.json() as { publicId: string; url: string }
      onChange(json.publicId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
      // reset so same file can be re-uploaded
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const isSquare = aspectRatio === '1/1'

  return (
    <div>
      <label className="block text-sm text-stone-400 mb-2">{label}</label>
      <div className="flex items-start gap-4">
        {/* Preview box */}
        <div
          className="shrink-0 rounded-lg overflow-hidden border border-stone-700 bg-stone-800 flex items-center justify-center"
          style={{ width: isSquare ? 64 : 48, height: isSquare ? 64 : 72 }}
        >
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
          ) : (
            <span className="text-stone-600 text-xs">No img</span>
          )}
        </div>

        {/* Controls */}
        <div className="flex-1 min-w-0">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="px-4 py-2 rounded-lg border border-stone-700 text-stone-300 hover:border-amber-500 hover:text-amber-400 text-sm transition-colors disabled:opacity-50"
          >
            {uploading ? 'Uploading…' : value ? 'Change image' : 'Upload image'}
          </button>
          {value && (
            <p className="text-[11px] text-stone-600 mt-1 truncate font-mono">{value}</p>
          )}
          {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
        </div>
      </div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
    </div>
  )
}
