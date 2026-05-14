import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTransactionSource1776600000000 implements MigrationInterface {
  name = 'AddTransactionSource1776600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "transaction_entity" ADD "source" character varying NOT NULL DEFAULT 'provider'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "transaction_entity" DROP COLUMN "source"`,
    );
  }
}
