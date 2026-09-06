export function run(args: string[]): Promise<unknown>;
export function guardDatabase(url?: string): string;
export function instrument(
  database: unknown,
  options?: { aggregate?: boolean },
): {
  reset(): void;
  pause(): void;
  get(): Array<{ sql: string; records?: unknown }>;
  getPoolWaits(): number[];
};
export function stats(values: number[]): {
  p50: number;
  p95: number;
  min: number;
  max: number;
};
