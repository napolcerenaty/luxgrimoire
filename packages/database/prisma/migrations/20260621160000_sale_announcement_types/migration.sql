-- CreateEnum
CREATE TYPE "SaleType" AS ENUM ('LIMITED_PREORDER', 'OPEN_PREORDER', 'OVERSTOCK');

-- AlterTable: SaleAnnouncement
ALTER TABLE "sale_announcements"
  ADD COLUMN "saleType" "SaleType" NOT NULL DEFAULT 'LIMITED_PREORDER',
  ADD COLUMN "endsAt" TIMESTAMP(3),
  ADD COLUMN "isSoldOut" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "notes" TEXT;

-- CreateIndex
CREATE INDEX "sale_announcements_saleType_idx" ON "sale_announcements"("saleType");

-- AlterTable: SaleAnnouncementRegion
ALTER TABLE "sale_announcement_regions"
  ADD COLUMN "isSoldOut" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable: SaleAnnouncementItem
CREATE TABLE "sale_announcement_items" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "name" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "sale_announcement_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sale_announcement_items_saleId_idx" ON "sale_announcement_items"("saleId");

-- AddForeignKey
ALTER TABLE "sale_announcement_items" ADD CONSTRAINT "sale_announcement_items_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sale_announcements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: SaleAnnouncementEdition add itemId
ALTER TABLE "sale_announcement_editions"
  ADD COLUMN "itemId" TEXT;

-- CreateIndex
CREATE INDEX "sale_announcement_editions_itemId_idx" ON "sale_announcement_editions"("itemId");

-- AddForeignKey
ALTER TABLE "sale_announcement_editions" ADD CONSTRAINT "sale_announcement_editions_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "sale_announcement_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
