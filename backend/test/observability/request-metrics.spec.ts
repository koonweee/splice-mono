import { createServer } from 'node:http';
import { installNodeRequestMetrics } from '../../src/observability/node-request-metrics';
import {
  recordJsonSerializationAndSend,
  recordResponseBytes,
  runWithRequestMetrics,
  snapshotRequestMetrics,
  type RequestMetrics,
} from '../../src/observability/request-metrics';

describe('request metrics', () => {
  it('isolates concurrent and nested requests and removes completed context', async () => {
    const completed: RequestMetrics[] = [];
    await Promise.all(
      [1, 2].map((bytes) =>
        runWithRequestMetrics(
          async () => {
            recordResponseBytes(bytes);
            await runWithRequestMetrics(async () => {
              recordResponseBytes(99);
              await Promise.resolve();
            });
            await Promise.resolve();
            expect(snapshotRequestMetrics()?.responseBytes).toBe(bytes);
          },
          (metrics) => completed.push(metrics),
        ),
      ),
    );
    expect(completed.map((metrics) => metrics.responseBytes).sort()).toEqual([
      1, 2,
    ]);
    expect(snapshotRequestMetrics()).toBeUndefined();
  });

  it('retains counters, without exception text or business values', async () => {
    let completed: RequestMetrics | undefined;
    await expect(
      runWithRequestMetrics(
        async () => {
          recordJsonSerializationAndSend(2);
          throw new Error('private financial value');
        },
        (metrics) => {
          completed = metrics;
        },
      ),
    ).rejects.toThrow('private financial value');
    expect(completed).toMatchObject({
      errors: 1,
      jsonSerializationAndSendMs: 2,
    });
    expect(JSON.stringify(completed)).not.toContain('private');
    expect(snapshotRequestMetrics()).toBeUndefined();
  });

  it('keeps the original Node listener and lifecycle while measuring its response', async () => {
    const completed: RequestMetrics[] = [];
    const server = createServer((_request, response) => {
      setImmediate(() => {
        response.setHeader('content-length', '2');
        response.end('ok');
      });
    });
    installNodeRequestMetrics(server, (metrics) => completed.push(metrics));
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    try {
      const address = server.address();
      if (!address || typeof address === 'string')
        throw new Error('No local test address');
      const responses = await Promise.all(
        [1, 2].map(() => fetch(`http://127.0.0.1:${address.port}/`)),
      );
      expect(
        await Promise.all(responses.map((response) => response.text())),
      ).toEqual(['ok', 'ok']);
      expect(completed).toHaveLength(2);
      expect(
        completed.every(
          (metrics) =>
            metrics.responseBytes === 2 &&
            metrics.errors === 0 &&
            metrics.jsonSerializationAndSendMs === null,
        ),
      ).toBe(true);
    } finally {
      server.closeIdleConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
});
