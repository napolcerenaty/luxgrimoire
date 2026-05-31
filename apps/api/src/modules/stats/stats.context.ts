import type { Prisma, PrismaClient } from '@prisma/client';

export const statsEntryInclude = {
  purchaseGroup: {
    include: {
      fees: { select: { amount: true, currency: true, date: true, category: true } },
      discounts: { select: { amount: true, currency: true, date: true } },
      refunds: { select: { amount: true, currency: true, date: true } },
      bookEntries: { select: { id: true } },
    },
  },
  subscriptionEntry: {
    include: {
      subscription: {
        select: {
          name: true,
          slug: true,
          company: { select: { id: true, name: true, slug: true, brandColors: true } },
        },
      },
    },
  },
  edition: {
    include: {
      book: {
        select: {
          title: true,
          slug: true,
          authors: { include: { author: { select: { name: true } } } },
        },
      },
      bookBoxCompany: { select: { id: true, name: true, slug: true, brandColors: true } },
      featureTags: {
        select: { rawValue: true, categories: true, isManual: true },
      },
    },
  },
} satisfies Prisma.UserBookEntryInclude;

export const statsSaleGroupInclude = {
  entries: {
    include: {
      userBookEntry: {
        include: {
          edition: {
            include: {
              bookBoxCompany: { select: { id: true, name: true, slug: true, brandColors: true } },
            },
          },
          subscriptionEntry: {
            include: {
              subscription: {
                select: {
                  company: { select: { id: true, name: true, slug: true, brandColors: true } },
                },
              },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.UserSaleGroupInclude;

export type StatsEntryData = Prisma.UserBookEntryGetPayload<{ include: typeof statsEntryInclude }>;
export type StatsSaleGroupData = Prisma.UserSaleGroupGetPayload<{ include: typeof statsSaleGroupInclude }>;

export interface StatsContext {
  userId: string;
  currency: string;
  year: number | null;
  now: Date;
  entries: StatsEntryData[];
  saleGroups: StatsSaleGroupData[];
  convert: (amount: number, fromCurrency: string, date: Date) => Promise<number>;
}

export async function loadStatsContext(
  prisma: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>,
): Promise<{
  entries: StatsEntryData[];
  saleGroups: StatsSaleGroupData[];
}> {
  void prisma;
  throw new Error('Use StatsService.buildContext instead');
}
