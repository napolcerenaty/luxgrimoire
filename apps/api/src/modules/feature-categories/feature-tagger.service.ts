import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

interface CategoryRule {
  id: string;
  slug: string;
  label: string;
  group: string;
  includePatterns: RegExp[];
  excludePatterns: RegExp[];
}

/**
 * Loads active FeatureCategory rules from DB and matches raw feature strings
 * to category slugs. Used by the AI pipeline and future batch-tagging scripts.
 */
@Injectable()
export class FeatureTaggerService {
  private readonly logger = new Logger(FeatureTaggerService.name);
  private rules: CategoryRule[] | null = null;
  private lastLoaded = 0;
  private readonly TTL_MS = 60_000; // refresh rules every 60 s

  constructor(private readonly prisma: PrismaService) {}

  private async loadRules(): Promise<CategoryRule[]> {
    const now = Date.now();
    if (this.rules && now - this.lastLoaded < this.TTL_MS) return this.rules;

    const rows = await this.prisma.featureCategory.findMany({
      where: { isActive: true },
      orderBy: [{ group: 'asc' }, { sortOrder: 'asc' }],
    });

    this.rules = rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      label: row.label,
      group: row.group,
      includePatterns: ((row.includePatterns as string[]) ?? []).map(
        (p) => new RegExp(p, 'i'),
      ),
      excludePatterns: ((row.excludePatterns as string[]) ?? []).map(
        (p) => new RegExp(p, 'i'),
      ),
    }));
    this.lastLoaded = now;
    return this.rules;
  }

  /**
   * Given a raw feature string, returns matching category slugs.
   */
  async categorize(rawValue: string): Promise<string[]> {
    const rules = await this.loadRules();
    if (rules.length === 0) return [];

    const matched: string[] = [];
    const v = rawValue.toLowerCase();

    for (const rule of rules) {
      if (rule.excludePatterns.some((re) => re.test(v))) continue;
      if (rule.includePatterns.some((re) => re.test(v))) {
        matched.push(rule.slug);
      }
    }
    return matched;
  }

  /**
   * Categorize a list of feature strings. Returns a map of rawValue → slugs[].
   */
  async categorizeMany(rawValues: string[]): Promise<Record<string, string[]>> {
    const rules = await this.loadRules();
    if (rules.length === 0) return {};

    const result: Record<string, string[]> = {};
    for (const rawValue of rawValues) {
      const v = rawValue.toLowerCase();
      const matched: string[] = [];
      for (const rule of rules) {
        if (rule.excludePatterns.some((re) => re.test(v))) continue;
        if (rule.includePatterns.some((re) => re.test(v))) {
          matched.push(rule.slug);
        }
      }
      result[rawValue] = matched;
    }
    return result;
  }

  /**
   * Re-tags a single edition: deletes all existing feature tags for the edition
   * and reinserts based on current patterns.
   * @param editionId UUID of the edition
   * @param features edition.features[] array
   * @param artistEntries artist contribution entries for this edition
   */
  async retagEdition(
    editionId: string,
    features: string[],
    artistEntries: { role: string; artistId: string; artistName?: string | null }[],
  ): Promise<void> {
    const rules = await this.loadRules();
    if (rules.length === 0) {
      this.logger.warn('No active feature categories — skipping retag');
      return;
    }

    const toInsert: {
      editionId: string;
      categoryId: string;
      rawValue: string;
      artistId: string | null;
      artistName: string | null;
      source: string;
    }[] = [];

    const tagValue = (
      rawValue: string,
      source: string,
      artistId: string | null,
      artistName: string | null,
    ) => {
      const trimmedValue = rawValue.trim();
      const v = trimmedValue.toLowerCase();
      if (!v) return;
      for (const rule of rules) {
        if (rule.excludePatterns.some((re) => re.test(v))) continue;
        if (rule.includePatterns.some((re) => re.test(v))) {
          toInsert.push({
            editionId,
            categoryId: rule.id,
            rawValue: trimmedValue,
            artistId,
            artistName,
            source,
          });
        }
      }
    };

    for (const feature of features) tagValue(feature, 'features', null, null);
    for (const entry of artistEntries) {
      tagValue(entry.role, 'artist', entry.artistId, entry.artistName ?? null);
    }

    // Deduplicate by categoryId — one row per edition per category.
    // Prefer artist-derived tags so public artist reads stay available from feature tags.
    const deduped = new Map<string, (typeof toInsert)[0]>();
    for (const row of toInsert) {
      const existing = deduped.get(row.categoryId);
      if (!existing) {
        deduped.set(row.categoryId, row);
      } else if (row.source === 'artist' && existing.source === 'features') {
        deduped.set(row.categoryId, row);
      }
    }
    const unique = Array.from(deduped.values());

    await this.prisma.$transaction([
      // Only delete auto-detected tags; preserve isManual=true entries
      this.prisma.editionFeatureTag.deleteMany({
        where: { editionId, isManual: false },
      }),
      ...unique.map((r) =>
        this.prisma.editionFeatureTag.create({ data: r }),
      ),
    ]);

    this.logger.debug(
      `Retagged edition ${editionId}: ${unique.length} tags from ${features.length} features + ${artistEntries.length} artist roles`,
    );
  }

  /** Force-invalidate the in-memory rule cache (call after category CRUD). */
  invalidateCache() {
    this.rules = null;
    this.lastLoaded = 0;
    this.logger.debug('FeatureTagger cache invalidated');
  }
}
