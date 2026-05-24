"""
feature_categories_seed.py
──────────────────────────
Seeds all 46 FeatureCategory rows into feature_categories table.
Imports CATEGORIES from feature_categories_definitions.py (same directory).

Usage (from project root):
    python scripts/feature_categories_seed.py [--db <database_url>] [--dry-run]

Options:
    --db        Override DB URL (default: reads DATABASE_URL env var or falls back to localhost)
    --dry-run   Print SQL without executing
"""

import sys
import json
import uuid
from datetime import datetime, timezone

sys.path.insert(0, ".")
from feature_categories_definitions import CATEGORIES  # noqa: E402

import psycopg2
from psycopg2.extras import execute_values

DB_URL_DEFAULT = "postgresql://postgres:postgres@localhost:5432/luxgrimoire_v2"


def main():
    dry_run = "--dry-run" in sys.argv
    db_url = DB_URL_DEFAULT
    if "--db" in sys.argv:
        idx = sys.argv.index("--db")
        db_url = sys.argv[idx + 1]

    now = datetime.now(timezone.utc)

    rows = []
    for i, (slug, label, group, includes, excludes) in enumerate(CATEGORIES):
        rows.append((
            str(uuid.uuid4()),
            slug,
            label,
            group,
            True,               # isActive
            i,                  # sortOrder — preserves definition order within group
            json.dumps(includes),
            json.dumps(excludes),
            now,
            now,
        ))

    print(f"{'[DRY RUN] ' if dry_run else ''}Seeding {len(rows)} categories...")

    if dry_run:
        for row in rows:
            print(f"  INSERT feature_categories: slug={row[1]!r:40s} group={row[3]!r}")
        print("\nDone (dry run). Pass without --dry-run to apply.")
        return

    conn = psycopg2.connect(db_url)
    cur = conn.cursor()

    # Upsert: insert new, update label/group/patterns if slug already exists
    execute_values(
        cur,
        """
        INSERT INTO feature_categories (id, slug, label, "group", "isActive", "sortOrder",
                                         "includePatterns", "excludePatterns", "createdAt", "updatedAt")
        VALUES %s
        ON CONFLICT (slug) DO UPDATE SET
            label             = EXCLUDED.label,
            "group"           = EXCLUDED."group",
            "isActive"        = EXCLUDED."isActive",
            "sortOrder"       = EXCLUDED."sortOrder",
            "includePatterns" = EXCLUDED."includePatterns",
            "excludePatterns" = EXCLUDED."excludePatterns",
            "updatedAt"       = EXCLUDED."updatedAt"
        """,
        rows,
        template="(%s, %s, %s, %s, %s, %s, %s::jsonb, %s::jsonb, %s, %s)"
    )
    conn.commit()
    conn.close()

    print(f"✅ Done. {len(rows)} categories upserted.")


if __name__ == "__main__":
    main()
