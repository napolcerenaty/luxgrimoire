import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { generateSlug } from '../../common/utils/slug.util';
import { parsePagination, buildPageMeta } from '../../common/pagination';
import { BookSeriesQueryDto, CreateBookSeriesDto, UpdateBookSeriesDto } from './book-series.dto';
import { EditionsService } from '../editions/editions.service';

/** Postgres compares Float[] columns element-by-element (lexicographic); Prisma can't
 * express `orderBy` on a scalar list field, so the same comparison is replicated here
 * for in-memory sorting. Series are small enough that this is cheap. */
function compareVolumeNumbers(a: number[], b: number[]): number {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const av = a[i];
    const bv = b[i];
    if (av === undefined) return -1;
    if (bv === undefined) return 1;
    if (av !== bv) return av - bv;
  }
  return 0;
}

/** Normalizes a series name for duplicate-detection only (never stored/displayed) — collapses
 * the various apostrophe/quote/dash glyphs different data sources use for the same character
 * (e.g. straight ' vs curly ’, hyphen - vs en dash – vs em dash —) plus repeated whitespace, so
 * two names differing only by that are recognised as the same series instead of silently
 * creating a duplicate. A real instance of this (apostrophes) split one series' books across
 * two rows — see migration 20260721100000_merge_duplicate_dragons_gift_trilogy_series. */
