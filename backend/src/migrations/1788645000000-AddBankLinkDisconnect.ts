import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBankLinkDisconnect1788645000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE bank_link_entity
        ADD COLUMN "disconnectRequestedAt" timestamptz,
        ADD COLUMN "disconnectedAt" timestamptz,
        ADD COLUMN "disconnectNextAttemptAt" timestamptz,
        ADD COLUMN "disconnectAttempts" integer NOT NULL DEFAULT 0;
      CREATE INDEX "IDX_bank_link_disconnect_pending"
        ON bank_link_entity ("disconnectNextAttemptAt", id)
        WHERE "disconnectRequestedAt" IS NOT NULL AND "disconnectedAt" IS NULL;
      UPDATE bank_link_entity b
        SET "disconnectRequestedAt" = NOW(), "disconnectNextAttemptAt" = NOW()
        WHERE b."providerName" = 'plaid' AND b."archivedAt" IS NOT NULL
          AND b.authentication ? 'accessToken'
          AND NOT EXISTS (SELECT 1 FROM account_entity a
            WHERE a."bankLinkId" = b.id AND a."archivedAt" IS NULL);
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Schema rollback cannot restore Items already removed at Plaid.
    await queryRunner.query(`
      DROP INDEX "IDX_bank_link_disconnect_pending";
      ALTER TABLE bank_link_entity
        DROP COLUMN "disconnectRequestedAt", DROP COLUMN "disconnectedAt",
        DROP COLUMN "disconnectNextAttemptAt", DROP COLUMN "disconnectAttempts";
    `);
  }
}
