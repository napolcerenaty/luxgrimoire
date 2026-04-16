#!/usr/bin/env python3
"""
LuxGrimoire — Open Library bulk import
=======================================
Streams OL data dumps directly from the internet into your PostgreSQL database.
No files are saved to disk; everything is streamed in memory.

Usage:
  python import_ol.py init            # Full initial import (run once)
  python import_ol.py diff            # Monthly update — only new/changed records
  python import_ol.py init --dry-run  # Count matching records without writing
  python import_ol.py init --skip-authors  # Skip authors, re-import only works
  python import_ol.py init --skip-works    # Skip works, re-import only authors

Configuration (environment variables or .env file):
  DB_HOST      (default: localhost)
  DB_PORT      (default: 5432)
  DB_NAME      (default: luxgrimoire)
  DB_USER      (default: postgres)
  DB_PASSWORD  (default: postgres)

Tables created automatically:
  ol_author      — OL author catalog  (link to your author.id manually later)
  ol_book        — OL work catalog    (link to your book.id manually later)
  ol_book_author — junction table
  ol_import_log  — run history / timestamps for diff mode

Estimated runtime:
  init:  20–60 min depending on network speed and hardware
  diff:  5–15 min (only new/changed records since last run)
"""

import sys
import json
import gzip
import time
import re
import argparse
import io
import os
from datetime import datetime, timezone
from typing import Optional

import requests
import psycopg2
import psycopg2.extras
from tqdm import tqdm

# ── Configuration ─────────────────────────────────────────────────────────────

DB_HOST     = os.getenv("DB_HOST",     "localhost")
DB_PORT     = os.getenv("DB_PORT",     "5432")
DB_NAME     = os.getenv("DB_NAME",     "luxgrimoire")
DB_USER     = os.getenv("DB_USER",     "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD", "postgres")

OL_AUTHORS_URL = "https://openlibrary.org/data/ol_dump_authors_latest.txt.gz"
OL_WORKS_URL   = "https://openlibrary.org/data/ol_dump_works_latest.txt.gz"

MIN_YEAR   = 1980
BATCH_SIZE = 1000

# ── Schema ─────────────────────────────────────────────────────────────────────

CREATE_TABLES_SQL = """
CREATE TABLE IF NOT EXISTS ol_author (
    ol_key      VARCHAR(30)  PRIMARY KEY,          -- e.g. /authors/OL12345A
    name        VARCHAR(300) NOT NULL,
    ol_modified TIMESTAMP    NOT NULL,
    author_id   VARCHAR(36)  NULL                  -- linked to author.id (set via admin UI later)
);

CREATE TABLE IF NOT EXISTS ol_book (
    ol_key          VARCHAR(30)  PRIMARY KEY,      -- e.g. /works/OL12345W
    title           VARCHAR(500) NOT NULL,
    series_name     VARCHAR(300),
    series_position VARCHAR(30),                   -- VARCHAR: OL can have "1.5", "Book 1" etc.
    first_pub_year  SMALLINT,
    ol_modified     TIMESTAMP    NOT NULL,
    book_id         VARCHAR(36)  NULL              -- linked to book.id (set when admin creates Book from this)
);

CREATE TABLE IF NOT EXISTS ol_book_author (
    ol_book_key   VARCHAR(30) NOT NULL,
    ol_author_key VARCHAR(30) NOT NULL,
    PRIMARY KEY (ol_book_key, ol_author_key)
);

CREATE TABLE IF NOT EXISTS ol_import_log (
    id                SERIAL      PRIMARY KEY,
    run_at            TIMESTAMP   NOT NULL,
    mode              VARCHAR(10) NOT NULL,
    books_processed   BIGINT,
    books_inserted    BIGINT,
    authors_inserted  BIGINT,
    duration_seconds  INT
);

CREATE INDEX IF NOT EXISTS idx_ol_book_title      ON ol_book (title);
CREATE INDEX IF NOT EXISTS idx_ol_book_series     ON ol_book (series_name);
CREATE INDEX IF NOT EXISTS idx_ol_book_year       ON ol_book (first_pub_year);
CREATE INDEX IF NOT EXISTS idx_ol_book_linked     ON ol_book (book_id)     WHERE book_id   IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ol_author_name     ON ol_author (name);
CREATE INDEX IF NOT EXISTS idx_ol_author_linked   ON ol_author (author_id) WHERE author_id IS NOT NULL;
"""

# ── Helpers ────────────────────────────────────────────────────────────────────

def get_conn():
    return psycopg2.connect(
        host=DB_HOST, port=DB_PORT, dbname=DB_NAME,
        user=DB_USER, password=DB_PASSWORD,
    )


