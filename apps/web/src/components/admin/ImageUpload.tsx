'use client'

import { useRef, useState } from 'react'
import MediaLibraryPicker from '@/components/admin/MediaLibraryPicker'
import { cloudinaryUrl, uploadImage, deleteImage } from '@/lib/cloudinary'
import type { MediaAssetItem } from '@/lib/mediaAssets'

interface Props {
  label: string
  folder: string             // e.g. 'luxgrimoire/books'
  value: string              // Cloudinary publicId stored in state
  onChange: (publicId: string) => void
  onClear?: () => void       // optional — shows "Remove" button when provided
  aspectRatio?: string       // e.g. '2/3' (default) or '1/1'
  /**
   * Auto-delete the replaced image from Cloudinary on upload — safe only when `value` is
   * tracked by a real DB foreign key (MediaAssetsService.countUsages() checks those FKs
   * before deleting). Set to false for fields with no such FK (e.g. blog feature images,
   * which live in Ghost, not this app's DB) — otherwise every replacement silently deletes
   * an asset that's still in use elsewhere, since countUsages() has no way to see it.
   */
  deletePreviousOnReplace?: boolean
}

export default function ImageUpload({
  label,
  folder,
  value,
  onChange,
  onClear,
  aspectRatio = '2/3',
  deletePreviousOnReplace = true,
}: Props) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
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
      if (previousId && deletePreviousOnReplace) void deleteImage(previousId)
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
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="px-4 py-2 rounded-lg border border-stone-700 text-stone-300 hover:border-amber-500 hover:text-amber-400 text-sm transition-colors disabled:opacity-50"
            >
              {uploading ? 'Uploading…' : value ? 'Change image' : 'Upload image'}
            </button>
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-stone-700 text-stone-300 hover:bg-stone-600 transition-colors"
            >
              Pick from library
            </button>
          </div>
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
      <MediaLibraryPicker
        open={pickerOpen}
        folder={folder}
        onClose={() => setPickerOpen(false)}
        onSelect={(assets: MediaAssetItem[]) => {
          if (assets[0]) onChange(assets[0].publicId)
          setPickerOpen(false)
        }}
      />
    </div>
  )
}
