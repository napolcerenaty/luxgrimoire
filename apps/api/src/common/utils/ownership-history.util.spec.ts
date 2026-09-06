import { recordOwnershipHistory, recordOwnershipHistoryAsync } from './ownership-history.util';

function makePrisma() {
  return {
    ownershipStatusHistory: {
      createMany: jest.fn().mockResolvedValue({ count: 2 }),
      create: jest.fn().mockResolvedValue({ id: 'h1' }),
    },
  };
}

describe('recordOwnershipHistory', () => {
  it('creates one row per entry with the shared status, omitting changedAt when not given', async () => {
    const prisma = makePrisma();

    await recordOwnershipHistory(prisma as any, [{ id: 'a' }, { id: 'b' }], 'SOLD');

    expect(prisma.ownershipStatusHistory.createMany).toHaveBeenCalledWith({
      data: [
        { userBookEntryId: 'a', status: 'SOLD' },
        { userBookEntryId: 'b', status: 'SOLD' },
      ],
    });
  });

  it('stamps changedAt on every row when a date is provided', async () => {
    const prisma = makePrisma();
    const when = new Date('2026-03-01T00:00:00.000Z');

    await recordOwnershipHistory(prisma as any, [{ id: 'a' }], 'GIFTED_AWAY', when);

    expect(prisma.ownershipStatusHistory.createMany).toHaveBeenCalledWith({
      data: [{ userBookEntryId: 'a', status: 'GIFTED_AWAY', changedAt: when }],
    });
  });
});

describe('recordOwnershipHistoryAsync', () => {
  it('fires a single create and returns synchronously (void)', () => {
    const prisma = makePrisma();

    const ret = recordOwnershipHistoryAsync(prisma as any, 'a', 'OWNED');

    expect(ret).toBeUndefined();
    expect(prisma.ownershipStatusHistory.create).toHaveBeenCalledWith({
      data: { userBookEntryId: 'a', status: 'OWNED' },
    });
  });

  it('swallows a rejected create — never surfaces an unhandled rejection', async () => {
    const prisma = makePrisma();
    prisma.ownershipStatusHistory.create.mockRejectedValue(new Error('db down'));

    expect(() => recordOwnershipHistoryAsync(prisma as any, 'a', 'OWNED', new Date(0))).not.toThrow();
    await new Promise((r) => setImmediate(r)); // let the swallowed promise settle
  });
});
