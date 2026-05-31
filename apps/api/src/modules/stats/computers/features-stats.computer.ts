import { Injectable } from '@nestjs/common';
import { StatsComputer, StatsComputeResult } from '../stats.computer';
import type { StatsContext } from '../stats.context';
import { FeatureCategoriesService } from '../../feature-categories/feature-categories.service';

@Injectable()
export class FeaturesStatsComputer extends StatsComputer {
  readonly key = 'features';
  readonly version = 1;

  constructor(private readonly featureCategoriesService: FeatureCategoriesService) {
    super();
  }

  async compute(ctx: StatsContext): Promise<StatsComputeResult> {
    const { entries } = ctx;
    const categories = await this.featureCategoriesService.findAll();
    const catMap = new Map(
      categories.map((category) => [category.slug, { label: category.label, group: category.group }]),
    );

    const categoryCountMap: Record<string, number> = {};
    let booksWithAnyFeature = 0;
    let totalBooks = 0;

    for (const entry of entries) {
      if (entry.isWishlist) continue;
      totalBooks++;

      const featureTags = entry.edition?.featureTags ?? [];
      const entryCategories = new Set<string>();

      for (const tag of featureTags) {
        const cats = tag.categories ?? [];
        for (const slug of cats) {
          entryCategories.add(slug);
        }
      }

      if (entryCategories.size > 0) booksWithAnyFeature++;
      for (const slug of entryCategories) {
        categoryCountMap[slug] = (categoryCountMap[slug] ?? 0) + 1;
      }
    }

    const byCategory = Object.entries(categoryCountMap)
      .map(([slug, count]) => {
        const category = catMap.get(slug);
        return {
          slug,
          label: category?.label ?? slug,
          group: category?.group ?? 'other',
          count,
          percent: totalBooks > 0 ? Math.round((count / totalBooks) * 1000) / 10 : 0,
        };
      })
      .sort((a, b) => b.count - a.count);

    const byGroup: Record<string, Array<{ slug: string; label: string; count: number; percent: number }>> = {};
    for (const item of byCategory) {
      if (!byGroup[item.group]) byGroup[item.group] = [];
      byGroup[item.group].push({
        slug: item.slug,
        label: item.label,
        count: item.count,
        percent: item.percent,
      });
    }

    return {
      totalBooksAnalyzed: totalBooks,
      booksWithAnyFeature,
      booksWithAnyFeaturePercent: totalBooks > 0 ? Math.round((booksWithAnyFeature / totalBooks) * 1000) / 10 : 0,
      byCategory,
      byGroup,
    };
  }
}
