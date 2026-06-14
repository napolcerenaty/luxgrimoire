-- Restore camelCase column names to match project convention
ALTER TABLE users RENAME COLUMN "onboarding_completed_at" TO "onboardingCompletedAt";
ALTER TABLE users RENAME COLUMN "stats_settings" TO "statsSettings";
