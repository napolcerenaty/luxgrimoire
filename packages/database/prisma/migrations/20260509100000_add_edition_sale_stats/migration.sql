-- CreateTable
CREATE TABLE "edition_sale_stats" (
    "id" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "valueEur" DOUBLE PRECISION NOT NULL,
    "soldAt" TIMESTAMP(3) NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "edition_sale_stats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "edition_sale_stats_editionId_idx" ON "edition_sale_stats"("editionId");

-- CreateIndex
CREATE INDEX "edition_sale_stats_editionId_valueEur_soldAt_idx" ON "edition_sale_stats"("editionId", "valueEur", "soldAt");

-- AddForeignKey
ALTER TABLE "edition_sale_stats" ADD CONSTRAINT "edition_sale_stats_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "book_editions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
