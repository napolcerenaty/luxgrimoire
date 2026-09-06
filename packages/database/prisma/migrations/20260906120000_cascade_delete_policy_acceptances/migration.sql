-- ProfileService.deleteAccount() and AdminService's user-delete both do a bare
-- prisma.user.delete() with no manual cleanup of policy_acceptances first. Without
-- ON DELETE CASCADE on this FK, deleting ANY user who has ever accepted terms/privacy
-- (i.e. every user registered since the legal-consent-versioning feature) throws a
-- foreign key violation — account deletion is currently broken for those users.

ALTER TABLE "policy_acceptances" DROP CONSTRAINT IF EXISTS "policy_acceptances_userId_fkey";

DO $$ BEGIN
  ALTER TABLE "policy_acceptances" ADD CONSTRAINT "policy_acceptances_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
