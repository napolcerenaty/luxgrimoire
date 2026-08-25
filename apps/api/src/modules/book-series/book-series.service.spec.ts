import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BookSeriesService } from './book-series.service';
import { EditionsService } from '../editions/editions.service';
import type { CreateBookSeriesDto } from './book-series.dto';

describe('BookSeriesService', () => {
  let service: BookSeriesService;
  let prisma: DeepMockProxy<PrismaService>;

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    service = new BookSeriesService(prisma, {} as unknown as EditionsService);
  });

  describe('create — near-duplicate detection', () => {
    it('rejects a name differing from an existing series only by punctuation', async () => {
      (prisma.bookSeries.findMany as jest.Mock).mockResolvedValue([
        { id: 's1', slug: 'dragons-gift-trilogy', name: "The Dragon’s Gift Trilogy" },
      ]);

      await expect(
        service.create({ name: "The Dragon's Gift Trilogy" } as CreateBookSeriesDto),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects a name differing from an existing series only by a leading "The"', async () => {
      (prisma.bookSeries.findMany as jest.Mock).mockResolvedValue([
        { id: 's1', slug: 'ashes-of-thezmarr', name: 'The Ashes of Thezmarr' },
      ]);

      await expect(
        service.create({ name: 'Ashes of Thezmarr' } as CreateBookSeriesDto),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects a name differing from an existing series only by a leading "A"/"An"', async () => {
      (prisma.bookSeries.findMany as jest.Mock).mockResolvedValue([
        { id: 's1', slug: 'court-of-thorns', name: 'Court of Thorns' },
      ]);

      await expect(
        service.create({ name: 'A Court of Thorns' } as CreateBookSeriesDto),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects a name differing from an existing series only by a mid-name article ("Arc of A Scythe" vs "Arc of The Scythe")', async () => {
      (prisma.bookSeries.findMany as jest.Mock).mockResolvedValue([
        { id: 's1', slug: 'arc-of-a-scythe', name: 'Arc of a Scythe' },
      ]);

      // Regression test for a real bug: these ended up as two separate series rows, splitting
      // "Thunderhead" (attached to "Arc of a Scythe") from "Gleanings" (attached to "Arc of the
      // Scythe"), and series-discovery kept resuggesting books the catalogue already had because
      // it was checking the wrong row.
      await expect(
        service.create({ name: 'Arc of the Scythe' } as CreateBookSeriesDto),
      ).rejects.toThrow(ConflictException);
    });

    it('allows a genuinely different name', async () => {
      (prisma.bookSeries.findMany as jest.Mock).mockResolvedValue([
        { id: 's1', slug: 'ashes-of-thezmarr', name: 'The Ashes of Thezmarr' },
      ]);
      (prisma.bookSeries.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.bookSeries.create as jest.Mock).mockResolvedValue({ id: 's2', slug: 'embers-of-thezmarr', name: 'Embers of Thezmarr' });

      await expect(
        service.create({ name: 'Embers of Thezmarr' } as CreateBookSeriesDto),
      ).resolves.toBeDefined();
    });
  });

  describe('update — near-duplicate detection on rename', () => {
    it('rejects renaming into a name that only differs from another series by a leading article', async () => {
      (prisma.bookSeries.findUnique as jest.Mock).mockResolvedValue({ id: 's2', slug: 'ashes-of-thezmarr-2', name: 'Ashes of Thezmarr (duplicate)' });
      (prisma.bookSeries.findMany as jest.Mock).mockResolvedValue([
        { id: 's1', slug: 'ashes-of-thezmarr', name: 'The Ashes of Thezmarr' },
      ]);

      await expect(
        service.update('ashes-of-thezmarr-2', { name: 'Ashes of Thezmarr' }),
      ).rejects.toThrow(ConflictException);
    });
  });
});
