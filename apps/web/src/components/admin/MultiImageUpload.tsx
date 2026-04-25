'use client'

import { useRef, useState } from 'react'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api'
const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD ?? ''

function cloudThumb(id: string) {
  if (!id) return null
  if (id.startsWith('http')) return id
  return `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/w_120,h_160,c_fill,q_auto,f_auto/${id}`
}

export async function uploadImage(file: File, folder: string): Promise<string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('luxgrimoire_token') : null
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
  const json = await res.json() as { publicId: string }
  return json.publicId
}

export async function deleteImage(publicId: string): Promise<void> {
  if (!publicId || publicId.startsWith('http')) return
  const token = typeof window !== 'undefined' ? localStorage.getItem('luxgrimoire_token') : null
  await fetch(`${API_BASE}/upload/image`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ publicId }),
  })
}

interface Props {
  images: string[]
  folder: string
  onChange: (v: string[]) => void
}

export default function MultiImageUpload({ images, folder, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState('')
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    setUploading(true)
    const results: string[] = [...images]
    for (let i = 0; i < files.length; i++) {
      setProgress(`Uploading ${i + 1} / ${files.length}…`)
      try {
        const id = await uploadImage(files[i], folder)
        results.push(id)
        onChange([...results])
      } catch { /* skip failed */ }
    }
    setProgress('')
    setUploading(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault()
    if (dragIndex === null || dragIndex === targetIndex) {
      setDragIndex(null)
      setDragOver(null)
      return
    }
    const reordered = [...images]
    const [moved] = reordered.splice(dragIndex, 1)
    reordered.splice(targetIndex, 0, moved)
    onChange(reordered)
    setDragIndex(null)
    setDragOver(null)
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <button type="button" disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-stone-700 text-stone-300 hover:bg-stone-600 disabled:opacity-50 transition-colors">
          {uploading ? progress : images.length === 0 ? '+ Upload images' : '+ Add more images'}
        </button>
        <span className="text-stone-600 text-xs">
          {images.length === 0
            ? 'first image will be the main cover'
            : 'drag to reorder · first = main cover'}
        </span>
      </div>
      <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFiles} />
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-1">
          {images.map((img, i) => {
            const thumb = cloudThumb(img)
            const isMain = i === 0
            const isDragging = dragIndex === i
            const isOver = dragOver === i && dragIndex !== i
            return (
              <div
                key={img + i}
                draggable
                onDragStart={() => setDragIndex(i)}
                onDragOver={(e) => { e.preventDefault(); setDragOver(i) }}
                onDrop={(e) => handleDrop(e, i)}
                onDragEnd={() => { setDragIndex(null); setDragOver(null) }}
                className={`relative group cursor-grab active:cursor-grabbing transition-opacity ${isDragging ? 'opacity-40' : 'opacity-100'}`}
              >
                <div className={`w-16 h-20 rounded-lg overflow-hidden bg-stone-800 border transition-all ${
                  isOver
                    ? 'border-amber-400 ring-2 ring-amber-400/40 scale-105'
                    : isMain
                    ? 'border-amber-500 ring-1 ring-amber-500/40'
                    : 'border-stone-700'
                }`}>
                  {thumb
                    ? <img src={thumb} alt="" className="w-full h-full object-cover pointer-events-none" />
                    : <span className="text-stone-600 text-[9px] flex items-center justify-center h-full">img</span>
                  }
                </div>
                {isMain && (
                  <span className="absolute bottom-1 left-0 right-0 text-center text-[9px] font-semibold uppercase text-amber-400 bg-stone-950/70 px-0.5 py-px leading-tight">
                    main
                  </span>
                )}
                <button type="button"
                  onClick={() => { deleteImage(img); onChange(images.filter((_, j) => j !== i)) }}
                  className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10">
                  ✕
                </button>
                {!isMain && (
                  <button type="button"
                    onClick={() => {
                      const reordered = [...images]
                      reordered.splice(i, 1)
                      reordered.unshift(img)
                      onChange(reordered)
                    }}
                    title="Set as main cover"
                    className="absolute bottom-1 left-0 right-0 text-center text-[9px] text-stone-500 hover:text-amber-400 bg-stone-950/70 px-0.5 py-px leading-tight opacity-0 group-hover:opacity-100 transition-opacity">
                    set main
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
