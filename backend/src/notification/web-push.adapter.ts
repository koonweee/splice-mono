import { Injectable, Logger } from '@nestjs/common';
import webPush from 'web-push';
import type { PushSubscriptionEntity } from './push-subscription.entity';

export type RenderedPushPayload = {
  title: string;
  body: string;
  url: string;
  tag: string;
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
  ): Promise<void> {
    if (!this.configured) {
      throw new Error('Web push is not configured');
    }

    await webPush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.p256dh,
          auth: subscription.auth,
        },
      },
      JSON.stringify(payload),
    );
  }
}
