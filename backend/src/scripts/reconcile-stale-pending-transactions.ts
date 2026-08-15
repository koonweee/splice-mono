import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from '../app.module';
import { StalePendingTransactionScheduledService } from '../bank-link/stale-pending-transaction.scheduled';

/**
 * Guarded one-shot operational entrypoint. It uses the same global and
 * per-bank-link advisory locks as the scheduled job. It applies explicit
 * provider pending-to-posted replacements and strictly qualified authoritative
 * absence cleanup with a restorable archive.
 */
async function reconcileStalePendingTransactions(): Promise<void> {
  if (process.env.DISABLE_SCHEDULES !== 'true') {
    throw new Error(
      'Refusing one-shot reconciliation unless DISABLE_SCHEDULES=true',
    );
  }
  const app = await NestFactory.createApplicationContext(AppModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));
  try {
    const reconciler = app.get(StalePendingTransactionScheduledService, {
      strict: false,
    });
    await reconciler.handleReconciliation();
  } finally {
    await app.close();
  }
}

void reconcileStalePendingTransactions();
