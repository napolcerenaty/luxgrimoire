import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { apiFetch } from '@/lib/api'
import { cloudinaryUrl } from '@/lib/cloudinary'
import { FollowButton } from '@/components/social/FollowButton'

interface ProfileData {
  id: string
  username: string
  avatarUrl: string | null
  bio: string | null
  createdAt: string
  _count?: {
    favoriteBooks?: number
  }
}

interface Review {
  id: string
  rating: number
  title: string | null
  body: string
  createdAt: string
  book: {
    id: string
    slug: string
    title: string
    coverImage: string | null
  }
}

interface ReviewsData {
  data: Review[]
}

interface FollowCounts {
  followers: number
  following: number
}

interface Props {
  params: Promise<{ username: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params
  try {
    const profile = await apiFetch<ProfileData>(`/profile/${username}`)
    return {
      title: `${profile.username} — LuxGrimoire`,
      description: profile.bio ?? `${profile.username}'s profile on LuxGrimoire`,
    }
  } catch {
    return { title: 'User not found' }
  }
}

function StarIcons({ rating }: { rating: number }) {
  return (
    <span className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <svg
          key={i}
          className={`w-3 h-3 ${i <= rating ? 'text-amber-400' : 'text-stone-700'}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </span>
  )
}

export default async function UserProfilePage({ params }: Props) {
  const { username } = await params

  let profile: ProfileData
  try {
    profile = await apiFetch<ProfileData>(`/profile/${username}`)
  } catch {
    notFound()
  }

  const [reviewsData, followCounts] = await Promise.allSettled([
    apiFetch<ReviewsData>(`/users/${username}/reviews?pageSize=3`),
    apiFetch<FollowCounts>(`/users/${username}/followers?pageSize=1`).then(async () => {
      // fetch follow counts from social endpoint
      const [f, fg] = await Promise.all([
        apiFetch<{ total: number }>(`/users/${username}/followers?pageSize=1`),
        apiFetch<{ total: number }>(`/users/${username}/following?pageSize=1`),
      ])
      return { followers: f.total, following: fg.total }
    }),
  ])

  const reviews = reviewsData.status === 'fulfilled' ? reviewsData.value.data : []
  const counts = followCounts.status === 'fulfilled' ? followCounts.value : { followers: 0, following: 0 }

  const avatarUrl = profile.avatarUrl
    ? cloudinaryUrl(profile.avatarUrl, 'w_200,h_200,c_fill,q_auto,f_auto')
    : null

  return (
    <div className="container mx-auto px-4 py-10 max-w-3xl">
      {/* Profile header */}
      <div className="rounded-2xl bg-stone-900 border border-stone-800 p-8 mb-8">
        <div className="flex items-start gap-6">
          <div className="w-20 h-20 rounded-full bg-stone-700 overflow-hidden shrink-0 flex items-center justify-center text-stone-400 text-2xl font-bold">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt={profile.username} className="w-full h-full object-cover" />
            ) : (
              profile.username[0]?.toUpperCase()
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h1 className="text-2xl font-serif font-bold text-stone-100">{profile.username}</h1>
                <p className="text-stone-500 text-sm">@{profile.username}</p>
              </div>
              <FollowButton username={profile.username} initialIsFollowing={false} />
            </div>
            {profile.bio && (
              <p className="text-stone-300 text-sm mt-3 leading-relaxed">{profile.bio}</p>
            )}
            <div className="flex gap-6 mt-4">
              <div className="text-center">
                <p className="text-lg font-semibold text-stone-100">{counts.followers}</p>
                <p className="text-xs text-stone-500">Followers</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-semibold text-stone-100">{counts.following}</p>
                <p className="text-xs text-stone-500">Following</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent reviews */}
      {reviews.length > 0 && (
        <section className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-serif font-semibold text-stone-100">Recent Reviews</h2>
            <Link
              href={`/users/${username}/reviews`}
              className="text-amber-400 text-sm hover:underline"
            >
              View all
            </Link>
          </div>
          <div className="space-y-4">
            {reviews.map((review) => (
              <div key={review.id} className="rounded-2xl bg-stone-900 border border-stone-800 p-5">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <Link href={`/books/${review.book.slug}`} className="font-medium text-stone-100 hover:text-amber-400 text-sm">
                      {review.book.title}
                    </Link>
                    <div className="flex items-center gap-2 mt-1">
                      <StarIcons rating={review.rating} />
                      <span className="text-xs text-stone-500">
                        {new Date(review.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    {review.title && (
                      <p className="text-sm font-medium text-stone-200 mt-2">{review.title}</p>
                    )}
                    <p className="text-stone-400 text-sm mt-1 line-clamp-2">{review.body}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Collection link */}
      <div className="rounded-2xl bg-stone-900 border border-stone-800 p-6 text-center">
        <p className="text-stone-400 text-sm mb-3">View {profile.username}&apos;s book collection</p>
        <Link
          href={`/users/${username}/collection`}
          className="inline-block px-5 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm font-medium hover:bg-amber-500/20 transition-colors"
        >
          Browse Collection
        </Link>
      </div>
    </div>
  )
}
