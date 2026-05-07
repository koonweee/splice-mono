import { MigrationInterface, QueryRunner } from 'typeorm';

export class RenameTransactionProviderDate1775900000000
  implements MigrationInterface
{
  name = 'RenameTransactionProviderDate1775900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "transaction_entity" RENAME COLUMN "date" TO "providerDate"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction_entity" RENAME COLUMN "datetime" TO "providerDatetime"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "transaction_entity" RENAME COLUMN "providerDatetime" TO "datetime"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction_entity" RENAME COLUMN "providerDate" TO "date"`,
    );
  }
}
