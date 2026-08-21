'use client'

import Link from 'next/link'
import { cloudinaryUrl } from '@/lib/cloudinary'
import { brandGradientStyle, brandTextClasses } from '@/lib/brandGradient'
import { formatEditionDisplayTitle } from '@/lib/editionTitle'
import type { ApiSaleAnnouncement } from '@luxgrimoire/shared-types'

type SaleEdition = NonNullable<ApiSaleAnnouncement['editions']>[number]

interface Props {
  editions: SaleEdition[]
  items?: ApiSaleAnnouncement['items']
  saleBrandColors?: string[] | null
  /** Compact mode: smaller cards, fewer columns (for modals) */
  compact?: boolean
  onLinkClick?: () => void
}

function EditionCard({
  ed,
  saleBrandColors,
  compact,
  onLinkClick,
}: {
  ed: SaleEdition
  saleBrandColors?: string[] | null
  compact?: boolean
  onLinkClick?: () => void
}) {
  const { edition, editionId } = ed
  if (!edition) return null
  const book = edition.book
  const authors = (book?.authors ?? []) as any[]
  const raw = edition.additionalImages?.[0]
  const imgSrc = raw ? cloudinaryUrl(raw, 'w_200,h_300,c_fill,q_auto,f_auto') : null
  const title = formatEditionDisplayTitle(book, edition) || (edition as any).bookBoxCompany?.name || 'Edition'
  const colors = (edition as any).bookBoxCompany?.brandColors ?? saleBrandColors
  const href = `/editions/${(edition as any).slug ?? editionId}`

  return (
    <Link
      key={`${editionId}-${ed.itemId ?? 'standalone'}`}
      href={href}
      onClick={onLinkClick}
      className="group rounded-lg overflow-hidden border border-navy-700 hover:border-brand-500/40 transition-colors bg-navy-900"
    >
      {imgSrc ? (
        <div className="relative w-full" style={{ aspectRatio: '2/3' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imgSrc} alt={title} className="object-cover group-hover:scale-105 transition-transform w-full h-full" />
        </div>
      ) : (
        <div
          className="w-full relative flex items-center justify-center overflow-hidden"
          style={{ aspectRatio: '2/3', ...brandGradientStyle(colors) }}
        >
          <p className={`relative z-10 font-serif text-center leading-tight px-2 line-clamp-4 ${brandTextClasses(colors).primary} ${compact ? 'text-[10px]' : 'text-xs'}`}>{title}</p>
        </div>
      )}
      <div className={compact ? 'px-2 py-1.5' : 'p-3'}>
        <p className={`text-navy-200 font-medium leading-tight line-clamp-2 ${compact ? 'text-xs' : 'text-sm'}`}>{title}</p>
        {authors.length > 0 && (
          <p className={`text-navy-500 mt-0.5 line-clamp-1 ${compact ? 'text-[10px]' : 'text-xs'}`}>
            {authors.map((a: any) => (a.author ?? a).name).join(', ')}
          </p>
        )}
      </div>
    </Link>
  )
}

export function SaleEditionsGrid({ editions, items = [], saleBrandColors, compact = false, onLinkClick }: Props) {
  if (editions.length === 0) return null

  const itemMap = new Map((items ?? []).map(it => [it.id, it]))
  const grouped = new Map<string, SaleEdition[]>()
  const standalone: SaleEdition[] = []

  for (const ed of editions) {
    if (ed.itemId) {
      if (!grouped.has(ed.itemId)) grouped.set(ed.itemId, [])
      grouped.get(ed.itemId)!.push(ed)
      if ((ed as any).isStandalone) standalone.push(ed)
    } else {
      standalone.push(ed)
    }
  }

  const hasGroups = grouped.size > 0
  const cols = compact
    ? 'grid-cols-3 sm:grid-cols-4'
    : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'

  const SectionDivider = ({ label }: { label: string }) => (
    <h3 className={`font-semibold text-navy-300 mb-3 flex items-center gap-2 ${compact ? 'text-xs' : 'text-base'}`}>
      <span className="h-px flex-1 bg-navy-800" />
      <span>{label}</span>
      <span className="h-px flex-1 bg-navy-800" />
    </h3>
  )

  const sortedItems = [...(items ?? [])].sort((a, b) => a.sortOrder - b.sortOrder)

  return (
    <div className="space-y-6">
      {/* Grouped sections */}
      {hasGroups && sortedItems.map(item => {
        const groupEditions = grouped.get(item.id) ?? []
        if (groupEditions.length === 0) return null
        return (
          <div key={item.id}>
            {item.name && <SectionDivider label={item.name} />}
            <div className={`grid ${cols} gap-3`}>
              {groupEditions.map(ed => (
                <EditionCard key={`${ed.editionId}-${ed.itemId}`} ed={ed} saleBrandColors={saleBrandColors} compact={compact} onLinkClick={onLinkClick} />
              ))}
            </div>
          </div>
        )
      })}

      {/* Standalone / ungrouped */}
      {standalone.length > 0 && (
        <div>
          {hasGroups && <SectionDivider label="Also available standalone" />}
          <div className={`grid ${cols} gap-3`}>
            {standalone.map(ed => (
              <EditionCard key={`${ed.editionId}-standalone`} ed={ed} saleBrandColors={saleBrandColors} compact={compact} onLinkClick={onLinkClick} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
