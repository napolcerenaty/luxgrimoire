import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { apiFetch } from '@/lib/api'
import { cloudinaryUrl } from '@/lib/cloudinary'
import { Badge } from '@/components/ui/Badge'
import type { ApiSubscription } from '@luxgrimoire/shared-types'

interface Props {
  params: Promise<{ slug: string }>
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  try {
    const sub = await apiFetch<ApiSubscription>(`/subscriptions/${slug}`)
    return {
      title: sub.name,
      description: sub.description ?? `${sub.name} subscription box on LuxGrimoire`,
      openGraph: {
        title: sub.name,
        description: sub.description ?? undefined,
      },
    }
  } catch {
    return { title: 'Subscription not found' }
  }
}

export default async function SubscriptionPage({ params }: Props) {
  const { slug } = await params

  let sub: ApiSubscription
  try {
    sub = await apiFetch<ApiSubscription>(`/subscriptions/${slug}`)
  } catch {
    notFound()
  }

  const coverUrl = cloudinaryUrl(sub.coverImage, 'w_800,c_fill,q_auto,f_auto')
  const months = (sub.months ?? []).sort((a, b) => {
    if (b.year !== a.year) return b.year - a.year
    return b.month - a.month
  })

  return (
    <div className="container mx-auto px-4 py-10 max-w-5xl">
      {/* Back to company */}
      {sub.company && (
        <Link
          href={`/companies/${sub.company.slug}`}
          className="flex items-center gap-2 mb-6 text-sm text-stone-400 hover:text-amber-400 transition-colors w-fit"
        >
          {cloudinaryUrl(sub.company.logoUrl, 'w_40,h_40,c_fill,q_auto,f_auto') && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cloudinaryUrl(sub.company.logoUrl, 'w_40,h_40,c_fill,q_auto,f_auto')!}
              alt={sub.company.name}
              className="w-6 h-6 rounded object-cover"
            />
          )}
          <span>← {sub.company.name}</span>
        </Link>
      )}

      <div className="grid grid-cols-1 md:grid-cols-[1fr_320px] gap-10 mb-12">
        <div>
          <div className="flex items-center gap-3 flex-wrap mb-3">
            {sub.genre && <Badge variant="outline">{sub.genre}</Badge>}
            <Badge variant={sub.isDiscontinued ? 'destructive' : 'success'}>
              {sub.isDiscontinued ? 'Discontinued' : 'Active'}
            </Badge>
          </div>

          <h1 className="text-4xl font-serif font-bold text-stone-100 mb-4 leading-tight">
            {sub.name}
          </h1>

          {sub.description && (
            <p className="text-stone-300 leading-relaxed">{sub.description}</p>
          )}

          <div className="flex gap-4 mt-4 text-xs text-stone-500">
            {sub.startDate && <span>Started: {sub.startDate.slice(0, 7)}</span>}
            {sub.endDate && <span>Ended: {sub.endDate.slice(0, 7)}</span>}
          </div>
        </div>

        {coverUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverUrl}
            alt={sub.name}
            className="rounded-xl shadow-xl w-full object-cover"
          />
        )}
      </div>

      {/* Months */}
      {months.length > 0 && (
        <section>
          <h2 className="text-2xl font-serif font-semibold text-stone-100 mb-6">
            Past Boxes ({months.length})
          </h2>
          <div className="space-y-8">
            {months.map((monthData) => {
              const monthCover = cloudinaryUrl(monthData.coverImage, 'w_400,c_fill,q_auto,f_auto')
              const monthName = MONTH_NAMES[monthData.month - 1]
              const mainBooks = monthData.books.filter((b) => b.isMainBook)
              const extras = monthData.books.filter((b) => !b.isMainBook)

              return (
                <div
                  key={monthData.id}
                  className="rounded-xl bg-stone-900 border border-stone-800 overflow-hidden"
                >
                  <div className="flex flex-col sm:flex-row gap-0">
                    {monthCover && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={monthCover}
                        alt={`${monthName} ${monthData.year}`}
                        className="w-full sm:w-48 h-40 sm:h-auto object-cover shrink-0"
                      />
                    )}
                    <div className="p-5 flex-1">
                      <div className="flex items-center gap-3 flex-wrap mb-3">
                        <h3 className="font-serif text-lg font-semibold text-amber-400">
                          {monthName} {monthData.year}
                        </h3>
                        {monthData.theme && (
                          <Badge variant="outline">{monthData.theme}</Badge>
                        )}
                        {monthData.isSpoiler && (
                          <Badge variant="warning">Spoiler</Badge>
                        )}
                      </div>

                      {mainBooks.length > 0 && (
                        <div className="mb-3">
                          <p className="text-xs text-stone-500 uppercase tracking-wider mb-2 font-medium">
                            Main Book
                          </p>
                          {mainBooks.map((mb) => (
                            <Link
                              key={mb.bookId}
                              href={`/books/${mb.book.slug}`}
                              className="flex items-center gap-3 group"
                            >
                              {cloudinaryUrl(mb.book.coverImage, 'w_60,c_fill,q_auto,f_auto') && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={cloudinaryUrl(mb.book.coverImage, 'w_60,c_fill,q_auto,f_auto')!}
                                  alt={mb.book.title}
                                  className="w-10 h-14 rounded object-cover shrink-0"
                                />
                              )}
                              <div>
                                <p className="text-sm font-medium text-stone-100 group-hover:text-amber-400 transition-colors">
                                  {mb.book.title}
                                </p>
                                {mb.book.authors.length > 0 && (
                                  <p className="text-xs text-stone-400">
                                    {mb.book.authors.map((a) => a.name).join(', ')}
                                  </p>
                                )}
                              </div>
                            </Link>
                          ))}
                        </div>
                      )}

                      {extras.length > 0 && (
                        <div>
                          <p className="text-xs text-stone-500 uppercase tracking-wider mb-2 font-medium">
                            Extras
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {extras.map((eb) => (
                              <Link
                                key={eb.bookId}
                                href={`/books/${eb.book.slug}`}
                                className="text-xs text-stone-400 hover:text-amber-400 transition-colors"
                              >
                                {eb.book.title}
                              </Link>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