class _ProgressStream(io.RawIOBase):
    """Wraps a raw stream and advances a tqdm bar as bytes are read."""
    def __init__(self, raw, pbar):
        self._raw  = raw
        self._pbar = pbar

    def read(self, n=-1):
        chunk = self._raw.read(n)
        if chunk:
            self._pbar.update(len(chunk))
        return chunk

    def readinto(self, b):
        n = self._raw.readinto(b)
        if n:
            self._pbar.update(n)
        return n


def stream_ol_dump(url: str, label: str):
    """
    Stream a gzip OL dump from the given URL, yielding one raw text line at a time.
    Never writes anything to disk.
    """
    print(f"\n  ↓ Downloading {label}: {url}")
    response = requests.get(url, stream=True, timeout=120)
    response.raise_for_status()

    total = int(response.headers.get("content-length", 0)) or None
    pbar  = tqdm(total=total, unit="B", unit_scale=True, desc=f"  {label}")

    buf = io.BufferedReader(
        _ProgressStream(response.raw, pbar),
        buffer_size=1 << 20,  # 1 MB read buffer
    )
    with gzip.open(buf, "rt", encoding="utf-8", errors="replace") as f:
        for line in f:
            yield line.rstrip("\n")

    pbar.close()


def parse_line(line: str):
    """
    Parse one tab-separated OL dump line.
    Columns: type \\t key \\t revision \\t last_modified \\t json
    Returns (rec_type, key, modified_dt, data_dict) or None on error.
    """
    parts = line.split("\t", 4)
    if len(parts) < 5:
        return None
    try:
        data = json.loads(parts[4])
        # modified format: "2023-04-15T10:30:00.000000"
        modified = datetime.fromisoformat(parts[3].split(".")[0])
        return parts[0], parts[1], modified, data
    except (json.JSONDecodeError, ValueError):
        return None


def is_english(work: dict) -> bool:
    """True if the work is English or has no language tag (OL default is English)."""
    langs = work.get("languages", [])
    if not langs:
        return True
    return any(lang.get("key", "") == "/languages/eng" for lang in langs)


_SERIES_POS_RE = re.compile(
    r"[,\s]+(?:book|vol\.?|volume|#|part)\s*(\d+(?:\.\d+)?)\s*$",
    re.IGNORECASE,
)

def extract_series(work: dict):
    """
    Returns (series_name, series_position) strings or (None, None).
    OL series field is a list; each item can be a string or a dict.
    """
    raw = work.get("series", [])
    if not raw:
        return None, None

    first = raw[0]

    if isinstance(first, str) and first.strip():
        name = first.strip()
        pos  = None
        m = _SERIES_POS_RE.search(name)
        if m:
            pos  = m.group(1)
            name = name[:m.start()].strip().rstrip(",").strip()
        return name[:300] or None, pos

    if isinstance(first, dict):
        name = (first.get("name") or first.get("title") or "").strip()
        pos  = first.get("position") or first.get("number")
        return (name[:300] or None), (str(pos)[:30] if pos else None)

    return None, None


def get_last_import_time(conn) -> Optional[datetime]:
    with conn.cursor() as cur:
        cur.execute("SELECT MAX(run_at) FROM ol_import_log")
        row = cur.fetchone()
    return row[0] if row and row[0] else None


def log_import(conn, mode, books_processed, books_inserted, authors_inserted, duration):
    with conn.cursor() as cur:
        cur.execute(
            """INSERT INTO ol_import_log
                   (run_at, mode, books_processed, books_inserted, authors_inserted, duration_seconds)
               VALUES (%s, %s, %s, %s, %s, %s)""",
            (datetime.now(timezone.utc), mode,
             books_processed, books_inserted, authors_inserted, duration),
        )
    conn.commit()

# ── Author import ──────────────────────────────────────────────────────────────

def import_authors(conn, mode: str, dry_run: bool) -> int:
    print("\n👤 Authors dump…")
    last_import = get_last_import_time(conn) if mode == "diff" else None

    batch     = []
    inserted  = 0

    def flush():
        nonlocal inserted
        if not batch or dry_run:
            return
        with conn.cursor() as cur:
            psycopg2.extras.execute_values(
                cur,
                """INSERT INTO ol_author (ol_key, name, ol_modified)
                   VALUES %s
                   ON CONFLICT (ol_key) DO UPDATE
                     SET name        = EXCLUDED.name,
                         ol_modified = EXCLUDED.ol_modified
                         WHERE ol_author.ol_modified < EXCLUDED.ol_modified""",
                batch,
            )
        conn.commit()
        inserted += len(batch)
        batch.clear()

    for line in stream_ol_dump(OL_AUTHORS_URL, "Authors"):
        parsed = parse_line(line)
        if not parsed:
            continue
        rec_type, key, modified, data = parsed

        if rec_type != "/type/author":
            continue
        if data.get("type", {}).get("key") == "/type/delete":
            continue

        name = (data.get("name") or "").strip()
        if not name:
            continue

        if last_import and modified <= last_import:
            continue

        batch.append((key, name[:300], modified))
        if len(batch) >= BATCH_SIZE:
            flush()

    flush()
    if dry_run:
        inserted = len(batch)

    print(f"  ✓ {inserted:,} authors upserted")
    return inserted

