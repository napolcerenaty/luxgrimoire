"""
feature_tags_migrate.py
───────────────────────
Backfills edition_feature_tags table by:
  1. Reading book_editions.features[] → source="features"
  2. Reading artist_contributions.role → source="artist_contribution"
  3. Running each raw value through regex patterns loaded from feature_categories
  4. Inserting (editionId, categoryId, rawValue, source) into edition_feature_tags

Must run feature_categories_seed.py first to populate feature_categories table.

Usage (from project root):
    python scripts/feature_tags_migrate.py [--db <database_url>] [--dry-run] [--limit N]

Options:
    --db        Override DB URL
    --dry-run   Print stats and sample matches without inserting
    --limit N   Process only first N editions (for testing)
"""

import re
import sys
import json
import uuid
from collections import defaultdict
from datetime import datetime, timezone

import psycopg2
from psycopg2.extras import execute_values

DB_URL_DEFAULT = "postgresql://postgres:postgres@localhost:5432/luxgrimoire_v2"


# ─── Regex cache ──────────────────────────────────────────────────────────────

def compile_patterns(patterns: list[str]) -> list[re.Pattern]:
    return [re.compile(p, re.IGNORECASE) for p in patterns]


def matches_category(value: str, includes: list[re.Pattern], excludes: list[re.Pattern]) -> bool:
    if not any(p.search(value) for p in includes):
        return False
    if any(p.search(value) for p in excludes):
        return False
    return True


def build_tagger(categories: list[dict]) -> callable:
    """Returns a function: value -> list[category_id]"""
    compiled = []
    for cat in categories:
        inc = compile_patterns(cat["includePatterns"])
        exc = compile_patterns(cat["excludePatterns"])
        compiled.append((cat["id"], inc, exc))

    def tagger(value: str) -> list[str]:
        v = value.strip().lower()
        return [cat_id for cat_id, inc, exc in compiled if matches_category(v, inc, exc)]

    return tagger


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    dry_run = "--dry-run" in sys.argv
    db_url = DB_URL_DEFAULT
    limit = None

    if "--db" in sys.argv:
        db_url = sys.argv[sys.argv.index("--db") + 1]
    if "--limit" in sys.argv:
        limit = int(sys.argv[sys.argv.index("--limit") + 1])

    prefix = "[DRY RUN] " if dry_run else ""
    print(f"{prefix}Connecting to DB...")

    conn = psycopg2.connect(db_url)
    cur = conn.cursor()

    # ── 1. Load categories ────────────────────────────────────────────────────
    cur.execute("""
        SELECT id, slug, label, "group", "includePatterns", "excludePatterns"
        FROM feature_categories
        WHERE "isActive" = true
        ORDER BY "sortOrder"
    """)
    rows = cur.fetchall()
    if not rows:
        print("❌ No categories found. Run 01_seed_categories.py first.")
        conn.close()
        sys.exit(1)

    categories = [
        {
            "id": r[0], "slug": r[1], "label": r[2], "group": r[3],
            "includePatterns": r[4], "excludePatterns": r[5],
        }
        for r in rows
    ]
    print(f"  Loaded {len(categories)} active categories.")

    tagger = build_tagger(categories)

    # ── 2. Process book_editions.features[] ───────────────────────────────────
    limit_clause = f"LIMIT {limit}" if limit else ""
    cur.execute(f"""
        SELECT id, features
        FROM book_editions
        WHERE array_length(features, 1) > 0
        ORDER BY id
        {limit_clause}
    """)
    editions = cur.fetchall()
    print(f"  Processing {len(editions)} editions with features...")

    tag_rows = []
    stats = defaultdict(int)
    unmatched_samples = set()

    for edition_id, features in editions:
        for raw_value in (features or []):
            if not raw_value or not raw_value.strip():
                continue
            matched = tagger(raw_value.strip())
            stats["features_total"] += 1
            if matched:
                stats["features_matched"] += 1
                for cat_id in matched:
                    tag_rows.append((
                        str(uuid.uuid4()),
                        edition_id,
                        cat_id,
                        raw_value.strip(),
                        "features",
                        datetime.now(timezone.utc),
                    ))
            else:
                stats["features_unmatched"] += 1
                if len(unmatched_samples) < 30:
                    unmatched_samples.add(raw_value.strip().lower())

    # ── 3. Process artist_contributions.role ──────────────────────────────────
    cur.execute(f"""
        SELECT ac."editionId", ac.role
        FROM artist_contributions ac
        JOIN book_editions be ON be.id = ac."editionId"
        WHERE ac.role IS NOT NULL AND trim(ac.role) <> ''
        ORDER BY ac."editionId"
        {'LIMIT ' + str(limit * 10) if limit else ''}
    """)
    contributions = cur.fetchall()
    print(f"  Processing {len(contributions)} artist contributions...")

    for edition_id, role in contributions:
        matched = tagger(role.strip())
        stats["artist_total"] += 1
        if matched:
            stats["artist_matched"] += 1
            for cat_id in matched:
                tag_rows.append((
                    str(uuid.uuid4()),
                    edition_id,
                    cat_id,
                    role.strip(),
                    "artist_contribution",
                    datetime.now(timezone.utc),
                ))
        else:
            stats["artist_unmatched"] += 1
            if len(unmatched_samples) < 50:
                unmatched_samples.add(role.strip().lower())

    # ── 4. Stats report ───────────────────────────────────────────────────────
    print("\n── Stats ────────────────────────────────────────────")
    print(f"  Features:    {stats['features_matched']:>5} matched / {stats['features_total']:>5} total "
          f"({stats['features_matched']/max(stats['features_total'],1)*100:.1f}%)")
    print(f"  Artist roles:{stats['artist_matched']:>5} matched / {stats['artist_total']:>5} total "
          f"({stats['artist_matched']/max(stats['artist_total'],1)*100:.1f}%)")
    print(f"  Tag rows to insert: {len(tag_rows)}")

    if unmatched_samples:
        print(f"\n  Unmatched samples ({len(unmatched_samples)}):")
        for s in sorted(unmatched_samples)[:30]:
            print(f"    - {s!r}")

    if dry_run:
        print(f"\n{prefix}Done. Pass without --dry-run to insert {len(tag_rows)} rows.")
        conn.close()
        return

    # ── 5. Insert (skip existing via ON CONFLICT DO NOTHING) ──────────────────
    print("\nInserting tag rows (ON CONFLICT DO NOTHING)...")

    # Clear existing migration data before re-running (idempotent re-run support)
    cur.execute("DELETE FROM edition_feature_tags WHERE source IN ('features', 'artist_contribution')")
    deleted = cur.rowcount
    if deleted:
        print(f"  Cleared {deleted} existing migration rows.")

    BATCH = 500
    inserted = 0
    for i in range(0, len(tag_rows), BATCH):
        batch = tag_rows[i:i + BATCH]
        execute_values(
            cur,
            """
            INSERT INTO edition_feature_tags (id, "editionId", "categoryId", "rawValue", source, "createdAt")
            VALUES %s
            ON CONFLICT ("editionId", "categoryId", "rawValue") DO NOTHING
            """,
            batch,
            template='(%s, %s, %s, %s, %s, %s)'
        )
        inserted += cur.rowcount

    conn.commit()
    conn.close()

    print(f"✅ Done. Inserted {inserted} tag rows ({len(tag_rows) - inserted} skipped as duplicates).")


if __name__ == "__main__":
    main()
