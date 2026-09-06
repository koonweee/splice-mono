/** Dedicated PostgreSQL benchmark entry point; see docs/backend-query-performance.md. */
import { run } from '../test/performance/benchmark-runner.cjs';

void run(process.argv.slice(2)).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Benchmark failed');
  process.exitCode = 1;
});