# ── Works import ───────────────────────────────────────────────────────────────

def import_works(conn, mode: str, dry_run: bool) -> tuple:
    print("\n📖 Works dump…")
    last_import = get_last_import_time(conn) if mode == "diff" else None

    book_batch = []
    link_batch = []
    processed  = 0
    inserted   = 0

    def flush():
        nonlocal inserted
        if not book_batch or dry_run:
            return
        with conn.cursor() as cur:
            psycopg2.extras.execute_values(
                cur,
                """INSERT INTO ol_book
                       (ol_key, title, series_name, series_position, first_pub_year, ol_modified)
                   VALUES %s
                   ON CONFLICT (ol_key) DO UPDATE
                     SET title           = EXCLUDED.title,
                         series_name     = EXCLUDED.series_name,
                         series_position = EXCLUDED.series_position,
                         first_pub_year  = EXCLUDED.first_pub_year,
                         ol_modified     = EXCLUDED.ol_modified
                         WHERE ol_book.ol_modified < EXCLUDED.ol_modified""",
                book_batch,
            )
            if link_batch:
                psycopg2.extras.execute_values(
                    cur,
                    "INSERT INTO ol_book_author (ol_book_key, ol_author_key) VALUES %s"
                    " ON CONFLICT DO NOTHING",
                    link_batch,
                )
        conn.commit()
        inserted += len(book_batch)
        book_batch.clear()
        link_batch.clear()

    for line in stream_ol_dump(OL_WORKS_URL, "Works"):
        parsed = parse_line(line)
        if not parsed:
            continue
        rec_type, key, modified, data = parsed

        if rec_type != "/type/work":
            continue
        if data.get("type", {}).get("key") == "/type/delete":
            continue

        # ── Filters ──────────────────────────────────────────────────────────
        year = data.get("first_publish_year")
        if year and int(year) < MIN_YEAR:
            continue

        if not is_english(data):
            continue

        title = (data.get("title") or "").strip()
        if not title:
            continue

        authors = [
            a["author"]["key"]
            for a in data.get("authors", [])
            if isinstance(a, dict)
            and isinstance(a.get("author"), dict)
            and a["author"].get("key")
        ]
        if not authors:
            continue

        if last_import and modified <= last_import:
            continue

        # ── Collect ───────────────────────────────────────────────────────────
        processed += 1
        series_name, series_pos = extract_series(data)

        book_batch.append((
            key, title[:500],
            series_name, series_pos,
            year, modified,
        ))
        for ak in authors:
            link_batch.append((key, ak))

        if len(book_batch) >= BATCH_SIZE:
            flush()

    flush()
    if dry_run:
        inserted = processed  # approximation

    print(f"  ✓ {processed:,} works processed, {inserted:,} upserted")
    return processed, inserted

# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="LuxGrimoire — Open Library bulk import",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Examples:\n"
            "  python import_ol.py init\n"
            "  python import_ol.py diff\n"
            "  python import_ol.py init --dry-run\n"
            "  python import_ol.py init --skip-authors\n"
        ),
    )
    parser.add_argument("mode", choices=["init", "diff"],
                        help="init=full import  diff=monthly update")
    parser.add_argument("--dry-run",      action="store_true",
                        help="Count records without writing to DB")
    parser.add_argument("--skip-authors", action="store_true")
    parser.add_argument("--skip-works",   action="store_true")
    args = parser.parse_args()

    label = f"mode={args.mode}" + (" [DRY RUN]" if args.dry_run else "")
    print(f"🚀 LuxGrimoire OL Import — {label}")
    print(f"   DB: {DB_USER}@{DB_HOST}:{DB_PORT}/{DB_NAME}")

    start = time.time()
    conn  = get_conn()

    if not args.dry_run:
        with conn.cursor() as cur:
            cur.execute(CREATE_TABLES_SQL)
        conn.commit()
        print("✓ Schema ready")

    authors_count              = 0
    books_processed, books_ins = 0, 0

    if not args.skip_authors:
        authors_count = import_authors(conn, args.mode, args.dry_run)

    if not args.skip_works:
        books_processed, books_ins = import_works(conn, args.mode, args.dry_run)

    duration = int(time.time() - start)

    if not args.dry_run:
        log_import(conn, args.mode, books_processed, books_ins, authors_count, duration)

    conn.close()

    print(f"\n✅ Finished in {duration // 60}m {duration % 60}s")
    print(f"   Authors : {authors_count:,}")
    print(f"   Books   : {books_processed:,} processed  /  {books_ins:,} upserted")


if __name__ == "__main__":
    main()
