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

  async retagEdition(
    editionId: string,
    features: string[],
  ): Promise<void> {
    const rules = await this.loadRules();
    if (rules.length === 0) {
      this.logger.warn('No active feature categories — skipping retag');
      return;
    }

    const matchCategories = (rawValue: string): string[] => {
      const v = rawValue.trim().toLowerCase();
      if (!v) return [];
      return rules
        .filter((r) => !r.excludePatterns.some((re) => re.test(v)) && r.includePatterns.some((re) => re.test(v)))
        .map((r) => r.slug);
    };

    const rows: Array<{ editionId: string; rawValue: string; categories: string[] }> = [];
    for (const feature of features) {
      const rv = feature.trim();
      if (!rv) continue;
      rows.push({ editionId, rawValue: rv, categories: matchCategories(rv) });
    }

    await this.prisma.$transaction([
      this.prisma.editionFeatureTag.deleteMany({ where: { editionId, isManual: false } }),
      ...rows.map((r) => this.prisma.editionFeatureTag.create({ data: r })),
    ]);

    this.logger.debug(`Retagged edition ${editionId}: ${rows.length} feature tags`);
  }

  /** Force-invalidate the in-memory rule cache (call after category CRUD). */
  invalidateCache() {
    this.rules = null;
    this.lastLoaded = 0;
    this.logger.debug('FeatureTagger cache invalidated');
  }
}
