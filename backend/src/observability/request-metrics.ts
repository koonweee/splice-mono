import { AsyncLocalStorage } from 'node:async_hooks';
import { performance } from 'node:perf_hooks';
import type { DataSource, QueryRunner } from 'typeorm';

export type RequestMetrics = {
  elapsedMs: number;
  sqlCount: number;
  sqlMs: number;
  sqlErrors: number;
  returnedRows: number;
  connectionAcquisitions: number;
  connectionAcquireMs: number;
  connectionErrors: number;
  jsonSerializationAndSendMs: number | null;
  responseBytes: number | null;
  errors: number;
};

const requestMetrics = new AsyncLocalStorage<RequestMetrics>();
const instrumented = new WeakSet<DataSource>();

export function snapshotRequestMetrics(): RequestMetrics | undefined {
  const metrics = requestMetrics.getStore();
  return metrics ? { ...metrics } : undefined;
}

export function recordJsonSerializationAndSend(milliseconds: number): void {
  const metrics = requestMetrics.getStore();
  if (metrics)
    metrics.jsonSerializationAndSendMs =
      (metrics.jsonSerializationAndSendMs ?? 0) + milliseconds;
}

export function recordResponseBytes(bytes: number | null): void {
  const metrics = requestMetrics.getStore();
  if (metrics) metrics.responseBytes = bytes;
}

/** Contains counters only: no identity, SQL text, parameters, or response data. */
export async function runWithRequestMetrics<T>(
  work: () => Promise<T>,
  complete?: (metrics: RequestMetrics) => void,
): Promise<T> {
  const metrics: RequestMetrics = {
    elapsedMs: 0,
    sqlCount: 0,
    sqlMs: 0,
    sqlErrors: 0,
    returnedRows: 0,
    connectionAcquisitions: 0,
    connectionAcquireMs: 0,
    connectionErrors: 0,
    jsonSerializationAndSendMs: null,
    responseBytes: null,
    errors: 0,
  };
  return requestMetrics.run(metrics, async () => {
    const started = performance.now();
    try {
      return await work();
    } catch (error) {
      metrics.errors++;
      throw error;
    } finally {
      metrics.elapsedMs = performance.now() - started;
      complete?.({ ...metrics });
    }
  });
}

/** Query time excludes connection acquisition (pool wait plus connection setup). */
export function installDatabaseMetrics(database: DataSource): void {
  if (instrumented.has(database)) return;
  instrumented.add(database);
  const createQueryRunner = database.createQueryRunner.bind(
    database,
  ) as DataSource['createQueryRunner'];
  database.createQueryRunner = (...args) => {
    const runner = createQueryRunner(...args);
    const connect = runner.connect.bind(runner) as () => Promise<unknown>;
    let connection: Promise<unknown> | undefined;
    runner.connect = () => {
      if (connection) return connection;
      const metrics = requestMetrics.getStore();
      const started = performance.now();
      if (metrics) metrics.connectionAcquisitions++;
      connection = connect()
        .catch((error: unknown) => {
          connection = undefined;
          if (metrics) metrics.connectionErrors++;
          throw error;
        })
        .finally(() => {
          if (metrics)
            metrics.connectionAcquireMs += performance.now() - started;
        });
      return connection;
    };
    const query = runner.query.bind(runner) as (
      sql: string,
      parameters?: unknown[],
      structured?: boolean,
    ) => Promise<unknown>;
    runner.query = (async (
      sql: string,
      parameters?: unknown[],
      structured?: boolean,
    ) => {
      // Acquiring first lets the SQL timer exclude time spent waiting for a pool slot.
      await runner.connect();
      const metrics = requestMetrics.getStore();
      const started = performance.now();
      if (metrics) metrics.sqlCount++;
      try {
        const result = await query(sql, parameters, structured);
        if (metrics) {
          if (Array.isArray(result)) {
            // PostgreSQL non-SELECT raw results can be [records, affectedCount].
            metrics.returnedRows +=
              result.length === 2 &&
              Array.isArray(result[0]) &&
              typeof result[1] === 'number'
                ? result[0].length
                : result.length;
          } else if (
            result &&
            typeof result === 'object' &&
            'records' in result &&
            Array.isArray(result.records)
          )
            metrics.returnedRows += result.records.length;
        }
        return result;
      } catch (error) {
        if (metrics) metrics.sqlErrors++;
        throw error;
      } finally {
        if (metrics) metrics.sqlMs += performance.now() - started;
      }
    }) as QueryRunner['query'];
    return runner;
  };
}
