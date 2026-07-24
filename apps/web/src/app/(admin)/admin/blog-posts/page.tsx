'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'
import { cloudinaryUrl } from '@/lib/cloudinary'
import FormModal from '@/components/admin/FormModal'
import ImageUpload from '@/components/admin/ImageUpload'
import { BTN_GHOST, BTN_PRIMARY } from '@/lib/adminFormStyles'

interface BlogPost {
  id: string
  title: string
  slug: string
  featureImage: string | null
}

function isCloudinaryUrl(url: string | null): url is string {
  return !!url && url.includes('res.cloudinary.com')
}

export default function BlogPostsAdminPage() {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<BlogPost | null>(null)
  const [publicId, setPublicId] = useState('')
  const [error, setError] = useState<string>()

  const { data: posts = [], isLoading } = useQuery<BlogPost[]>({
    queryKey: ['admin', 'blog-posts'],
    queryFn: () => authFetch<BlogPost[]>('/admin/blog-posts'),
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin', 'blog-posts'] })

  const saveMutation = useMutation({
    mutationFn: ({ slug, imageUrl }: { slug: string; imageUrl: string }) =>
      authFetch(`/admin/blog-posts/${slug}/feature-image`, {
        method: 'PUT',
        body: JSON.stringify({ imageUrl }),
      }),
    onSuccess: async () => {
      setEditing(null)
      setError(undefined)
      await invalidate()
    },
    onError: (err: unknown) => setError(err instanceof Error ? err.message : 'Failed to save'),
  })

  const clearMutation = useMutation({
    mutationFn: (slug: string) => authFetch(`/admin/blog-posts/${slug}/feature-image`, { method: 'DELETE' }),
    onSuccess: async () => {
      setEditing(null)
      setError(undefined)
      await invalidate()
    },
    onError: (err: unknown) => setError(err instanceof Error ? err.message : 'Failed to remove'),
  })

  const openEditor = (post: BlogPost) => {
    setError(undefined)
    setPublicId(isCloudinaryUrl(post.featureImage) ? post.featureImage : '')
    setEditing(post)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-stone-100">Blog Posts</h1>
        <p className="mt-1 text-sm text-stone-400">
          Set each post&apos;s feature image from your Cloudinary media library, or upload a new one directly —
          no need to open Ghost or Cloudinary separately.
        </p>
      </div>

      <div className="grid gap-3">
        {isLoading && (
          <div className="rounded-2xl border border-stone-800 bg-stone-900 p-6 text-sm text-stone-400">Loading…</div>
        )}
        {!isLoading && posts.length === 0 && (
          <div className="rounded-2xl border border-dashed border-stone-700 bg-stone-900/70 p-8 text-center text-sm text-stone-400">
            No posts found.
          </div>
        )}
        {posts.map((post) => (
          <div key={post.id} className="flex items-center gap-4 rounded-2xl border border-stone-800 bg-stone-900 p-4">
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-stone-700 bg-stone-800 flex items-center justify-center">
              {post.featureImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={post.featureImage} alt={post.title} className="h-full w-full object-cover" />
              ) : (
                <span className="text-[10px] text-stone-600">No image</span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-stone-100">{post.title}</p>
              <p className="truncate text-xs text-stone-500">/{post.slug}</p>
            </div>
            <button onClick={() => openEditor(post)} className={BTN_GHOST}>
              Edit image
            </button>
          </div>
        ))}
      </div>

      <FormModal
        open={editing !== null}
        title={editing ? `Feature image — ${editing.title}` : ''}
        onClose={() => setEditing(null)}
      >
        {editing && (
          <div className="space-y-4">
            {editing.featureImage && !isCloudinaryUrl(editing.featureImage) && (
              <p className="text-xs text-stone-500">
                Current image isn&apos;t hosted on Cloudinary yet — uploading or picking one below will replace it.
              </p>
            )}
            <ImageUpload
              label="Feature image"
              folder="luxgrimoire/blog"
              value={publicId}
              onChange={setPublicId}
              onClear={() => setPublicId('')}
            />
            {error && <p className="text-sm text-red-400">{error}</p>}
            <div className="flex justify-between gap-3 pt-2">
              <button
                type="button"
                onClick={() => clearMutation.mutate(editing.slug)}
                disabled={!editing.featureImage || clearMutation.isPending}
                className="rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600 disabled:opacity-50 disabled:hover:bg-red-700"
              >
                {clearMutation.isPending ? 'Removing…' : 'Remove image'}
              </button>
              <div className="flex gap-3">
                <button type="button" onClick={() => setEditing(null)} className={BTN_GHOST}>
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!publicId || saveMutation.isPending}
                  onClick={() => {
                    const url = cloudinaryUrl(publicId, 'q_auto,f_auto')
                    if (url) saveMutation.mutate({ slug: editing.slug, imageUrl: url })
                  }}
                  className={BTN_PRIMARY}
                >
                  {saveMutation.isPending ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        )}
      </FormModal>
    </div>
  )
}
