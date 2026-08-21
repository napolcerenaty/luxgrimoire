-- Data fix: "Victorious" (V.E. Schwab) has two Illumicrate editions that went on sale at the
-- exact same moment (identical First/Early/General Access rows in edition_sale_dates), so
-- linkEditionHistory()'s date-based auto-ordering hit a tie and fell back to argument order
-- instead of the real release order. The plain edition ("victorious-illumicrate-68867dd0", no
-- artist contributions, 1 image) ended up pointing to the redesigned/foiled/acetate-jacket
-- edition ("victorious-illumicrate-d7b25ff6", 6 artist contributions, 5 images) as its
-- "previous" — backwards, since the plain edition is the base edition and the redesigned one
-- is the later reissue. Confirmed with the user 2026-08-21.
--
-- Swaps the previousEditionId link so the reissue points back to the base edition. Matched by
-- slug, not id, since ids are UUIDs generated per-environment.

DO $$
DECLARE
  base_id    TEXT;
  reissue_id TEXT;
BEGIN
  SELECT id INTO base_id
  FROM "book_editions" WHERE slug = 'victorious-illumicrate-68867dd0';

  SELECT id INTO reissue_id
  FROM "book_editions" WHERE slug = 'victorious-illumicrate-d7b25ff6';

  IF base_id IS NOT NULL AND reissue_id IS NOT NULL THEN
    -- Clear the base edition's (wrong) previousEditionId first — previousEditionId is unique,
    -- so the reissue can't take a value the base edition is still holding.
    UPDATE "book_editions"
    SET "previousEditionId" = NULL
    WHERE id = base_id AND "previousEditionId" = reissue_id;

    UPDATE "book_editions"
    SET "previousEditionId" = base_id
    WHERE id = reissue_id AND "previousEditionId" IS NULL;
  END IF;
END;
$$;
