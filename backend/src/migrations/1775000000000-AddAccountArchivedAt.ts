import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAccountArchivedAt1775000000000 implements MigrationInterface {
  name = 'AddAccountArchivedAt1775000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "account_entity" ADD "archivedAt" TIMESTAMP`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "account_entity" DROP COLUMN "archivedAt"`,
    );
  }
}
