import { IsString, IsIn, IsOptional, IsNumberString } from 'class-validator';

export const SUPPORTED_EVENT_TYPES = [
  { id: 'edition_view', label: 'Edition Views', defaultGroupBy: 'entity' },
  { id: 'collection_add', label: 'Collection Additions', defaultGroupBy: 'entity' },
  { id: 'wishlist_add', label: 'Wishlist Additions', defaultGroupBy: 'entity' },
  { id: 'book_status_change', label: 'Reading Status Changes', defaultGroupBy: 'value' },
  { id: 'subscription_view', label: 'Subscription Views', defaultGroupBy: 'entity' },
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
