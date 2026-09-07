import { AppDataSource } from '../data-source';
import { BrowserSessionService } from './browser-session.service';

/** Run only after old auth/push instances drain, using the normal server env. */
async function reconcileBrowserSessions(): Promise<void> {
  await AppDataSource.initialize();
  try {
    const service = new BrowserSessionService(AppDataSource);
    let reconciled = 0;
    for (let batch = 0; batch < 1000; batch++) {
      const count = await service.backfillUnboundSessions();
      reconciled += count;
      if (!count) break;
    }
    const rows = await AppDataSource.query<{ remaining: number }[]>(
      `SELECT COUNT(*)::int AS remaining FROM refresh_token
       WHERE "sessionId" IS NULL AND NOT revoked AND "expiresAt" > now()`,
    );
    // Counts only: never log token hashes, endpoint URLs, keys, or user IDs.
    process.stdout.write(
      JSON.stringify({ reconciled, remaining: rows[0].remaining }) + '\n',
    );
    if (rows[0].remaining !== 0) process.exitCode = 1;
  } finally {
    await AppDataSource.destroy();
  }
}

void reconcileBrowserSessions().catch(() => {
  process.stderr.write(
    'Browser session reconciliation failed; no credentials were logged.\n',
  );
  process.exitCode = 1;
});
