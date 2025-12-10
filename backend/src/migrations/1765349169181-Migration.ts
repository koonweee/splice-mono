import { MigrationInterface, QueryRunner } from 'typeorm';

export class Migration1765349169181 implements MigrationInterface {
  name = 'Migration1765349169181';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "bank_link_entity" ADD "statusBody" jsonb`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "bank_link_entity" DROP COLUMN "statusBody"`,
    );
  }
}
