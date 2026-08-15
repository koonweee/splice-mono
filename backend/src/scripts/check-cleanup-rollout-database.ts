import pino from 'pino';
import { AppDataSource } from '../data-source';

const EXPECTED_MIGRATIONS = [
  'AddLifecycleCleanupConstraints1777501000000',
  'AddBankLinkArchival1777502000000',
  'AddTransactionReconciliationArchive1777503000000',
] as const;

type RolloutCheckRow = {
  connectionProbe: number;
  expectedMigrationCount: number;
  hasBankLinkArchivedAt: boolean;
  hasReconciliationArchive: boolean;
  hasRefreshTokenReplacementForeignKey: boolean;
  hasRefreshTokenCleanupIndex: boolean;
  hasWebhookCleanupIndex: boolean;
  hasBankLinkActiveIndex: boolean;
  hasReconciliationArchiveExpiryIndex: boolean;
};

async function checkCleanupRolloutDatabase(): Promise<void> {
  const logger = pino();
  await AppDataSource.initialize();

  try {
    const rows = await AppDataSource.query<RolloutCheckRow[]>(
      `SELECT
         1 AS "connectionProbe",
         (
           SELECT count(*)::int
           FROM migrations
           WHERE name = ANY($1::text[])
         ) AS "expectedMigrationCount",
         EXISTS (
           SELECT 1
           FROM information_schema.columns
           WHERE table_schema = 'public'
             AND table_name = 'bank_link_entity'
             AND column_name = 'archivedAt'
         ) AS "hasBankLinkArchivedAt",
         to_regclass('public.transaction_reconciliation_archive_entity')
           IS NOT NULL AS "hasReconciliationArchive",
         EXISTS (
           SELECT 1
           FROM pg_constraint
           WHERE conname = 'FK_refresh_token_replacement'
         ) AS "hasRefreshTokenReplacementForeignKey",
         to_regclass('public."IDX_refresh_token_expiry_cleanup"')
           IS NOT NULL AS "hasRefreshTokenCleanupIndex",
         to_regclass('public."IDX_webhook_event_pending_expiry_cleanup"')
           IS NOT NULL AS "hasWebhookCleanupIndex",
         to_regclass('public."IDX_bank_link_user_active"')
           IS NOT NULL AS "hasBankLinkActiveIndex",
         to_regclass('public."IDX_transaction_reconciliation_archive_expiry"')
           IS NOT NULL AS "hasReconciliationArchiveExpiryIndex"`,
      [[...EXPECTED_MIGRATIONS]],
    );
    const result = rows[0];
    const passed =
      result?.connectionProbe === 1 &&
      result.expectedMigrationCount === EXPECTED_MIGRATIONS.length &&
      result.hasBankLinkArchivedAt &&
      result.hasReconciliationArchive &&
      result.hasRefreshTokenReplacementForeignKey &&
      result.hasRefreshTokenCleanupIndex &&
      result.hasWebhookCleanupIndex &&
      result.hasBankLinkActiveIndex &&
      result.hasReconciliationArchiveExpiryIndex;

    logger.info(
      {
        passed,
        expectedMigrationCount: result?.expectedMigrationCount ?? 0,
        expectedMigrationTotal: EXPECTED_MIGRATIONS.length,
        hasBankLinkArchivedAt: result?.hasBankLinkArchivedAt ?? false,
        hasReconciliationArchive: result?.hasReconciliationArchive ?? false,
        hasRefreshTokenReplacementForeignKey:
          result?.hasRefreshTokenReplacementForeignKey ?? false,
        hasRefreshTokenCleanupIndex:
          result?.hasRefreshTokenCleanupIndex ?? false,
        hasWebhookCleanupIndex: result?.hasWebhookCleanupIndex ?? false,
        hasBankLinkActiveIndex: result?.hasBankLinkActiveIndex ?? false,
        hasReconciliationArchiveExpiryIndex:
          result?.hasReconciliationArchiveExpiryIndex ?? false,
      },
      'Cleanup rollout database check completed',
    );

    if (!passed) {
      throw new Error('Cleanup rollout database check failed');
    }
  } finally {
    await AppDataSource.destroy();
  }
}

void checkCleanupRolloutDatabase().catch((error: unknown) => {
  pino().error(
    { error: error instanceof Error ? error.message : String(error) },
    'Cleanup rollout database check failed',
  );
  process.exitCode = 1;
});
