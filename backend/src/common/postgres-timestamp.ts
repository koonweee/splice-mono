/**
 * PostgreSQL `timestamp without time zone` values in Splice are stored as UTC.
 * node-postgres otherwise interprets them in the backend process's local time,
 * which can make API timestamps appear hours in the future during local dev.
 */
export function parsePostgresUtcTimestamp(value: string): Date {
  return new Date(`${value.replace(' ', 'T')}Z`);
}
