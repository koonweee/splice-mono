import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTransactionReconciliationArchive1777503000000
  implements MigrationInterface
{
  name = 'AddTransactionReconciliationArchive1777503000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "transaction_reconciliation_archive_entity" (
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "accountId" uuid NOT NULL,
        "externalTransactionId" character varying NOT NULL,
        "snapshot" jsonb NOT NULL,
        "evidence" jsonb NOT NULL,
        "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "restoredAt" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_transaction_reconciliation_archive" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_transaction_reconciliation_archive_identity"
          UNIQUE ("userId", "accountId", "externalTransactionId")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_transaction_reconciliation_archive_expiry"
      ON "transaction_reconciliation_archive_entity" ("expiresAt")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP TABLE "transaction_reconciliation_archive_entity"',
    );
  }
}