function normalizeSeriesName(name: string): string {
  return name
    .normalize('NFKC')
    .replace(/[‘’‛ʼ`´]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐‑‒–—―−]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

@Injectable()
export class BookSeriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly editionsService: EditionsService,
  ) {}

  async findAll(query: BookSeriesQueryDto) {
    const { skip, take: pageSize, page } = parsePagination(query);

    const where = query.search
      ? { name: { contains: query.search, mode: 'insensitive' as const } }
      : {};

    const [data, total] = await Promise.all([
      this.prisma.bookSeries.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { name: 'asc' },
        select: {
          id: true,
          slug: true,
          name: true,
          // `books` (the old single-series relation) counts only where this is the PRIMARY
          // series; `entries` (book_series_entries) counts every book attached at all, primary
          // or secondary — the list's "Books" column and the delete guard both need the total,
          // not just primary, or a series that's still a secondary entry looks deletable.
          _count: { select: { books: true, entries: true } },
          // Sourced from `entries`, not `books` — after a switch-primary, a book stays attached
          // here as a secondary entry even though it's no longer in the primary-only `books`
          // relation, which used to leave a series with a nonzero bookCount but no authors shown.
          entries: {
            take: 5,
            select: {
              book: {
                select: {
                  authors: { select: { author: { select: { name: true } } } },
                },
              },
            },
          },
        },
      }),
      this.prisma.bookSeries.count({ where }),
    ]);

    return {
      data: data.map(s => {
        const authorNames = Array.from(
          new Set(s.entries.flatMap(e => e.book.authors.map(a => a.author.name)))
        );
        return { id: s.id, slug: s.slug, name: s.name, bookCount: s._count.entries, primaryBookCount: s._count.books, authors: authorNames };
      }),
      ...buildPageMeta(total, page, pageSize),
    };
  }

  /** A book can belong to many series; this lists every book with an entry in this
   * series (primary or not) — not just the ones where it's currently the primary.
   *
   * Split into `volumes` (single volumeNumber) and `omnibuses` (spans more than one) rather
   * than one flat sorted list: an omnibus's volumeNumbers (e.g. [1,2,3]) sorts lexicographically
   * right after its first single volume and before the rest ([1] < [1,2,3] < [2]), which reads
   * as "Vol 1, Omnibus 1-3, Vol 2, Vol 3" — there's no flat numeric position that represents a
   * multi-volume span without that kind of surprise. Keeping the two lists separate sidesteps it
   * entirely instead of picking a different (still arbitrary) tiebreak. */
  async findBySlug(slug: string) {
    const series = await this.prisma.bookSeries.findUnique({
      where: { slug },
      select: { id: true, slug: true, name: true },
    });
    if (!series) throw new NotFoundException(`Series '${slug}' not found`);

    const entries = await this.prisma.bookSeriesEntry.findMany({
      where: { seriesId: series.id, book: { status: 'approved' } },
      select: {
        volumeNumbers: true,
        isPrimary: true,
        book: {
          select: {
            id: true,
            slug: true,
            title: true,
            authors: {
              select: {
                author: { select: { id: true, name: true, slug: true } },
              },
            },
            editions: {
              select: {
                id: true,
                slug: true,
                additionalImages: true,
                verifiedAt: true,
                generalSaleDate: true,
                variantLabel: true,
                bookBoxCompany: { select: { name: true, slug: true, brandColors: true } },
                communityImages: {
                  where: { status: 'APPROVED' },
                  orderBy: { sortOrder: 'asc' as const },
                  take: 1,
                  select: { url: true },
                },
              },
              where: { verifiedAt: { not: null } },
              orderBy: { createdAt: 'asc' },
            },
          },
        },
      },
    });

    const allEditionIds = entries.flatMap((entry) => entry.book.editions.map((e) => e.id));
    const resolvedDates = await this.editionsService.resolveEditionSaleDates(allEditionIds);

    const mapped = entries
      .map(({ book, volumeNumbers, isPrimary }) => ({
        ...book,
        volumeNumbers,
        isPrimarySeries: isPrimary,
        editions: (book.editions as Array<{ id: string; slug: string; additionalImages: string[]; verifiedAt: Date | null; generalSaleDate: string | null; variantLabel: string | null; bookBoxCompany: { name: string; slug: string; brandColors?: string[] | null } | null; communityImages?: Array<{ url: string }> }>).map((e) => {
          const { communityImages, ...rest } = e;
          const resolved = resolvedDates.get(e.id) ?? null;
          return {
            ...rest,
            communityPhotoCover: e.additionalImages.length === 0
              ? (communityImages?.[0]?.url ?? null)
              : null,
            resolvedSaleDate: resolved ? { label: resolved.label, date: resolved.date } : null,
          };
        }),
      }));

    const byVolumeThenTitle = (a: typeof mapped[number], b: typeof mapped[number]) =>
      compareVolumeNumbers(a.volumeNumbers, b.volumeNumbers) || a.title.localeCompare(b.title);

    const volumes = mapped.filter((b) => b.volumeNumbers.length <= 1).sort(byVolumeThenTitle);
    const omnibuses = mapped.filter((b) => b.volumeNumbers.length > 1).sort(byVolumeThenTitle);

    return { id: series.id, slug: series.slug, name: series.name, volumes, omnibuses };
  }

  /** The books a switch-primary from `fromSlug` would move — i.e. everything whose primary
   * series is currently `fromSlug` — along with each book's current volume numbers there and
   * (if `toSlug` is given) any volume numbers it already has on a non-primary entry in the
   * target series. Powers the admin "switch primary" modal's per-book volume-number step, so
   * numbers can be set at switch time instead of needing a manual per-book fix afterward. */
  async getPrimaryBooksForSwitch(fromSlug: string, toSlug?: string) {
    const fromSeries = await this.prisma.bookSeries.findUnique({ where: { slug: fromSlug }, select: { id: true } });
    if (!fromSeries) throw new NotFoundException(`Series '${fromSlug}' not found`);

    const toSeries = toSlug
      ? await this.prisma.bookSeries.findUnique({ where: { slug: toSlug }, select: { id: true } })
      : null;

    const entries = await this.prisma.bookSeriesEntry.findMany({
      where: { seriesId: fromSeries.id, isPrimary: true },
      select: {
        volumeNumbers: true,
        book: { select: { id: true, slug: true, title: true } },
      },
      orderBy: { book: { title: 'asc' } },
    });

    const targetEntries = toSeries
      ? await this.prisma.bookSeriesEntry.findMany({
          where: { seriesId: toSeries.id, bookId: { in: entries.map((e) => e.book.id) } },
          select: { bookId: true, volumeNumbers: true },
        })
      : [];
    const targetVolumeNumbers = new Map(targetEntries.map((e) => [e.bookId, e.volumeNumbers]));

    return entries.map((e) => ({
      bookId: e.book.id,
      slug: e.book.slug,
      title: e.book.title,
      currentVolumeNumbers: e.volumeNumbers,
      targetVolumeNumbers: targetVolumeNumbers.get(e.book.id) ?? [],
    }));
  }

  /** Bulk-reassign the primary series for every book whose primary series is
   * currently `fromSeriesSlug`, switching it to `toSeriesSlug`. The old series stays
   * attached to each affected book as a non-primary entry — nothing is removed.
   *
   * `volumeNumbersByBookId`, when given, sets each book's volume numbers in the target
   * series as part of the switch (from the admin modal's per-book step) — otherwise a
   * book with no prior entry in the target series ends up with empty volume numbers,
   * needing a manual fix afterward. */
  async switchPrimarySeries(
    fromSeriesSlug: string,
    toSeriesSlug: string,
    volumeNumbersByBookId?: Record<string, number[]>,
  ): Promise<{ switchedCount: number }> {
    const [fromSeries, toSeries] = await Promise.all([
      this.prisma.bookSeries.findUnique({ where: { slug: fromSeriesSlug }, select: { id: true } }),
      this.prisma.bookSeries.findUnique({ where: { slug: toSeriesSlug }, select: { id: true, name: true } }),
    ]);
    if (!fromSeries) throw new NotFoundException(`Series '${fromSeriesSlug}' not found`);
    if (!toSeries) throw new NotFoundException(`Series '${toSeriesSlug}' not found`);
    if (fromSeries.id === toSeries.id) throw new BadRequestException('Source and target series must differ');

    return this.prisma.$transaction(async (tx) => {
      const affected = await tx.bookSeriesEntry.findMany({
        where: { seriesId: fromSeries.id, isPrimary: true },
        select: { bookId: true },
      });
      if (affected.length === 0) return { switchedCount: 0 };
      const bookIds = affected.map((a) => a.bookId);

      await tx.bookSeriesEntry.updateMany({
        where: { seriesId: fromSeries.id, bookId: { in: bookIds } },
        data: { isPrimary: false },
      });

      for (const bookId of bookIds) {
        const numbers = volumeNumbersByBookId?.[bookId];
        await tx.bookSeriesEntry.upsert({
          where: { bookId_seriesId: { bookId, seriesId: toSeries.id } },
          create: { bookId, seriesId: toSeries.id, isPrimary: true, volumeNumbers: numbers ?? [] },
          update: numbers !== undefined ? { isPrimary: true, volumeNumbers: numbers } : { isPrimary: true },
        });
      }

      const toEntries = await tx.bookSeriesEntry.findMany({
        where: { bookId: { in: bookIds }, seriesId: toSeries.id },
        select: { bookId: true, volumeNumbers: true },
      });
      for (const entry of toEntries) {
        await tx.book.update({
          where: { id: entry.bookId },
          data: { seriesId: toSeries.id, seriesName: toSeries.name, volumeNumbers: entry.volumeNumbers },
        });
      }

      return { switchedCount: bookIds.length };
    });
  }

  /** Finds a series whose name is the same as `name` once typographic differences (curly vs
   * straight apostrophes, etc.) are ignored — catches near-duplicates that an exact
   * case-insensitive match would miss. `excludeSlug` skips a row when renaming that same row. */
  private async findByNormalizedName(name: string, excludeSlug?: string): Promise<{ id: string; slug: string; name: string } | null> {
    const target = normalizeSeriesName(name);
    const candidates = await this.prisma.bookSeries.findMany({
      where: excludeSlug ? { slug: { not: excludeSlug } } : undefined,
      select: { id: true, slug: true, name: true },
    });
    return candidates.find((s) => normalizeSeriesName(s.name) === target) ?? null;
  }

  /** Find or create a series by name. Used by BooksService when creating/updating books. */
  async findOrCreate(name: string): Promise<{ id: string; slug: string; name: string }> {
    const existing = await this.prisma.bookSeries.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
      select: { id: true, slug: true, name: true },
    });
    if (existing) return existing;

    // Exact match failed — check for a typographic near-duplicate before creating a new row
    // (this is exactly how "The Dragon's Gift Trilogy" ended up split across two series rows).
    const nearMatch = await this.findByNormalizedName(name);
    if (nearMatch) return nearMatch;

    const baseSlug = generateSlug(name);
    const slug = await this.ensureUniqueSlug(baseSlug);
    return this.prisma.bookSeries.create({
      data: { slug, name },
      select: { id: true, slug: true, name: true },
    });
  }

  async create(dto: CreateBookSeriesDto) {
    const nearMatch = await this.findByNormalizedName(dto.name);
    if (nearMatch) {
      throw new ConflictException(`A series named "${nearMatch.name}" already exists (possibly with different punctuation) — use that one instead of creating a duplicate.`);
    }

    const baseSlug = generateSlug(dto.name);
    const slug = await this.ensureUniqueSlug(baseSlug);
    try {
      return await this.prisma.bookSeries.create({
        data: { slug, name: dto.name },
        select: { id: true, slug: true, name: true },
      });
    } catch {
      throw new ConflictException(`Series '${dto.name}' already exists`);
    }
  }

  async update(slug: string, dto: UpdateBookSeriesDto) {
    const series = await this.prisma.bookSeries.findUnique({ where: { slug } });
    if (!series) throw new NotFoundException(`Series '${slug}' not found`);

    const data: { name?: string; slug?: string } = {};
    if (dto.name) {
      const nearMatch = await this.findByNormalizedName(dto.name, slug);
      if (nearMatch) {
        throw new ConflictException(`A series named "${nearMatch.name}" already exists (possibly with different punctuation) — use that one instead of renaming into a duplicate.`);
      }

      data.name = dto.name;
      const newSlug = generateSlug(dto.name);
      if (newSlug !== slug) {
        data.slug = await this.ensureUniqueSlug(newSlug, slug);
      }
    }

    return this.prisma.bookSeries.update({
      where: { slug },
      data,
      select: { id: true, slug: true, name: true },
    });
  }

  async delete(slug: string) {
    const series = await this.prisma.bookSeries.findUnique({
      where: { slug },
      // `entries`, not `books` — a series that's only a secondary entry for some book(s) has
      // to block deletion too, since deleting it cascades and silently drops those entries.
      include: { _count: { select: { entries: true } } },
    });
    if (!series) throw new NotFoundException(`Series '${slug}' not found`);
    if (series._count.entries > 0)
      throw new BadRequestException(`Cannot delete series '${slug}' — it still has ${series._count.entries} book(s).`);
    return this.prisma.bookSeries.delete({ where: { slug } });
  }

  private async ensureUniqueSlug(base: string, excludeSlug?: string): Promise<string> {
    let candidate = base;
    let n = 1;
    while (true) {
      const existing = await this.prisma.bookSeries.findUnique({ where: { slug: candidate } });
      if (!existing || existing.slug === excludeSlug) return candidate;
      candidate = `${base}-${n++}`;
    }
  }
}
