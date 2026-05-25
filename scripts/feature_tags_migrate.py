"""
feature_tags_migrate.py
──────────────────────
Normalizes edition_feature_tags by:
  1. Applying local schema fixes needed for artist-backed feature tags.
  2. Reading book_editions.features[] → source="features".
  3. Reading artist_contributions.role → source="artist" with artistId/artistName.
  4. Running each raw value through regex patterns loaded from feature_categories.
  5. Rebuilding non-manual edition_feature_tags rows with one row per (editionId, categoryId).

Usage (from project root):
    python scripts/feature_tags_migrate.py [--db <database_url>]... [--dry-run] [--limit N]

If no --db values are passed, both local LuxGrimoire databases are processed.
"""

from __future__ import annotations

import re
import sys
import uuid
from collections import defaultdict
from datetime import datetime, timezone
from typing import Iterable

import psycopg2
from psycopg2.extras import execute_values

DB_URLS_DEFAULT = [
    "postgresql://postgres:postgres@localhost:5432/luxgrimoire_v2",
    "postgresql://postgres:postgres@localhost:5432/luxgrimoire_prodsnap",
]


def compile_patterns(patterns: list[str]) -> list[re.Pattern[str]]:
    return [re.compile(pattern, re.IGNORECASE) for pattern in patterns]


def matches_category(value: str, includes: list[re.Pattern[str]], excludes: list[re.Pattern[str]]) -> bool:
    if not any(pattern.search(value) for pattern in includes):
        return False
    if any(pattern.search(value) for pattern in excludes):
        return False
    return True


def build_tagger(categories: list[dict]) -> callable:
    compiled = []
    for category in categories:
        compiled.append(
            (
                category["id"],
                compile_patterns(category["includePatterns"]),
                compile_patterns(category["excludePatterns"]),
            )
        )

    def tagger(value: str) -> list[str]:
        normalized = value.strip().lower()
        return [
            category_id
            for category_id, includes, excludes in compiled
            if matches_category(normalized, includes, excludes)
        ]

    return tagger


def parse_args(argv: list[str]) -> tuple[list[str], bool, int | None]:
    dry_run = "--dry-run" in argv
    db_urls: list[str] = []
    limit: int | None = None

    index = 0
    while index < len(argv):
        arg = argv[index]
        if arg == "--db":
            db_urls.append(argv[index + 1])
            index += 2
            continue
        if arg == "--limit":
            limit = int(argv[index + 1])
            index += 2
            continue
        index += 1

    return (db_urls or DB_URLS_DEFAULT), dry_run, limit


def ensure_schema(cur) -> None:
    cur.execute('ALTER TABLE edition_feature_tags ADD COLUMN IF NOT EXISTS "artistId" TEXT;')
    cur.execute('ALTER TABLE edition_feature_tags ADD COLUMN IF NOT EXISTS "artistName" TEXT;')
    cur.execute('ALTER TABLE edition_feature_tags ADD COLUMN IF NOT EXISTS "is_manual" BOOLEAN NOT NULL DEFAULT false;')
    cur.execute('CREATE INDEX IF NOT EXISTS "edition_feature_tags_artistId_idx" ON "edition_feature_tags"("artistId");')
    cur.execute('DROP INDEX IF EXISTS "edition_feature_tags_editionId_categoryId_rawValue_key";')

    cur.execute(
        """
        DO $$
        BEGIN
            ALTER TABLE edition_feature_tags
              ADD CONSTRAINT "edition_feature_tags_artistId_fkey"
              FOREIGN KEY ("artistId") REFERENCES "artists"("id") ON DELETE SET NULL ON UPDATE CASCADE;
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END $$;
        """
    )

    cur.execute(
        """
        WITH ranked AS (
            SELECT id,
                   ROW_NUMBER() OVER (
                       PARTITION BY "editionId", "categoryId"
                       ORDER BY
                           CASE WHEN is_manual THEN 0 ELSE 1 END,
                           CASE source WHEN 'artist' THEN 0 WHEN 'artist_contribution' THEN 0 ELSE 1 END,
                           "createdAt"
                   ) AS rn
            FROM edition_feature_tags
        )
        DELETE FROM edition_feature_tags
        WHERE id IN (SELECT id FROM ranked WHERE rn > 1);
        """
    )
    cur.execute(
        'CREATE UNIQUE INDEX IF NOT EXISTS "edition_feature_tags_editionId_categoryId_key" ON "edition_feature_tags"("editionId", "categoryId");'
    )


def load_categories(cur) -> list[dict]:
    cur.execute(
        """
        SELECT id, slug, label, "group", "includePatterns", "excludePatterns"
        FROM feature_categories
        WHERE "isActive" = true
        ORDER BY "group", "sortOrder"
        """
    )
    rows = cur.fetchall()
    return [
        {
            "id": row[0],
            "slug": row[1],
            "label": row[2],
            "group": row[3],
            "includePatterns": row[4],
            "excludePatterns": row[5],
        }
        for row in rows
    ]


