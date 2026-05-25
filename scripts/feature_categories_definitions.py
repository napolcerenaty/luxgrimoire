"""
LuxGrimoire Feature Categories — Verification file generator v2
Changes vs v1:
  - edges_digital REMOVED → absorbed into edges_printed
  - cover_art + cover_design → MERGED into redesigned_cover
  - Fixed: digitally_signed false positives (designed edges, printed edges)
  - Fixed: author_letter with "digital signature" → only author_letter
  - Fixed: "digitally signed" → only digitally_signed, NOT signed
  - New categories: original_cover, art_print, bookmark, foiled_edges,
    foredge_design, continuous_edge_design, limited, paper_quality,
    die_cut, author_signature_page, autopen_signature, stamped_signature,
    cover_typography, proofreading
  - Extended: uv_spot (+high-gloss), overlay (+vellum variants),
    bonus_content (+chapters/scenes), interior_art (+map artwork),
    interior_formatting (+formatting), edges_sprayed (+solid top/bottom),
    dust_jacket (+wraparound, bespoke jacket)
  - REMOVED: collectible_title_page
  - signed: added "hand signed" / "signed endpapers" patterns (same concept)
  - matching_spine: now also catches "across all X spines" (bridgerton-style)
  - interior_art: excludes "hidden illustration" (fore-edge, not interior)
  - interior_formatting: excludes "on the hardback" (cover feature, not formatting)
  - author_letter: removed "note from the narrator" (not an author letter)
  - edges_printed: fixed stencil exclude (was word-bounded, now matches "stenciled")
  - continuous_edge_design: removed "across all spines" and "matching title layout"
"""

import re
import psycopg2
from collections import defaultdict
from datetime import datetime

DB_URL = "postgresql://postgres:postgres@localhost:5432/luxgrimoire_prodsnap"

# ─────────────────────────────────────────────────────────
# CATEGORY DEFINITIONS
# Each entry: (slug, label, group, [regex_patterns], exclude_patterns)
# Matching is case-insensitive. Patterns use Python regex.
# Order matters for display grouping only — all matching categories are assigned.
# ─────────────────────────────────────────────────────────

