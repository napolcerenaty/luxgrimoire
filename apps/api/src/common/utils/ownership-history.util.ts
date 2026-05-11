import type { PrismaClient } from '@prisma/client';

type TxClient = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

/**
 * Records ownership status history for one or more book entries.
 * Pass a Prisma transaction client (tx) when inside a $transaction block.
 */
export async function recordOwnershipHistory(
  prisma: TxClient,
  entries: Array<{ id: string }>,
  status: string,
  changedAt?: Date,
): Promise<void> {
  await prisma.ownershipStatusHistory.createMany({
    data: entries.map((e) => ({
      userBookEntryId: e.id,
      status,
      ...(changedAt && { changedAt }),
    })),
  });
}

/**
 * Fire-and-forget version for single entries outside of a transaction.
 */
export function recordOwnershipHistoryAsync(
  prisma: PrismaClient,
  userBookEntryId: string,
  status: string,
  changedAt?: Date,
): void {
  prisma.ownershipStatusHistory
    .create({ data: { userBookEntryId, status, ...(changedAt && { changedAt }) } })
    .catch(() => {});
}
