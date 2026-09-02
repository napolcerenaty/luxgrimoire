/** Normalizes a title, author name, or series name for loose duplicate-detection only (never
 * stored) — same idea as BookSeriesService's normalizeSeriesName (including stripping every
 * standalone "the"/"a"/"an", not just a leading one — see that function's docblock for why), but
 * for comparing external-API strings against what we already have, where punctuation/subtitle
 * differences are common.
 *
 * "&" is folded to "and" before the generic punctuation strip below would otherwise just erase
 * it — unlike "the"/"a"/"an", it's meaningful ("Fire and Blood" needs it to not become "Fire
 * Blood"), so "X & Y" and "X and Y" need to end up equal, not both losing the word entirely.
 *
 * Shared between series-discovery.service.ts (title/author matching) and
 * clients/open-library.client.ts (comparing OL's own "Series:<slug>" subject tag against the
 * series being checked) — kept in its own file rather than exported from the service so the
 * client doesn't have to import from the module that imports it (circular import). */
export function normalizeForMatch(title: string): string {
  return title
    .normalize('NFKC')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\b(the|an?)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
