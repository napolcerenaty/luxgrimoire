-- Growth roadmap Faza 0: first-touch signup attribution.
-- Stores the raw `lg_src` cookie payload (utm_* / ref / landing path) captured by
-- the web middleware and forwarded at registration. Nullable, no backfill.
ALTER TABLE users ADD COLUMN IF NOT EXISTS "signupSource" TEXT;
