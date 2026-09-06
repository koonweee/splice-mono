import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from './benchmark-runner.cjs';

// Explicit URL opt-in, guarded again before initialize/create/drop in the runner.
const suite = process.env.BACKEND_BENCHMARK_DATABASE_URL
  ? describe
  : describe.skip;

suite('backend benchmark on real PostgreSQL migrations', () => {
  it('seeds an isolated schema, calls the actual service, and records query plans', async () => {
    const output = mkdtempSync(join(tmpdir(), 'splice-benchmark-test-'));
    const OriginalDate = Date;
    try {
      await run([
        'capture',
        '--variant',
        'before',
        '--samples',
        '1',
        '--warmups',
        '0',
        '--no-transports',
        '--filter',
        'transactions.date-filter',
        '--output',
        output,
      ]);
      const report = JSON.parse(
        readFileSync(join(output, 'before-10000-run1.json'), 'utf8'),
      );
      expect(report.completed).toBe(true);
      expect(report.schema.migrations.length).toBeGreaterThan(30);
      expect(report.scenarios).toHaveLength(1);
      expect(report.scenarios[0].raw[0].sqlCount).toBeGreaterThan(0);
      expect(report.plans['transactions.date-filter'].length).toBeGreaterThan(
        0,
      );
      expect(report.environment.cache).toContain('database-warm');
    } finally {
      global.Date = OriginalDate;
      rmSync(output, { recursive: true, force: true });
    }
  }, 120_000);
});