CATEGORIES = [

    # ── GROUP: signed ──────────────────────────────────────
    (
        "author_letter_signed",
        "Author Letter with Signature",
        "signed",
        [
            r"\bauthor letter with.{0,10}digital signature\b",
            r"\bbound.?in author letter with.{0,10}digital signature\b",
            r"\bbound in author letter with.{0,10}digital signature\b",
            r"\bbound.?in letter with.{0,10}digital signature\b",
            r"\bbound in letter with.{0,10}digital signature\b",
            r"\bbound.?in letter from the author with.{0,10}digital signature\b",
            r"\bdigitally signed author letter\b",
            r"\bdigit\w+ signed.{0,20}letter\b",
        ],
        []
    ),
    (
        "signed",
        "Signed",
        "signed",
        [
            r"\bhand[- ]?signed\b", r"\bhand signature\b",
            r"\bsigned tip[- ]?in\b",
            r"\bsigned page\b",
            r"\bsigned endpapers?\b", r"\bsigned end papers?\b",
            r"\bsigned by the author\b",
            r"\bsigned by the artist\b", r"\bsigned copies\b",
            r"\bsigned \(limited\)\b", r"\bsigned for\b",
            r"\bexclusively designed signed\b",
            r"\bfirst 500 signed\b", r"^signed$",
            r"\bsigned by the artists\b",
        ],
        [r"\bdigitally signed\b", r"\bbookplate\b", r"\bautopen\b", r"\bstamped\b"]
    ),
    (
        "digitally_signed",
        "Digital Signature",
        "signed",
        [
            r"\bdigital signature\b", r"\bdigital signatures\b",
            r"\bdigitally signed\b", r"\bdigital sig\b",
            r"\bfoiled digital signature\b", r"\bprinted signature\b",
            r"\bdigital author signature\b",
        ],
        # Exclude patterns that look like "digitally signed" but aren't signatures
        [
            r"\bdigitally designed edges\b", r"\bdigitally printed\b",
            r"\bdigitally sprayed\b",
            # Signature is on the letter, not the book — handled by author_letter_signed
            r"\bauthor letter\b", r"\bletter from the author\b",
            r"\bbound.?in letter\b", r"\bbound in letter\b",
            r"\binbound letter\b", r"\bdigitally signed author letter\b",
        ]
    ),
    (
        "signed_bookplate",
        "Signed Bookplate",
        "signed",
        [
            r"\bbookplates?\b", r"\bbookplated\b",
            r"\bsigned overlay\b",
        ],
        []
    ),
    (
        "autopen_signature",
        "Autopen Signature",
        "signed",
        [r"\bautopen\b"],
        []
    ),
    (
        "stamped_signature",
        "Stamped Signature",
        "signed",
        [
            r"\bstamped signature\b", r"\bhand.?stamped author signature\b",
            r"\bstamped author\b",
        ],
        []
    ),
    (
        "author_signature_page",
        "Author Signature Page",
        "interior",
        [
            r"\bauthor signature page\b", r"\bsignature page\b",
            r"\bsigned tip.?in page\b",
        ],
        [r"\bdesign\b"]
    ),

    # ── GROUP: edges ───────────────────────────────────────
    (
        "edges_printed",
        "Printed/Digital Edges",
        "edges",
        [
            r"\bdigitally printed\b", r"\bdigital printed\b",
            r"\bedges? printed\b", r"\bprinted edges?\b",
            r"\bprinted fore.?edge\b", r"\bprinted edge\b",
            r"\bdigital edges?\b",
            r"\bdigitally designed edges\b",
            r"\bedge design\b", r"\bedge designs\b",
            r"\bedges? artwork\b", r"\bexclusive edges\b",
            r"\bexclusive edge design\b", r"\bexclusive redesigned edges\b",
            r"\bbeautiful digi edges\b",
            r"\bedges\b",  # standalone "edges"
        ],
        [r"\bstencil\w*\b", r"\bgilded\b", r"\bgolden\b",
         r"\bsilver gilded\b", r"\bholographic edges\b", r"\blaser etched\b",
         r"\bfore.?edge artwork\b", r"\bhidden\b", r"\bcontinuous edge\b",
         r"\bseries connected\b", r"\bline up with\b",
         r"\bonly sprayed\b", r"\bsolid sprayed\b", r"\bsprayed edges\b"]
    ),
    (
        "edges_sprayed",
        "Sprayed Edges",
        "edges",
        [
            r"\bsprayed edges?\b", r"\bedges sprayed\b",
            r"\bspray top\b", r"\bspray bottom\b",
            r"\bblock sprayed\b", r"\bblock-sprayed\b",
            r"\bsolid sprayed\b", r"\bombre sprayed\b",
            r"\bomre stayed edges\b",  # typo in data
            r"\bdigital sprayed\b", r"\bdigitally sprayed\b",
            r"\bsolid top and bottom edges\b",
            r"\bsolid spray top and bottom\b",
            r"\bblock.?printed top\b",
            r"\bsprayed top and bottom\b",
            r"\bsolid top and bottom\b",
        ],
        []
    ),
    (
        "edges_stenciled",
        "Stenciled Edges",
        "edges",
        [
            r"\bstenciled? edges?\b", r"\bstencilled? edges?\b",
            r"\bstencil sprayed\b",
            r"\bstencil\b", r"\bstenciled\b", r"\bstencilled\b",
        ],
        []
    ),
    (
        "foiled_edges",
        "Foiled/Gilded Edges",
        "edges",
        [
            r"\bgilded edges\b", r"\bgilded edge\b",
            r"\bsilver gilded\b", r"\bgolden gilded\b",
            r"\bfoiled edges\b", r"\bholographic edges\b",
            r"\blaser etched edge\b",
        ],
        []
    ),
    (
        "foredge_design",
        "Fore-Edge Design",
        "edges",
        [
            r"\bhidden fore.?edge\b", r"\bfore.?edge artwork\b",
            r"\bforedge artwork\b", r"\bhidden visual\b",
            r"\billustrated foreedge\b", r"\bhidden illustration\b",
            r"\bfore-edge illustration\b", r"\bhidden fore.edge artwork\b",
            r"\bstencilled? fore.?edge\b",
        ],
        []
    ),
    (
        "continuous_edge_design",
        "Continuous/Series Edge Design",
        "edges",
        [
            r"\bcontinuous edge\b", r"\bseries connected edges\b",
            r"\bline up with the first book\b",
            r"\bline up with the first two\b",
        ],
        []
    ),

    # ── GROUP: cover ───────────────────────────────────────
    (
        "redesigned_cover",
        "Redesigned Cover",
        "cover",
        [
            r"\bredesigned covers?\b", r"\bexclusive covers?\b",
            r"\bexclusive redesigned\b", r"\bfully redesigned covers?\b",
            r"\bcover redesign\b",
            r"\bexclusive new covers?\b",
            r"\bcover art\b", r"\bcase cover art\b",
            r"\bexclusive illustrated hardcover\b",
            r"\bexclusive hardcover illustration\b",
            r"\bhardcover illustration\b",
            r"\billustrated hardcover\b",
            r"\bprinted hardcover case\b",
            r"\bhardcover case art\b",
            r"\bexclusive cover illustrated\b",
            r"\bexclusive re.designed covers?\b",
            r"\bcover variant\b", r"\bexclusive cover variant\b",
            r"\bexclusive illustrated case\b",
            r"\bexclusive case illustration\b",
            r"\bexclusive cover change\b",
            r"\bcover design\b",
            r"\boverall cover design\b",
            r"\boverall book design\b",
            r"\boverall jacket design\b",
            r"\bthe hardcov\w+ design\b",
            r"\bexclusive case design\b",
            r"\bexclusive\s+cover\s+design\b",
            r"\boverall design\b",
        ],
        # Exclude original/trade covers
        [r"\boriginal\b", r"\btrade cover\b", r"\bfrom the publisher\b",
         r"\bUK trade\b"]
    ),
    (
        "original_cover",
        "Original/Trade Cover",
        "cover",
        [
            r"\boriginal cover\b", r"\boriginal covers\b",
            r"\btrade cover\b",
            r"\bfrom the publisher\b", r"\bUK trade cover\b",
            r"\boriginal trade cover\b",
            r"\bpublisher.{0,5}cover\b",
            r"\boriginal.{3,30}covers?\b",  # "original Tommy Arnold covers"
        ],
        []
    ),
    (
        "cover_recolour",
        "Cover Recolour",
        "cover",
        [
            r"\bcover recolour\b", r"\bcover re.colour\b",
            r"\brecoloured cover\b", r"\brecoloured jacket\b",
            r"\bcolourway.{0,10}cover\b",
            r"\bexclusive recolour jacket\b",
            r"\bcolourway change\b",
            r"\bbespoke re.colour cover\b",
            r"\bbespoke re.colour jacket\b",
            r"\bexclusive colourway cover\b",
            r"\bexclusive colourway\b",
            r"\bcolourway cover variant\b",
            r"\bbespoke exclusive re.colour cover\b",
        ],
        []
    ),
    (
        "dust_jacket",
        "Dust Jacket",
        "cover",
        [
            r"\bdust jackets?\b", r"\bdustjackets?\b",
            r"\bjacket design\b", r"\boverall jacket design\b",
            r"\bwraparound cover\b", r"\bexclusive redesigned jackets?\b",
            r"\bjacket illustration\b", r"\badd.on dust jackets?\b",
            r"\balternative dust jacket\b", r"\balternate dust jacket\b",
            r"\bcomplete redesigned jacket\b",
            r"\bbespoke jacket exclusive\b",
            r"\bbespoke jacket\b",
            r"\bjacket arts?\b",
            r"\bjacket with a colourway\b",
            r"\bexclusive jacket\b",
            r"\bredesigned jacket\b",
        ],
        []
    ),
    (
        "reversible_dust_jacket",
        "Reversible Dust Jacket",
        "cover",
        [
            r"\breversible dust jacket\b", r"\breversible dustjacket\b",
            r"\breverse dust jacket\b", r"\breverse of the dust jacket\b",
            r"\bREVERSIBLE DUST JACKET\b",
        ],
        []
    ),
    (
        "reversible_dust_jacket_colourway",
        "Reversible DJ — Colourway of Trade Cover",
        "cover",
        [
            r"\bcolou?r variation of the trade cover\b",
            r"\bcolou?rway variation of the trade cover\b",
            r"\bcolou?rway variation of the trade\b",
            r"\bcolou?r variant of the trade cover\b",
            r"\bcolou?rway of the trade cover\b",
            r"\btext colou?r variation of the trade\b",
            r"\btext colou?rway variation of the trade\b",
            r"\balternative colou?r.way of the trade cover\b",
            r"\bshade variation of the trade cover\b",
            r"\bfeaturing the trade cover\b",
            r"\balternative text colou?r\b",
        ],
        []
    ),
    (
        "uv_spot",
        "UV Spot / Gloss",
        "cover",
        [
            r"\buv spot\b", r"\bspot uv\b", r"\bspot gloss\b",
            r"\bspot.?glossed\b", r"\bhigh.?gloss\b",
        ],
        []
    ),
    (
        "die_cut",
        "Die Cut",
        "cover",
        [
            r"\bdie cut\b", r"\bdiecut\b",
            r"\bcut out.{0,5}front cover\b",
            r"\bcut out.{0,5}cover\b",
        ],
        []
    ),
    (
        "cover_typography",
        "Cover Typography",
        "cover",
        [
            r"\bcover typography\b",
            r"\btypography.{0,5}cover\b",
            r"\btypography\b",
            r"\bcustom typography\b",
        ],
        []
    ),

    # ── GROUP: binding ─────────────────────────────────────
    (
        "foil",
        "Foil",
        "cover",
        [
            r"\bfoil\b", r"\bfoiling\b", r"\bfoiled\b",
            r"\bembossing\b", r"\bembossed\b",
        ],
        # Exclude edge-foil entries to avoid confusion with foiled_edges
        [r"\bgilded edges\b", r"\bfoiled edges\b",
         r"\bholographic edges\b"]
    ),
    (
        "endpapers",
        "Endpapers",
        "interior",
        [
            r"\bendpapers?\b", r"\bend paper\b", r"\bend papers\b",
            r"\bend pages?\b", r"\bendpages\b",
        ],
        []
    ),
    (
        "matching_spine",
        "Matching Spine",
        "binding",
        [
            r"\bmatching spine\b", r"\bmatching spines\b",
            r"\bnew spine design\b",
            r"\bquote on the spine\b", r"\bquotes on the spine\b",
            r"\bimitation quarter.?bound spine\b",
            r"\bacross all.{0,10}spines?\b",
        ],
        []
    ),
    (
        "slipcase",
        "Slipcase",
        "binding",
        [r"\bslipcase\b"],
        []
    ),
    (
        "hardback",
        "Hardback/Hardcover",
        "format",
        [
            r"\bhardback\b", r"\bhardcover\b",
            r"\bnaked hardback\b", r"\bnaked hardcover\b",
            r"\bhardcase\b",
        ],
        []
    ),
    (
        "paper_quality",
        "Paper Quality",
        "binding",
        [
            r"\bFSC paper\b", r"\bacid free\b", r"\bMasterblank\b",
            r"\bMunken\b", r"\b100gsm\b", r"\bgsm.{0,5}paper\b",
            r"\bacid.free paper\b", r"\bprinted on.{0,30}paper\b",
        ],
        []
    ),
    (
        "head_tail_bands",
        "Head & Tail Bands",
        "binding",
        [
            r"\bhead and tail bands?\b", r"\bhead & tail bands?\b",
            r"\bhead.tail bands?\b",
        ],
        []
    ),
    (
        "smyth_sewn",
        "Smyth Sewn Binding",
        "binding",
        [r"\bsmyth sewn\b"],
        []
    ),

    # ── GROUP: extras ──────────────────────────────────────
    (
        "author_letter",
        "Author Letter",
        "extras",
        [
            r"\bauthor letters?\b", r"\bletter from the author\b",
            r"\bbound.?in letters?\b", r"\bbound in letters?\b",
            r"\binbound letter\b", r"\bletter written by the author\b",
            r"\bbound author letters?\b",
            r"\bbound-in author letters?\b", r"\bbound in author letters?\b",
            r"\bauthorletter\b", r"\bhandwritten letter\b",
        ],
        []
    ),
    (
        "overlay",
        "Overlay",
        "extras",
        [
            r"\boverlay\b", r"\boverlays\b",
            r"\bvellum overlay\b", r"\bbound vellum\b",
            r"\bvellum bound\b", r"\bvellum insert\b",
            r"\bvelum bound\b",  # typo variant
            r"\bbound NSFW vellum\b", r"\bbound spicy vellum\b",
            r"\bset of.{0,5}page overlays\b",
            r"\bTHREE illustrated overlays\b",
            r"\bFOUR illustrated overlays\b",
            r"\bbound overlay\b",
        ],
        []
    ),
    (
        "ribbon",
        "Ribbon Bookmark",
        "extras",
        [
            r"\bribbon bookmark\b", r"\bribbon marker\b",
            r"\bribbon markers\b", r"\bribbon bookmarks\b",
            r"\bprinted ribbon\b",
        ],
        []
    ),
    (
        "sticker",
        "Sticker",
        "extras",
        [r"\bstickers?\b"],
        []
    ),
    (
        "art_print",
        "Art Print",
        "extras",
        [
            r"\bart print\b", r"\b5x7 art print\b",
            r"\bspicy art print\b", r"\bNSFW.{0,5}art print\b",
            r"\bbonus art print\b", r"\bSPICY.{0,5}art print\b",
            r"\bSPICY 5x7\b",
        ],
        []
    ),
    (
        "bookmark",
        "Bookmark (non-ribbon)",
        "extras",
        [
            r"\bbookmark\b",
        ],
        [r"\bribbon bookmark\b"]
    ),
    (
        "bonus_content",
        "Bonus Content",
        "extras",
        [
            r"\bbonus content\b", r"\bbonus chapters?\b",
            r"\bbonus scenes?\b", r"\bbonus material\b",
            r"\bexclusive bonus\b", r"\bbonus epilogue\b",
            r"\bdeleted scenes?\b", r"\bshort story\b",
            r"\bexclusive deleted\b",
            r"\bexclusive scenes?\b", r"\bexclusive extended edition\b",
            r"\bbonus reading material\b",
            r"\bexclusive bonus chapter\b",
            r"\bforeword from the author\b",
            r"\bnote from the author\b",
            r"\bletter written by the author\b",
            r"\bPOV bonus\b", r"\bbonus POV\b",
            r"\bbound.?in bonus materials?\b",
            r"\bfirst chapter of\b",
        ],
        []
    ),
    (
        "numbered",
        "Numbered",
        "extras",
        [
            r"\bnumbered\b", r"\beach copy will be numbered\b",
        ],
        []
    ),
    (
        "limited",
        "Limited Edition",
        "extras",
        [
            r"\blimited edition\b",
            r"\blimited\b",
            r"\b\d[,\d]+ copies\b",
        ],
        [r"\bnumbered\b"]  # numbered is its own category
    ),
    (
        "proofreading",
        "Proofreading",
        "extras",
        [r"\bproofreading\b"],
        []
    ),

    # ── GROUP: interior ────────────────────────────────────
    (
        "interior_art",
        "Interior Art",
        "interior",
        [
            r"\binterior art\b", r"\bcharacter arts?\b",
            r"\bcharacter artwork\b", r"\bcharacter illustration\b",
            r"\bchapter header art\b", r"\bchapter headers\b",
            r"\bmap artwork\b", r"\bmap art\b",
            r"\bfull colou?r arts?\b",
            r"\bfull colou?r artwork\b",
            r"\billustrated pages\b", r"\billustrations\b",
            r"\billustration\b",
            r"\btipped.?in artwork\b",
            r"\bexclusive tip in page design\b",
            r"\billustrator\b",
            r"\bfull art\b",
        ],
        [r"\bhidden illustration\b", r"\bon the hardcover\b", r"\bon the hardback\b"]
    ),
    (
        "interior_formatting",
        "Interior Formatting",
        "interior",
        [
            r"\binterior formatting\b", r"\bformatting\b",
            r"\bchapter header\b", r"\btwo.colour printing\b",
            r"\bfull colour printing\b",
            r"\btwo.colored printing\b",
        ],
        [r"\bon the hardback\b"]
    ),

    # ── GROUP: format ──────────────────────────────────────
    (
        "format_b",
        "B Format",
        "format",
        [r"\bB[\-\s]?\s*format\b"],
        []
    ),
    (
        "format_royal",
        "Royal Format",
        "format",
        [r"\broyal format\b", r"\broyal hardback\b", r"\broyal size\b",
         r"\broyal hardbacks\b"],
        []
    ),
    (
        "format_demy",
        "Demy Format",
        "format",
        [
            r"\bdemy\b",
            r"\bbook size\b",
            r"5\s*[⅜⅝].{0,5}[x×]\s*8\s*[¼½]",  # 5 3/8" x 8 1/4" ≈ Demy
        ],
        []
    ),
    (
        "paperback",
        "Paperback",
        "format",
        [r"\bpaperback\b"],
        []
    ),
]