def collect_feature_rows(cur, limit: int | None, tagger: callable, stats: defaultdict[str, int], unmatched: set[str]):
    limit_clause = f"LIMIT {limit}" if limit else ""
    cur.execute(
        f'''
        SELECT id, features
        FROM book_editions
        WHERE array_length(features, 1) > 0
        ORDER BY id
        {limit_clause}
        '''
    )

    deduped: dict[tuple[str, str], tuple[str, str | None, str | None, str]] = {}
    for edition_id, features in cur.fetchall():
        for raw_value in features or []:
            cleaned = (raw_value or "").strip()
            if not cleaned:
                continue
            matches = tagger(cleaned)
            stats["features_total"] += 1
            if not matches:
                stats["features_unmatched"] += 1
                if len(unmatched) < 30:
                    unmatched.add(cleaned.lower())
                continue

            stats["features_matched"] += 1
            for category_id in matches:
                deduped.setdefault((edition_id, category_id), (cleaned, None, None, "features"))

    return deduped


def collect_artist_rows(
    cur,
    limit: int | None,
    tagger: callable,
    deduped: dict[tuple[str, str], tuple[str, str | None, str | None, str]],
    stats: defaultdict[str, int],
    unmatched: set[str],
) -> None:
    artist_limit_clause = f"LIMIT {limit * 10}" if limit else ""
    cur.execute(
        f'''
        SELECT ac."editionId", ac.role, ac."artistId", ac."artistName"
        FROM artist_contributions ac
        JOIN book_editions be ON be.id = ac."editionId"
        WHERE ac.role IS NOT NULL AND trim(ac.role) <> ''
        ORDER BY ac."editionId"
        {artist_limit_clause}
        '''
    )

    for edition_id, role, artist_id, artist_name in cur.fetchall():
        cleaned = role.strip()
        matches = tagger(cleaned)
        stats["artist_total"] += 1
        if not matches:
            stats["artist_unmatched"] += 1
            if len(unmatched) < 50:
                unmatched.add(cleaned.lower())
            continue

        stats["artist_matched"] += 1
        for category_id in matches:
            deduped[(edition_id, category_id)] = (cleaned, artist_id, artist_name, "artist")


def build_insert_rows(deduped: dict[tuple[str, str], tuple[str, str | None, str | None, str]]) -> list[tuple]:
    now = datetime.now(timezone.utc)
    rows: list[tuple] = []
    for (edition_id, category_id), (raw_value, artist_id, artist_name, source) in deduped.items():
        rows.append(
            (
                str(uuid.uuid4()),
                edition_id,
                category_id,
                raw_value,
                artist_id,
                artist_name,
                source,
                False,
                now,
            )
        )
    return rows


def migrate_database(db_url: str, dry_run: bool, limit: int | None) -> None:
    prefix = "[DRY RUN] " if dry_run else ""
    print(f"\n{prefix}Connecting to {db_url}...")

    conn = psycopg2.connect(db_url)
    cur = conn.cursor()

    ensure_schema(cur)
    categories = load_categories(cur)
    if not categories:
        conn.rollback()
        conn.close()
        raise RuntimeError(f"No categories found in {db_url}. Seed feature_categories first.")

    print(f"  Loaded {len(categories)} active categories.")
    tagger = build_tagger(categories)
    stats: defaultdict[str, int] = defaultdict(int)
    unmatched: set[str] = set()

    deduped = collect_feature_rows(cur, limit, tagger, stats, unmatched)
    collect_artist_rows(cur, limit, tagger, deduped, stats, unmatched)
    tag_rows = build_insert_rows(deduped)

    print("  Stats:")
    print(
        f"    Features: {stats['features_matched']} matched / {stats['features_total']} total "
        f"({stats['features_matched'] / max(stats['features_total'], 1) * 100:.1f}%)"
    )
    print(
        f"    Artist roles: {stats['artist_matched']} matched / {stats['artist_total']} total "
        f"({stats['artist_matched'] / max(stats['artist_total'], 1) * 100:.1f}%)"
    )
    print(f"    Final tag rows: {len(tag_rows)}")

    if unmatched:
        print("  Unmatched samples:")
        for sample in sorted(unmatched)[:30]:
            print(f"    - {sample!r}")

    if dry_run:
        conn.rollback()
        conn.close()
        return

    cur.execute(
        "DELETE FROM edition_feature_tags WHERE is_manual = false AND source IN ('features', 'artist', 'artist_contribution')"
    )
    deleted = cur.rowcount
    if deleted:
        print(f"  Cleared {deleted} existing auto-generated rows.")

    if tag_rows:
        execute_values(
            cur,
            '''
            INSERT INTO edition_feature_tags (
                id,
                "editionId",
                "categoryId",
                "rawValue",
                "artistId",
                "artistName",
                source,
                is_manual,
                "createdAt"
            )
            VALUES %s
            ON CONFLICT ("editionId", "categoryId") DO NOTHING
            ''',
            tag_rows,
            template='(%s, %s, %s, %s, %s, %s, %s, %s, %s)',
            page_size=500,
        )

    conn.commit()
    conn.close()
    print("  Migration complete.")


def main(argv: Iterable[str] | None = None) -> None:
    db_urls, dry_run, limit = parse_args(list(argv or sys.argv[1:]))
    for db_url in db_urls:
        migrate_database(db_url, dry_run, limit)


if __name__ == "__main__":
    main()
