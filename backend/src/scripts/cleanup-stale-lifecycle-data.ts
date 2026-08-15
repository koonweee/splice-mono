import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from '../app.module';
import { RefreshTokenCleanupService } from '../auth/refresh-token-cleanup.service';
import { BankLinkLifecycleService } from '../bank-link/bank-link-lifecycle.service';
import { NotificationService } from '../notification/notification.service';
import { CategorizationRuleRecommendationService } from '../transaction-categorization/recommendations/categorization-rule-recommendation.service';
import { WebhookEventCleanupService } from '../webhook-event/webhook-event-cleanup.service';
import {
  readLifecycleCleanupGuards,
  runLifecycleCleanup,
} from './run-lifecycle-cleanup';

async function cleanupStaleLifecycleData(): Promise<void> {
  const exactBankLinkGuards = readLifecycleCleanupGuards(process.env);
  const app = await NestFactory.createApplicationContext(AppModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));
  try {
    const result = await runLifecycleCleanup(
      {
        webhookCleanup: app.get(WebhookEventCleanupService, { strict: false }),
        refreshTokenCleanup: app.get(RefreshTokenCleanupService, {
          strict: false,
        }),
        recommendationCleanup: app.get(
          CategorizationRuleRecommendationService,
          { strict: false },
        ),
        notificationCleanup: app.get(NotificationService, { strict: false }),
        bankLinkLifecycle: app.get(BankLinkLifecycleService, { strict: false }),
      },
      exactBankLinkGuards,
    );
    process.stdout.write(
      `${JSON.stringify({ event: 'lifecycle_cleanup_completed', ...result })}\n`,
    );
  } finally {
    await app.close();
  }
}

void cleanupStaleLifecycleData().catch(() => {
  process.stderr.write(
    `${JSON.stringify({ event: 'lifecycle_cleanup_failed', failedCount: 1 })}\n`,
  );
  process.exitCode = 1;
});