# ──────────────────────────────────────────────────────────────────────────────
# MATCHING LOGIC
# ──────────────────────────────────────────────────────────────────────────────

def categorize(raw_value: str) -> list[str]:
    """Return list of matching category slugs for a raw value."""
    v = raw_value.lower()
    result = []
    for slug, _label, _group, include_pats, exclude_pats in CATEGORIES:
        # Check excludes first
        excluded = any(re.search(p, v, re.IGNORECASE) for p in exclude_pats)
        if excluded:
            continue
        matched = any(re.search(p, v, re.IGNORECASE) for p in include_pats)
        if matched:
            result.append(slug)
    return result


# ──────────────────────────────────────────────────────────────────────────────
# DB FETCH
# ──────────────────────────────────────────────────────────────────────────────

def fetch_data():
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()

    # features[] — unnest
    cur.execute("""
        SELECT lower(trim(f)) as val, count(*)::int as cnt
        FROM book_editions, unnest(features) f
        WHERE f IS NOT NULL AND trim(f) <> ''
        GROUP BY lower(trim(f))
        ORDER BY cnt DESC
    """)
    features = {row[0]: ("f", row[1]) for row in cur.fetchall()}

    # artist_contributions.role
    cur.execute("""
        SELECT lower(trim(role)) as val, count(*)::int as cnt
        FROM artist_contributions
        WHERE role IS NOT NULL AND trim(role) <> ''
        GROUP BY lower(trim(role))
        ORDER BY cnt DESC
    """)
    artist = {row[0]: ("a", row[1]) for row in cur.fetchall()}

    cur.close()
    conn.close()

    # Merge, track source
    # If same value in both, source = "+a" (both), keep max cnt
    all_values = {}
    for val, (src, cnt) in features.items():
        all_values[val] = {"src": src, "cnt": cnt, "raw": val}
    for val, (src, cnt) in artist.items():
        if val in all_values:
            existing = all_values[val]
            existing["src"] = "+a"  # in both
            existing["cnt"] = max(existing["cnt"], cnt)
        else:
            all_values[val] = {"src": src, "cnt": cnt, "raw": val}

    return all_values


