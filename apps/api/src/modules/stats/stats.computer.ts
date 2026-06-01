import type { LightStatsContext, StatsContext } from './stats.context';

export interface StatsComputeResult {
  [key: string]: unknown;
}

export abstract class StatsComputer {
  abstract readonly key: string;
  abstract readonly version: number;
  abstract compute(ctx: StatsContext | LightStatsContext): Promise<StatsComputeResult>;
}
