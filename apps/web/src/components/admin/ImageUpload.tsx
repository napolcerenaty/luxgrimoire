'use client'

import { useRef, useState } from 'react'
import { cloudinaryUrl, uploadImage, deleteImage } from '@/lib/cloudinary'

interface Props {
  label: string
  folder: string             // e.g. 'luxgrimoire/books'
  value: string              // Cloudinary publicId stored in state
  onChange: (publicId: string) => void
  onClear?: () => void       // optional — shows "Remove" button when provided
  aspectRatio?: string       // e.g. '2/3' (default) or '1/1'
}

export default function ImageUpload({ label, folder, value, onChange, onClear, aspectRatio = '2/3' }: Props) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const previewUrl = cloudinaryUrl(value, 'w_160,h_160,c_fill,q_auto,f_auto')

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)
    const previousId = value
    try {
      const publicId = await uploadImage(file, folder)
      onChange(publicId)
      if (previousId) void deleteImage(previousId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
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
          {value && onClear && (
            <button
              type="button"
              onClick={onClear}
              className="ml-2 px-3 py-2 rounded-lg border border-red-800 text-red-400 hover:border-red-500 hover:text-red-300 text-sm transition-colors"
            >
              Remove
            </button>
          )}
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