# ──────────────────────────────────────────────────────────────────────────────
# GENERATE MARKDOWN
# ──────────────────────────────────────────────────────────────────────────────

SRC_ICON = {"f": "📖", "a": "🎨", "+a": "📖🎨"}

def generate():
    print("Fetching data from DB...")
    all_values = fetch_data()
    print(f"  Total unique values: {len(all_values)}")

    # Categorize each value
    categorized = {}   # slug → list of (cnt, src, raw)
    uncategorized = []

    for val, meta in all_values.items():
        cats = categorize(val)
        if cats:
            for cat in cats:
                categorized.setdefault(cat, [])
                categorized[cat].append((meta["cnt"], meta["src"], meta["raw"], cats))
        else:
            uncategorized.append((meta["cnt"], meta["src"], meta["raw"]))

    # Sort each category by cnt desc
    for slug in categorized:
        categorized[slug].sort(key=lambda x: -x[0])
    uncategorized.sort(key=lambda x: -x[0])

    # Build group → categories mapping (preserve definition order)
    groups = {}
    slug_to_meta = {s: (l, g) for s, l, g, _, _ in CATEGORIES}
    for slug, label, group, _, _ in CATEGORIES:
        groups.setdefault(group, [])
        if slug not in [s for s, _ in groups[group]]:
            groups[group].append((slug, label))

    lines = []
    lines.append("# LuxGrimoire — Feature Categories: Weryfikacja v2")
    lines.append(f"*Wygenerowano: {datetime.now().strftime('%Y-%m-%d %H:%M')} | Baza: luxgrimoire_prodsnap*")
    lines.append("")
    lines.append("**Zmiany vs v1:** `edges_digital` usunięty (→ `edges_printed`) | `cover_art`+`cover_design` → `redesigned_cover` | Nowe: `original_cover`, `art_print`, `bookmark`, `foiled_edges`, `foredge_design`, `continuous_edge_design`, `limited`, `paper_quality`, `die_cut`, `author_signature_page`, `autopen_signature`, `stamped_signature`, `cover_typography`, `proofreading`")
    lines.append("")
    lines.append("**Legenda:** Cnt = wystąpienia | 📖=features[] 🎨=artist_contributions 📖🎨=oba | *(multi)* = wiele kategorii")
    lines.append("")

    total_categorized = sum(len(v) for v in categorized.values())
    lines.append(f"**Statystyki:** {len(all_values)} unikalnych wartości | {total_categorized} przypisań do kategorii | {len(uncategorized)} niesklasyfikowanych")
    lines.append("")

    for group, cat_list in groups.items():
        lines.append(f"---")
        lines.append(f"")
        lines.append(f"## Grupa: `{group}`")
        lines.append("")

        for slug, label in cat_list:
            entries = categorized.get(slug, [])
            if not entries:
                continue

            lines.append(f"### `{slug}` — {label} ({len(entries)} wartości)")
            lines.append("")
            lines.append("| Cnt | Src | RawValue | Kategorie |")
            lines.append("|----:|:---:|----------|:----------|")

            for cnt, src, raw, cats in entries:
                icon = SRC_ICON.get(src, src)
                multi_note = ""
                if len(cats) > 1:
                    others = [c for c in cats if c != slug]
                    multi_note = f" *(+{', '.join(others)})*"
                lines.append(f"| {cnt} | {icon} | {raw}{multi_note} | |")

            lines.append("")

    # Uncategorized section
    lines.append("---")
    lines.append("")
    lines.append(f"## ❓ NIESKLASYFIKOWANE ({len(uncategorized)} wartości)")
    lines.append("")
    lines.append("| Cnt | Src | RawValue | Sugerowana kategoria |")
    lines.append("|----:|:---:|----------|---------------------|")
    for cnt, src, raw in uncategorized:
        icon = SRC_ICON.get(src, src)
        lines.append(f"| {cnt} | {icon} | {raw} | |")

    output_path = r"C:\Users\renat\Desktop\luxgrimoire-feature-categories-v2.md"
    with open(output_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    print(f"\nWygenerowano: {output_path}")
    print(f"  Niesklasyfikowane: {len(uncategorized)}")
    print(f"  Kategorie z wartosciami: {sum(1 for v in categorized.values() if v)}")

    # Print stats per category
    print("\nStatystyki per kategoria:")
    for slug, label, group, _, _ in CATEGORIES:
        cnt = len(categorized.get(slug, []))
        if cnt > 0:
            print(f"  [{group}] {slug}: {cnt} wartosci")

if __name__ == "__main__":
    generate()
