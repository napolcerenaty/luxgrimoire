-- CreateEnum
CREATE TYPE "UserImageStatus" AS ENUM ('PENDING', 'APPROVED', 'REMOVED');

-- CreateTable
CREATE TABLE "user_edition_images" (
    "id" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cloudinaryId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "instagramHandle" TEXT,
    "consentGiven" BOOLEAN NOT NULL,
    "consentedAt" TIMESTAMP(3) NOT NULL,
    "status" "UserImageStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_edition_images_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_edition_images_editionId_status_idx" ON "user_edition_images"("editionId", "status");

-- CreateIndex
CREATE INDEX "user_edition_images_userId_idx" ON "user_edition_images"("userId");

-- CreateIndex
CREATE INDEX "user_edition_images_status_idx" ON "user_edition_images"("status");

-- AddForeignKey
ALTER TABLE "user_edition_images" ADD CONSTRAINT "user_edition_images_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "book_editions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_edition_images" ADD CONSTRAINT "user_edition_images_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
