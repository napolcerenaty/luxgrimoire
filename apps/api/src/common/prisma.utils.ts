import { NotFoundException } from '@nestjs/common';

/**
 * Fetch a Prisma model record by slug, throwing NotFoundException if not found.
 * Usage: const sub = await findBySlugOrThrow(this.prisma.subscription, slug, 'Subscription')
 */
export async function findBySlugOrThrow<T>(
  model: { findUnique: (args: { where: { slug: string } }) => Promise<T | null> },
  slug: string,
  label: string,
): Promise<T> {
  const record = await model.findUnique({ where: { slug } });
  if (!record) throw new NotFoundException(`${label} not found`);
  return record;
}

/**
 * Run a paginated Prisma query, returning items + total count.
 * Usage:
 *   return paginatedQuery(page, pageSize,
 *     (skip, take) => this.prisma.foo.findMany({ where, orderBy, skip, take }),
 *     () => this.prisma.foo.count({ where }))
 */
export async function paginatedQuery<T>(
  page: number,
  pageSize: number,
  findMany: (skip: number, take: number) => Promise<T[]>,
  count: () => Promise<number>,
): Promise<{ items: T[]; total: number; page: number; pageSize: number }> {
  const skip = (page - 1) * pageSize;
  const [items, total] = await Promise.all([findMany(skip, pageSize), count()]);
  return { items, total, page, pageSize };
}
