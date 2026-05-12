-- AddEditionHistoryRelation
ALTER TABLE "book_editions" ADD COLUMN "previousEditionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "book_editions_previousEditionId_key" ON "book_editions"("previousEditionId");

-- AddForeignKey
ALTER TABLE "book_editions" ADD CONSTRAINT "book_editions_previousEditionId_fkey" FOREIGN KEY ("previousEditionId") REFERENCES "book_editions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
