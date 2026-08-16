import { parsePostgresUtcTimestamp } from '../../src/common/postgres-timestamp';

describe('parsePostgresUtcTimestamp', () => {
  it('treats timestamp-without-time-zone values as UTC', () => {
    expect(
      parsePostgresUtcTimestamp('2026-08-16 18:47:53.325').toISOString(),
    ).toBe('2026-08-16T18:47:53.325Z');
  });
});
