import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Resolves which of a month's SubscriptionMonthBook rows a specific subscription entry
 * should actually receive, applying any choice-group selection on top of the raw list.
 *
 * Books outside a choice group (choiceGroupId === null) always pass through — this is the
 * overwhelming majority of months and is byte-for-byte identical to pre-choice-feature
 * behavior. For a choice group: an explicit UserSubscriptionMonthChoice selection wins;
 * if the user hasn't chosen yet, the default is to include every option in the group
 * ("both") — see the book-choice design notes: there is deliberately no automatic
 * pricing/default-option logic here, the user self-corrects afterward via the existing
 * collection trash (remove one) or purchase-group cost editor (adjust price) if needed.
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

  const choices = await prisma.userSubscriptionMonthChoice.findMany({
    where: { subscriptionEntryId, choiceGroupId: { in: groupIds } },
    select: { choiceGroupId: true, selections: { select: { monthBookId: true } } },
  });
  const selectedIdsByGroup = new Map<string, Set<string>>();
  for (const choice of choices) {
    selectedIdsByGroup.set(choice.choiceGroupId, new Set(choice.selections.map((s) => s.monthBookId)));
  }

  return monthBooks.filter((mb) => {
    if (!mb.choiceGroupId) return true;
    const selected = selectedIdsByGroup.get(mb.choiceGroupId);
    if (!selected) return true; // no explicit choice yet -> default: include every option
    return selected.has(mb.id);
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
