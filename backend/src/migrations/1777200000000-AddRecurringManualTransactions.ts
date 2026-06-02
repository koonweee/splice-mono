import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRecurringManualTransactions1777200000000
  implements MigrationInterface
{
  name = 'AddRecurringManualTransactions1777200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "recurring_manual_transaction_schedule_entity" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "userId" uuid NOT NULL, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "accountId" uuid NOT NULL, "amountAmount" bigint NOT NULL, "amountCurrency" character varying NOT NULL, "amountSign" character varying NOT NULL, "merchantName" character varying NOT NULL, "categoryId" uuid NOT NULL, "frequency" character varying NOT NULL DEFAULT 'monthly', "dayOfMonth" integer NOT NULL, "startDate" date NOT NULL, "endDate" date, "nextOccurrenceDate" date, "lastGeneratedOccurrenceDate" date, "pausedAt" TIMESTAMP WITH TIME ZONE, "archivedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_recurring_manual_transaction_schedule" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "recurring_manual_transaction_occurrence_entity" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "userId" uuid NOT NULL, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "scheduleId" uuid NOT NULL, "occurrenceDate" date NOT NULL, "transactionId" uuid NOT NULL, "generatedAt" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_recurring_manual_transaction_occurrence" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_recurring_manual_schedule_user_next" ON "recurring_manual_transaction_schedule_entity" ("userId", "nextOccurrenceDate")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_recurring_manual_occurrence_schedule_date" ON "recurring_manual_transaction_occurrence_entity" ("scheduleId", "occurrenceDate")`,
    );
    await queryRunner.query(
      `ALTER TABLE "recurring_manual_transaction_schedule_entity" ADD CONSTRAINT "FK_recurring_manual_schedule_user" FOREIGN KEY ("userId") REFERENCES "user_entity"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "recurring_manual_transaction_schedule_entity" ADD CONSTRAINT "FK_recurring_manual_schedule_account" FOREIGN KEY ("accountId") REFERENCES "account_entity"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "recurring_manual_transaction_schedule_entity" ADD CONSTRAINT "FK_recurring_manual_schedule_category" FOREIGN KEY ("categoryId") REFERENCES "category_entity"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "recurring_manual_transaction_occurrence_entity" ADD CONSTRAINT "FK_recurring_manual_occurrence_user" FOREIGN KEY ("userId") REFERENCES "user_entity"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "recurring_manual_transaction_occurrence_entity" ADD CONSTRAINT "FK_recurring_manual_occurrence_schedule" FOREIGN KEY ("scheduleId") REFERENCES "recurring_manual_transaction_schedule_entity"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "recurring_manual_transaction_occurrence_entity" ADD CONSTRAINT "FK_recurring_manual_occurrence_transaction" FOREIGN KEY ("transactionId") REFERENCES "banking_transaction_entity"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "recurring_manual_transaction_occurrence_entity" DROP CONSTRAINT "FK_recurring_manual_occurrence_transaction"`,
    );
    await queryRunner.query(
      `ALTER TABLE "recurring_manual_transaction_occurrence_entity" DROP CONSTRAINT "FK_recurring_manual_occurrence_schedule"`,
    );
    await queryRunner.query(
      `ALTER TABLE "recurring_manual_transaction_occurrence_entity" DROP CONSTRAINT "FK_recurring_manual_occurrence_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "recurring_manual_transaction_schedule_entity" DROP CONSTRAINT "FK_recurring_manual_schedule_category"`,
    );
    await queryRunner.query(
      `ALTER TABLE "recurring_manual_transaction_schedule_entity" DROP CONSTRAINT "FK_recurring_manual_schedule_account"`,
    );
    await queryRunner.query(
      `ALTER TABLE "recurring_manual_transaction_schedule_entity" DROP CONSTRAINT "FK_recurring_manual_schedule_user"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."UQ_recurring_manual_occurrence_schedule_date"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_recurring_manual_schedule_user_next"`,
    );
    await queryRunner.query(
      `DROP TABLE "recurring_manual_transaction_occurrence_entity"`,
    );
    await queryRunner.query(
      `DROP TABLE "recurring_manual_transaction_schedule_entity"`,
    );
  }
}
