import { Injectable, Logger } from '@nestjs/common';
import webPush from 'web-push';
import https from 'node:https';
import type { PushSubscriptionEntity } from './push-subscription.entity';

export type RenderedPushPayload = {
  title: string;
  body: string;
  url: string;
  tag: string;
  version?: 2;
  enrollmentId?: string;
  badgeCount?: number;
  badgeAsOf?: string;
};

@Injectable()
export class WebPushAdapter {
  private readonly logger = new Logger(WebPushAdapter.name);
  private configured = false;

  constructor() {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT;

    if (publicKey && privateKey && subject) {
      webPush.setVapidDetails(subject, publicKey, privateKey);
      this.configured = true;
    } else {
      this.logger.warn(
        {},
        'Web push VAPID configuration missing; push delivery disabled',
      );
    }
  }

  isConfigured(): boolean {
    return this.configured;
  }

  getPublicKey(): string | null {
    return this.configured ? (process.env.VAPID_PUBLIC_KEY ?? null) : null;
  }

  async send(
    subscription: PushSubscriptionEntity,
    payload: RenderedPushPayload,
    ttl = 300,
  ): Promise<void> {
    if (!this.configured) {
      throw new Error('Web push is not configured');
    }

    const details = webPush.generateRequestDetails(
      {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.p256dh,
          auth: subscription.auth,
        },
      },
      JSON.stringify(payload),
      { TTL: ttl },
    );
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(deadline);
        if (error) reject(error);
        else resolve();
      };
      const request = https.request(
        details.endpoint,
        {
          method: details.method,
          headers: details.headers,
        },
        (response) => {
          let size = 0;
          response.on('data', (chunk: Buffer) => {
            size += chunk.length;
            if (size > 64 * 1024)
              request.destroy(new Error('Push response exceeded limit'));
          });
          response.on('error', () =>
            finish(new Error('Push response interrupted')),
          );
          response.on('aborted', () =>
            finish(new Error('Push response interrupted')),
          );
          response.on('end', () => {
            const statusCode = response.statusCode ?? 0;
            if (statusCode >= 200 && statusCode < 300) finish();
            else
              finish(
                Object.assign(new Error('Push provider rejected delivery'), {
                  statusCode,
                }),
              );
          });
        },
      );
      // Inactivity alone is insufficient: a provider can continuously drip bytes.
      // Keep this deadline through response completion and destroy the socket.
      const deadline = setTimeout(() => {
        request.destroy(new Error('Push total deadline exceeded'));
      }, 5_000);
      request.setTimeout(3_000, () =>
        request.destroy(new Error('Push socket timeout')),
      );
      request.on('error', (error) => finish(error));
      request.end(details.body);
    });
  }
}
