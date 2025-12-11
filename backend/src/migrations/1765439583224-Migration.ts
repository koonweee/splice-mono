import { MigrationInterface, QueryRunner } from 'typeorm';

export class Migration1765439583224 implements MigrationInterface {
  name = 'Migration1765439583224';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "category_entity" ADD "createdAt" TIMESTAMP NOT NULL DEFAULT now()`,
    );
    await queryRunner.query(
      `ALTER TABLE "category_entity" ADD "updatedAt" TIMESTAMP NOT NULL DEFAULT now()`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_entity" ALTER COLUMN "settings" SET DEFAULT '{"currency":"USD","timezone":"UTC"}'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_entity" ALTER COLUMN "settings" SET DEFAULT '{"currency": "USD", "timezone": "UTC"}'`,
    );
    await queryRunner.query(
      `ALTER TABLE "category_entity" DROP COLUMN "updatedAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "category_entity" DROP COLUMN "createdAt"`,
    );
  }
}
