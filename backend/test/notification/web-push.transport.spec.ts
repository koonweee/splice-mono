import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import webPush from 'web-push';
import { WebPushAdapter } from '../../src/notification/web-push.adapter';

jest.mock('web-push', () => ({
  __esModule: true,
  default: { setVapidDetails: jest.fn(), generateRequestDetails: jest.fn() },
}));

describe('Web push real TLS transport deadline', () => {
  it.each(['drip', 'no-headers', 'oversized'])(
    'closes a %s provider socket and then completes a healthy delivery',
    async (scenario) => {
      const directory = mkdtempSync(
        path.join(os.tmpdir(), 'splice-push-test-'),
      );
      const certificate = path.join(directory, 'certificate.pem');
      const key = path.join(directory, 'key.pem');
      // Ephemeral, synthetic local TLS fixture; never a deployed credential.
      execFileSync(
        'openssl',
        [
          'req',
          '-x509',
          '-newkey',
          'rsa:2048',
          '-nodes',
          '-keyout',
          key,
          '-out',
          certificate,
          '-days',
          '1',
          '-subj',
          '/CN=127.0.0.1',
          '-addext',
          'subjectAltName=IP:127.0.0.1',
        ],
        { stdio: 'ignore' },
      );
      let closed!: () => void;
      const socketClosed = new Promise<void>((resolve) => {
        closed = resolve;
      });
      const server = https.createServer(
        { key: readFileSync(key), cert: readFileSync(certificate) },
        (request, response) => {
          if (request.url === '/healthy') {
            response.writeHead(201);
            response.end();
            return;
          }
          if (request.url === '/no-headers') {
            response.once('close', closed);
            return;
          }
          if (request.url === '/oversized') {
            response.once('close', closed);
            response.writeHead(201);
            response.write(Buffer.alloc(65 * 1024, 'x'));
            return;
          }
          response.writeHead(201);
          response.write('x');
          const drip = setInterval(() => response.write('x'), 100);
          response.once('close', () => {
            clearInterval(drip);
            closed();
          });
        },
      );
      const environment = { ...process.env };
      const realRequest = https.request;
      try {
        await new Promise<void>((resolve) =>
          server.listen(0, '127.0.0.1', resolve),
        );
        const endpoint = `https://127.0.0.1:${(server.address() as AddressInfo).port}`;
        // Trust only this test certificate, without disabling TLS verification.
        jest
          .spyOn(https, 'request')
          .mockImplementation(((
            url: string,
            options: https.RequestOptions,
            callback: Parameters<typeof realRequest>[2],
          ) =>
            realRequest(
              url,
              { ...options, ca: readFileSync(certificate) },
              callback,
            )) as any);
        jest
          .mocked(webPush.generateRequestDetails)
          .mockImplementation((subscription) => ({
            endpoint: subscription.endpoint,
            method: 'POST',
            headers: {},
            body: Buffer.from('synthetic'),
          }));
        process.env.VAPID_PUBLIC_KEY = 'synthetic';
        process.env.VAPID_PRIVATE_KEY = 'synthetic';
        process.env.VAPID_SUBJECT = 'mailto:test@example.test';
        const adapter = new WebPushAdapter();
        const payload = {
          title: 'Synthetic',
          body: 'Synthetic',
          tag: 'test',
          url: '/accounts',
        };
        const start = Date.now();
        await expect(
          adapter.send(
            {
              endpoint: `${endpoint}/${scenario}`,
              p256dh: 'synthetic',
              auth: 'synthetic',
            } as any,
            payload,
          ),
        ).rejects.toThrow();
        await socketClosed;
        expect(Date.now() - start).toBeLessThan(6500);
        await expect(
          adapter.send(
            {
              endpoint: `${endpoint}/healthy`,
              p256dh: 'synthetic',
              auth: 'synthetic',
            } as any,
            payload,
          ),
        ).resolves.toBeUndefined();
      } finally {
        jest.restoreAllMocks();
        process.env = environment;
        server.closeAllConnections();
        await new Promise<void>((resolve) => server.close(() => resolve()));
        rmSync(directory, { recursive: true, force: true });
      }
    },
    15000,
  );
});
