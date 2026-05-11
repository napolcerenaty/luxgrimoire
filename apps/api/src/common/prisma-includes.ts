/**
 * Shared Prisma include/select shapes reused across multiple services.
 * Import these instead of repeating the same nested include objects.
 */

/** Book authors with id+name (used in subscriptions, admin) */
export const bookAuthorsInclude = {
  authors: {
    include: {
      author: { select: { id: true, name: true } },
    },
  },
} as const

/** Book authors with id+name+slug (used in collection, editions) */
export const bookAuthorsWithSlugSelect = {
  authors: {
    select: {
      author: { select: { id: true, name: true, slug: true } },
    },
  },
} as const
