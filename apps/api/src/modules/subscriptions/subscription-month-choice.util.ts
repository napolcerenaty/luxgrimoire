import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Resolves which of a month's SubscriptionMonthBook rows a specific subscription entry
 * should actually receive, applying any choice-group selection on top of the raw list.
 *
 * Books outside a choice group (choiceGroupId === null) always pass through — this is the
 * overwhelming majority of months and is byte-for-byte identical to pre-choice-feature
 * behavior. For a choice group: an explicit UserSubscriptionMonthChoice selection wins.
 * If there's no choice yet, this is deadline-aware, not a blanket default:
 *  - deadline not yet passed -> exclude the book entirely for now (the user still has time
 *    to choose; creating it now would silently pre-empt that choice — this was the actual
 *    bug behind "my choice isn't respected, both got added immediately at signup").
 *  - deadline passed -> fall back to including every option ("both"), matching what the
 *    deadline-resolution cron would persist as the 'default' choice anyway.
 *
 * A standalone function (not a service method) so it can be shared between
 * SubscriptionsService (signup/backfill) and RenewalCronService (live renewal) without
 * introducing a circular DI dependency between the two.
 */
export async function resolveMonthBooksForEntry<T extends { id: string; choiceGroupId: string | null }>(
  prisma: PrismaService,
  subscriptionEntryId: string,
  monthBooks: T[],
): Promise<T[]> {
  const groupIds = [...new Set(monthBooks.map((mb) => mb.choiceGroupId).filter((id): id is string => id != null))];
  if (groupIds.length === 0) return monthBooks;

  const [choices, groups] = await Promise.all([
    prisma.userSubscriptionMonthChoice.findMany({
      where: { subscriptionEntryId, choiceGroupId: { in: groupIds } },
      select: { choiceGroupId: true, selections: { select: { monthBookId: true } } },
    }),
    prisma.subscriptionMonthChoiceGroup.findMany({
      where: { id: { in: groupIds } },
      select: {
        id: true,
        choiceDeadlineType: true,
        choiceDeadlineDaysBefore: true,
        choiceDeadlineDayOfMonth: true,
        month: { select: { year: true, month: true, subscription: { select: { renewalDay: true } } } },
      },
    }),
  ]);

  const selectedIdsByGroup = new Map<string, Set<string>>();
  for (const choice of choices) {
    selectedIdsByGroup.set(choice.choiceGroupId, new Set(choice.selections.map((s) => s.monthBookId)));
  }
  const now = new Date();
  const deadlinePassedByGroup = new Map<string, boolean>();
  for (const g of groups) {
    const deadline = computeChoiceDeadline(g.month.year, g.month.month, g.month.subscription.renewalDay ?? 1, g);
    deadlinePassedByGroup.set(g.id, deadline <= now);
  }

  return monthBooks.filter((mb) => {
    if (!mb.choiceGroupId) return true;
    const selected = selectedIdsByGroup.get(mb.choiceGroupId);
    if (selected) return selected.has(mb.id);
    return deadlinePassedByGroup.get(mb.choiceGroupId) ?? true;
  });
}

/**
 * Deadline for a choice group: the box's renewal day minus N days (default 1), or a fixed
 * day of the previous month when explicitly overridden.
 *
 * Anchored to the subscription's renewalDay rather than the 1st of the calendar month —
 * renewal (and the book-choice resolver) fires on that day, not the 1st, so anchoring to
 * the 1st could put the deadline well before or (worse) after renewal actually runs. This
 * uses the subscription's nominal renewalDay as a reasonable approximation rather than the
 * full settings-history-resolved renewal date used for billing — good enough for a reminder,
 * not precise enough to be relied on for anything money-related.
 */
export function computeChoiceDeadline(
  year: number,
  month: number,
  renewalDay: number,
  group: { choiceDeadlineType: string; choiceDeadlineDaysBefore: number; choiceDeadlineDayOfMonth: number | null },
): Date {
  if (group.choiceDeadlineType === 'DAY_OF_MONTH' && group.choiceDeadlineDayOfMonth) {
    return new Date(Date.UTC(year, month - 2, group.choiceDeadlineDayOfMonth));
  }
  const deadline = new Date(Date.UTC(year, month - 1, renewalDay));
  deadline.setUTCDate(deadline.getUTCDate() - group.choiceDeadlineDaysBefore);
  return deadline;
}

/**
 * Persists a resolved choice (1 or more selected options) for one subscription entry +
 * choice group, replacing any prior selection. Shared between SubscriptionsService (user
 * self-service pick — including a joining user declaring what they received for a past
 * month during join/backfill) and the deadline-resolution cron (applying the 'default' —
 * both options — when a group's deadline passes with no explicit pick).
 */
