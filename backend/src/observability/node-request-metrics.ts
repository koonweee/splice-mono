import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import {
  recordResponseBytes,
  runWithRequestMetrics,
  type RequestMetrics,
} from './request-metrics';

/** Wraps the SDK's existing listener; its guards, lifecycle, and transport stay intact. */
export function installNodeRequestMetrics(
  server: Server,
  complete: (metrics: RequestMetrics, status: number) => void,
): void {
  const listeners = server.listeners('request') as Array<
    (request: IncomingMessage, response: ServerResponse) => void
  >;
  for (const listener of listeners) server.removeListener('request', listener);
  server.on('request', (request, response) => {
    void runWithRequestMetrics(
      () =>
        new Promise<void>((resolve, reject) => {
          const finished = () => {
            response.off('finish', finished);
            response.off('close', finished);
            const length = response.getHeader('content-length');
            recordResponseBytes(length === undefined ? null : Number(length));
            if (response.statusCode >= 400 || !response.writableFinished)
              reject(new Error('Request failed'));
            else resolve();
          };
          response.once('finish', finished);
          response.once('close', finished);
          for (const listener of listeners)
            listener.call(server, request, response);
        }),
      (metrics) => complete(metrics, response.statusCode),
    ).catch(() => undefined);
  });
}
