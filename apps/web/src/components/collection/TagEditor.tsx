'use client'

import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { Tag, X } from 'lucide-react'
import { authFetch } from '@/lib/authFetch'

export function TagEditor({
  entryId,
  tags,
  allTags,
  onSaved,
}: {
  entryId: string
  tags: string[]
  allTags: string[]
  onSaved: (entryId: string, tags: string[]) => void
}) {
  const [input, setInput] = useState('')
  const [open, setOpen] = useState(false)
  const [localTags, setLocalTags] = useState<string[]>(tags)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Keep local in sync when parent re-queries
  useEffect(() => { setLocalTags(tags) }, [tags])

  const suggestions = useMemo(() => {
    if (!input.trim()) return allTags.filter(t => !localTags.includes(t))
    return allTags.filter(t => t.toLowerCase().includes(input.toLowerCase()) && !localTags.includes(t))
  }, [input, allTags, localTags])

  const save = useCallback(async (nextTags: string[]) => {
    setLocalTags(nextTags)
    const saved = await authFetch<string[]>(`/collection/entry/${entryId}/tags`, {
      method: 'PUT',
      body: JSON.stringify({ tags: nextTags }),
    })
    onSaved(entryId, saved)
  }, [entryId, onSaved])

  const addTag = (tag: string) => {
    const t = tag.trim()
    if (!t || localTags.includes(t)) return
    void save([...localTags, t])
    setInput('')
  }

  const removeTag = (tag: string) => {
    void save(localTags.filter(t => t !== tag))
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addTag(input)
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={containerRef} className="mt-1.5" onClick={e => { e.preventDefault(); e.stopPropagation() }}>
      {/* Existing tag chips */}
      {localTags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1">
          {localTags.map(t => (
            <span
              key={t}
              className="inline-flex items-center gap-0.5 text-[10px] bg-amber-500/15 text-amber-400 border border-amber-500/25 px-1.5 py-0.5 rounded-full"
            >
              {t}
              <button
                type="button"
                onClick={() => removeTag(t)}
                className="ml-0.5 hover:text-red-400 transition-colors"
              >
                <X size={9} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Add tag trigger */}
      {open ? (
        <div className="relative">
          <input
            ref={inputRef}
            autoFocus
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Add tag…"
            className="w-full bg-stone-800 border border-amber-500/40 rounded-lg px-2 py-1 text-[11px] text-stone-100 placeholder:text-stone-600 focus:outline-none"
          />
          {(suggestions.length > 0 || input.trim()) && (
            <div className="absolute top-full left-0 right-0 mt-0.5 z-50 bg-stone-900 border border-stone-700 rounded-lg shadow-xl overflow-hidden max-h-32 overflow-y-auto">
              {input.trim() && !localTags.includes(input.trim()) && !suggestions.includes(input.trim()) && (
                <button
                  type="button"
                  onClick={() => addTag(input)}
                  className="w-full text-left text-[11px] px-2.5 py-1.5 hover:bg-stone-800 text-amber-400 transition-colors"
                >
                  + Add &ldquo;{input.trim()}&rdquo;
                </button>
              )}
              {suggestions.map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => addTag(t)}
                  className="w-full text-left text-[11px] px-2.5 py-1.5 hover:bg-stone-800 text-stone-300 transition-colors"
                >
                  {t}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1 text-[10px] text-stone-600 hover:text-amber-400 transition-colors"
        >
          <Tag size={10} />
          {localTags.length === 0 ? 'Add tag' : 'Edit tags'}
        </button>
      )}
    </div>
  )
}
