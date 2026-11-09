import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBankLinkHealth1794100000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE bank_link_entity ADD COLUMN health jsonb, ADD COLUMN "healthCheckedAt" timestamptz, ADD COLUMN "healthCheckStartedAt" timestamptz`,
    );
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE bank_link_entity DROP COLUMN "healthCheckStartedAt", DROP COLUMN "healthCheckedAt", DROP COLUMN health`,
    );
  }
}
