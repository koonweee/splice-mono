import { canonicalMinorUnits } from '../common/exact-money';
import { AppDataSource } from '../data-source';

type ArchiveRow = {
  id: string;
  userId: string;
  accountId: string;
  externalTransactionId: string;
  snapshot: {
    schemaVersion?: number;
    activity?: Record<string, unknown>;
    bankingTransaction?: Record<string, unknown>;
  };
};

async function restoreTransactionReconciliationArchive(): Promise<void> {
  const archiveId = process.env.TRANSACTION_RECONCILIATION_ARCHIVE_ID;
  const expectedUserId = process.env.TRANSACTION_RECONCILIATION_USER_ID;
  if (
    process.env.CONFIRM_TRANSACTION_RECONCILIATION_RESTORE !== 'restore' ||
    !archiveId ||
    !expectedUserId
  ) {
    throw new Error(
      'Set CONFIRM_TRANSACTION_RECONCILIATION_RESTORE=restore, TRANSACTION_RECONCILIATION_ARCHIVE_ID, and TRANSACTION_RECONCILIATION_USER_ID',
    );
  }

  await AppDataSource.initialize();
  try {
    await AppDataSource.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock($1)', [1777503001]);
      const rows: ArchiveRow[] = await manager.query(
        `
          SELECT id, "userId", "accountId", "externalTransactionId", snapshot
          FROM "transaction_reconciliation_archive_entity"
          WHERE id = $1
            AND "userId" = $2
            AND "restoredAt" IS NULL
            AND "expiresAt" > now()
          FOR UPDATE
        `,
        [archiveId, expectedUserId],
      );
      const archive = rows[0];
      if (
        !archive ||
        archive.snapshot.schemaVersion !== 2 ||
        !archive.snapshot.activity ||
        !archive.snapshot.bankingTransaction
      ) {
        throw new Error('Eligible version-2 exact-money archive not found');
      }
      const activity = archive.snapshot.activity;
      if (typeof activity.amountAmount !== 'string')
        throw new Error('Archive must contain exact money text');
      canonicalMinorUnits(activity.amountAmount);
      if (
        activity.userId !== archive.userId ||
        activity.accountId !== archive.accountId ||
        activity.externalActivityId !== archive.externalTransactionId
      ) {
        throw new Error(
          'Archive snapshot identity does not match its envelope',
        );
      }

      const ownerRows: Array<{ id: string }> = await manager.query(
        `
          SELECT account.id
          FROM account_entity account
          JOIN user_entity app_user ON app_user.id = account."userId"
          WHERE account.id = $1
            AND account."userId" = $2
            AND account."archivedAt" IS NULL
        `,
        [archive.accountId, archive.userId],
      );
      if (ownerRows.length !== 1) {
        throw new Error('Archive owner or account no longer exists');
      }

      const conflictRows: Array<{ '?column?': number }> = await manager.query(
        `
          SELECT 1
          FROM account_activity_entity
          WHERE id = ($1::jsonb ->> 'id')::uuid
             OR (
               "userId" = $2
               AND "accountId" = $3
               AND provider = ($1::jsonb ->> 'provider')
               AND "activityKind" = ($1::jsonb ->> 'activityKind')
               AND "externalActivityId" = ($1::jsonb ->> 'externalActivityId')
             )
          LIMIT 1
        `,
        [
          JSON.stringify(archive.snapshot.activity),
          archive.userId,
          archive.accountId,
        ],
      );
      if (conflictRows.length > 0) {
        throw new Error(
          'An activity with the archived identity already exists',
        );
      }

      await manager.query(
        `
          INSERT INTO account_activity_entity
          SELECT restored.*
          FROM jsonb_populate_record(NULL::account_activity_entity, $1::jsonb) restored
        `,
        [JSON.stringify(archive.snapshot.activity)],
      );
      await manager.query(
        `
          INSERT INTO banking_transaction_entity
          SELECT restored.*
          FROM jsonb_populate_record(NULL::banking_transaction_entity, $1::jsonb) restored
        `,
        [JSON.stringify(archive.snapshot.bankingTransaction)],
      );
      await manager.query(
        `
          UPDATE "transaction_reconciliation_archive_entity"
          SET "restoredAt" = now(), "updatedAt" = now()
          WHERE id = $1 AND "restoredAt" IS NULL
        `,
        [archive.id],
      );
    });
    process.stdout.write(`Restored reconciliation archive ${archiveId}\n`);
  } finally {
    await AppDataSource.destroy();
  }
}

void restoreTransactionReconciliationArchive();
