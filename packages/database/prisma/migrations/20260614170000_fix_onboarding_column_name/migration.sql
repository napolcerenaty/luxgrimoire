-- Rename column created with camelCase quoted name to snake_case expected by Prisma
ALTER TABLE users RENAME COLUMN "onboardingCompletedAt" TO "onboarding_completed_at";
