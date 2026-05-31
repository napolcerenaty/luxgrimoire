export interface StatsComputeResult {
  [key: string]: unknown;
}

export abstract class StatsComputer {
  abstract readonly key: string;
  abstract readonly version: number;
  abstract compute(ctx: import('./stats.context').StatsContext): Promise<StatsComputeResult>;
}
