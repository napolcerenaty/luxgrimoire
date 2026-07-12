import { IsString, IsIn, IsOptional, IsNumberString } from 'class-validator';

export const SUPPORTED_EVENT_TYPES = [
  { id: 'edition_view',          label: 'Edition Views',                  defaultGroupBy: 'entity' },
  { id: 'book_view',             label: 'Book Views',                     defaultGroupBy: 'entity' },
  { id: 'author_view',           label: 'Author Views',                   defaultGroupBy: 'entity' },
  { id: 'artist_view',           label: 'Artist Views',                   defaultGroupBy: 'entity' },
  { id: 'company_view',          label: 'Company Views',                  defaultGroupBy: 'entity' },
  { id: 'series_view',           label: 'Series Views',                   defaultGroupBy: 'entity' },
  { id: 'collection_add',        label: 'Collection Additions',           defaultGroupBy: 'entity' },
  { id: 'collection_remove',     label: 'Collection Removals',            defaultGroupBy: 'entity' },
  { id: 'collection_status',     label: 'Ownership Status Changes',       defaultGroupBy: 'value'  },
  { id: 'wishlist_add',          label: 'Wishlist Additions',             defaultGroupBy: 'entity' },
  { id: 'book_status_change',    label: 'Reading Status Changes',         defaultGroupBy: 'value'  },
  { id: 'subscription_view',     label: 'Subscription Views',             defaultGroupBy: 'entity' },
  { id: 'subscription_join',     label: 'Subscription Joins',             defaultGroupBy: 'entity' },
  { id: 'subscription_cancel',   label: 'Subscription Cancellations',     defaultGroupBy: 'entity' },
  { id: 'subscription_delete',   label: 'Subscription Deletions',         defaultGroupBy: 'entity' },
  { id: 'subscription_backfill', label: 'Subscription Backfills',         defaultGroupBy: 'entity' },
  { id: 'waitlist_join',         label: 'Waitlist Joins',                 defaultGroupBy: 'entity' },
  { id: 'waitlist_leave',        label: 'Waitlist Leaves',                defaultGroupBy: 'entity' },
  { id: 'mark_as_sold',          label: 'Marked as Sold',                 defaultGroupBy: 'value'  },
  { id: 'tracking_add',          label: 'Tracking Numbers Added',         defaultGroupBy: 'entity' },
  { id: 'tracking_click',        label: 'Package Tracking Clicks',        defaultGroupBy: 'entity' },
  { id: 'blog_view',             label: 'Blog Page Views',                defaultGroupBy: 'day'    },
  { id: 'blog_post_view',        label: 'Blog Post Views',                defaultGroupBy: 'entity' },
] as const;

export type SupportedGroupBy = 'entity' | 'value' | 'user' | 'day' | 'month';
export type SupportedPeriod = '7' | '30' | '90' | '365' | 'all';

export class AnalyticsQueryDto {
  @IsString()
  metric!: string;

  @IsIn(['entity', 'value', 'user', 'day', 'month'])
  groupBy!: SupportedGroupBy;

  @IsIn(['7', '30', '90', '365', 'all'])
  period!: SupportedPeriod;

  @IsNumberString()
  @IsOptional()
  limit?: string;
}
