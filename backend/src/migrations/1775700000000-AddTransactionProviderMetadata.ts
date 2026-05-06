import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTransactionProviderMetadata1775700000000
  implements MigrationInterface
{
  name = 'AddTransactionProviderMetadata1775700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "transaction_entity" ADD "providerTransactionName" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction_entity" ADD "originalDescription" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction_entity" ADD "pendingTransactionId" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction_entity" ADD "accountOwner" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction_entity" ADD "website" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction_entity" ADD "merchantEntityId" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction_entity" ADD "paymentChannel" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction_entity" ADD "transactionCode" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction_entity" ADD "personalFinanceCategoryIconUrl" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction_entity" ADD "personalFinanceCategoryConfidenceLevel" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction_entity" ADD "counterparties" jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction_entity" ADD "location" jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction_entity" ADD "paymentMeta" jsonb`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "transaction_entity" DROP COLUMN "paymentMeta"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction_entity" DROP COLUMN "location"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction_entity" DROP COLUMN "counterparties"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction_entity" DROP COLUMN "personalFinanceCategoryConfidenceLevel"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction_entity" DROP COLUMN "personalFinanceCategoryIconUrl"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction_entity" DROP COLUMN "transactionCode"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction_entity" DROP COLUMN "paymentChannel"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction_entity" DROP COLUMN "merchantEntityId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction_entity" DROP COLUMN "website"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction_entity" DROP COLUMN "accountOwner"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction_entity" DROP COLUMN "pendingTransactionId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction_entity" DROP COLUMN "originalDescription"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction_entity" DROP COLUMN "providerTransactionName"`,
    );
  }
}
