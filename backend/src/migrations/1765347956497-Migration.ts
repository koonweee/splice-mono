import { MigrationInterface, QueryRunner } from 'typeorm';

export class Migration1765347956497 implements MigrationInterface {
  name = 'Migration1765347956497';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "bank_link_entity" ADD "status" character varying NOT NULL DEFAULT 'OK'`,
    );
    await queryRunner.query(
      `ALTER TABLE "bank_link_entity" ADD "statusDate" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "bank_link_entity" DROP COLUMN "statusDate"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bank_link_entity" DROP COLUMN "status"`,
    );
  }
}
