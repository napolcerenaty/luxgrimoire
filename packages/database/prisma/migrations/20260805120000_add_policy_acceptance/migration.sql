-- Durable history of ToS/Privacy consent events, independent of the "latest state" cache
-- kept on users.termsVersion/privacyVersion (those two columns already existed before this
-- migration and are left untouched — this table is additive, for full audit history).
CREATE TABLE IF NOT EXISTS "policy_acceptances" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "docType" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "policy_acceptances_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "policy_acceptances_userId_idx" ON "policy_acceptances"("userId");
CREATE INDEX IF NOT EXISTS "policy_acceptances_docType_idx" ON "policy_acceptances"("docType");
CREATE INDEX IF NOT EXISTS "policy_acceptances_userId_docType_acceptedAt_idx" ON "policy_acceptances"("userId", "docType", "acceptedAt");

DO $$ BEGIN
    ALTER TABLE "policy_acceptances" ADD CONSTRAINT "policy_acceptances_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
