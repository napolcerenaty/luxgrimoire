-- Admin-managed workflow for tracking official brand/publisher image permission grants,
-- separate from the "latest state" cache kept on book_box_companies.hasOfficialImagePermission
-- (that column is left untouched — the cache is now derived from this table's status instead
-- of being set directly from the company create/edit form).
DO $$ BEGIN
    CREATE TYPE "ImagePermissionStatus" AS ENUM ('PENDING', 'GRANTED', 'REVOKED', 'DENIED');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE "ContactChannel" AS ENUM ('EMAIL', 'CONTACT_FORM', 'OTHER');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "company_image_permissions" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "status" "ImagePermissionStatus" NOT NULL DEFAULT 'PENDING',
    "grantedByName" TEXT,
    "grantedAt" TIMESTAMP(3),
    "conditions" TEXT[],
    "emailContent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_image_permissions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "company_image_permissions_companyId_key" ON "company_image_permissions"("companyId");
CREATE INDEX IF NOT EXISTS "company_image_permissions_status_idx" ON "company_image_permissions"("status");

DO $$ BEGIN
    ALTER TABLE "company_image_permissions" ADD CONSTRAINT "company_image_permissions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "book_box_companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "company_permission_communications" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "channel" "ContactChannel" NOT NULL,
    "subject" TEXT NOT NULL,
    "responded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_permission_communications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "company_permission_communications_companyId_idx" ON "company_permission_communications"("companyId");

DO $$ BEGIN
    ALTER TABLE "company_permission_communications" ADD CONSTRAINT "company_permission_communications_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "book_box_companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
