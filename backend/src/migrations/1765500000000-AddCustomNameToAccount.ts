import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCustomNameToAccount1765500000000 implements MigrationInterface {
  name = 'AddCustomNameToAccount1765500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "account_entity" ADD "customName" character varying`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "account_entity" DROP COLUMN "customName"`,
    );
  }
}
