-- Fix: update subscriptionId on book_editions that belong to content-stream months
-- but still point to the old "Book & Bookmark" subscription.
--
-- Context: when "The Fantasy Box" content stream (cf822fc9) was created and months
-- were migrated from "The Fantasy Box (Book & Bookmark)" (dd11e8ee), the editions
-- in those months were not re-pointed to the content stream. This caused the company
-- page to show only 3 directly-added editions instead of all 29.
--
-- Safety: all affected editions appear exclusively in content-stream months
-- (not in any "Book & Bookmark" months), so reassigning is safe.

UPDATE book_editions
SET "subscriptionId" = 'cf822fc9-7288-4f4e-9995-8bc454872896'
WHERE "subscriptionId" = 'dd11e8ee-c216-41d0-b09c-494490d3ff7c'
  AND id IN (
    SELECT DISTINCT smb."editionId"
    FROM subscription_month_books smb
    JOIN subscription_months sm ON sm.id = smb."monthId"
    WHERE sm."subscriptionId" = 'cf822fc9-7288-4f4e-9995-8bc454872896'
  );
