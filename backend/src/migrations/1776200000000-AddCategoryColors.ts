import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCategoryColors1776200000000 implements MigrationInterface {
  name = 'AddCategoryColors1776200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "category_entity" ADD "color" character varying`,
    );
    await queryRunner.query(
      `UPDATE "category_entity" SET "color" = '#' || substr(md5(random()::text || "id"::text), 1, 6) WHERE "color" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "category_entity" ALTER COLUMN "color" SET NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "category_entity" DROP COLUMN "color"`,
    );
  }
}