export async function persistMonthChoice(
  prisma: PrismaService,
  group: { id: string; allowMultiple: boolean; options: { id: string }[] },
  subscriptionEntryId: string,
  monthBookIds: string[],
  source: 'user' | 'default',
) {
  const uniqueIds = [...new Set(monthBookIds)];
  if (uniqueIds.length === 0) {
    throw new BadRequestException('Select at least one option');
  }
  // The 'default' fallback (deadline passed, nobody chose) always resolves to every
  // option — same as resolveMonthBooksForEntry's own no-choice-found behavior — even for
  // an allowMultiple:false group, so the two stay consistent with each other.
  if (source !== 'default' && !group.allowMultiple && uniqueIds.length > 1) {
    throw new BadRequestException('This choice only allows selecting one option');
  }
  const validIds = new Set(group.options.map((o) => o.id));
  if (uniqueIds.some((id) => !validIds.has(id))) {
    throw new BadRequestException('Selection includes an option that is not part of this choice group');
  }

  return prisma.$transaction(async (tx) => {
    const choice = await tx.userSubscriptionMonthChoice.upsert({
      where: { choiceGroupId_subscriptionEntryId: { choiceGroupId: group.id, subscriptionEntryId } },
      create: { choiceGroupId: group.id, subscriptionEntryId, source },
      update: { source, selectedAt: new Date() },
    });
    await tx.userMonthBookChoiceSelection.deleteMany({ where: { userChoiceId: choice.id } });
    await tx.userMonthBookChoiceSelection.createMany({
      data: uniqueIds.map((monthBookId) => ({ userChoiceId: choice.id, monthBookId })),
    });
    return choice;
  });
}

/**
 * Actually creates the UserBookEntry row(s) for a resolved choice, immediately. Needed
 * because nothing else is guaranteed to revisit this exact month later: renewal only ever
 * processes months going forward, backfill only runs once per admin/user action, and the
 * signup-time "first month as preorder" path (paymentOnStartup subscriptions) runs exactly
 * once, synchronously, before any choice can even be submitted. Without this, a choice
 * resolved outside those specific moments (a user picking early, or the deadline-cron
 * applying the default) would be recorded but never actually turn into a book — the
 * resolver alone only filters lists that are *about to be created*, it doesn't create
 * anything on its own.
 *
 * Reuses the existing purchase group for this entry+month if one already exists (e.g.
 * created for that month's non-choice books), otherwise creates a minimal one from the
 * entry's own base cost — same convention used elsewhere (`Subscription – YYYY/MM` title).
 * Idempotent: skips any edition the user already has an entry for.
 */
export async function materializeChoiceGroupBooks(
  prisma: PrismaService,
  userId: string,
  subscriptionEntryId: string,
  chosenMonthBookIds: string[],
  changedAt: Date,
  ownershipStatus: 'OWNED' | 'PREORDER',
): Promise<void> {
  if (chosenMonthBookIds.length === 0) return;
  const books = await prisma.subscriptionMonthBook.findMany({
    where: { id: { in: chosenMonthBookIds } },
    select: {
      bookId: true,
      editionId: true,
      signatureType: true,
      month: { select: { year: true, month: true, signatureType: true } },
    },
  });
  if (books.length === 0) return;

  const { year, month } = books[0].month;
  const groupTitle = `Subscription – ${year}/${String(month).padStart(2, '0')}`;
  let group = await prisma.userPurchaseGroup.findFirst({
    where: { userId, subscriptionEntryId, title: groupTitle },
    select: { id: true },
  });
  if (!group) {
    const entry = await prisma.userSubscriptionEntry.findUnique({
      where: { id: subscriptionEntryId },
      select: { basePrice: true, shippingCost: true, costCurrency: true },
    });
    group = await prisma.userPurchaseGroup.create({
      data: {
        userId,
        fromSubscription: true,
        subscriptionEntryId,
        totalAmount: entry?.basePrice ? parseFloat(entry.basePrice.toString()) : 0,
        shippingAmount: entry?.shippingCost ? parseFloat(entry.shippingCost.toString()) : null,
        currency: entry?.costCurrency ?? 'USD',
        purchasedAt: changedAt,
        title: groupTitle,
      },
      select: { id: true },
    });
  }

  for (const b of books) {
    if (!b.editionId) continue;
    const existing = await prisma.userBookEntry.findFirst({
      where: { userId, editionId: b.editionId, subscriptionEntryId },
      select: { id: true },
    });
    if (existing) continue;
    await prisma.userBookEntry.create({
      data: {
        userId,
        bookId: b.bookId,
        editionId: b.editionId,
        ownershipStatus,
        readingStatus: 'UNREAD',
        subscriptionEntryId,
        purchaseGroupId: group.id,
        signatureType: b.signatureType ?? b.month.signatureType ?? null,
      },
    }).catch(() => null);
  }
}
