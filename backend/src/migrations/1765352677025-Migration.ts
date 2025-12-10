import { MigrationInterface, QueryRunner } from 'typeorm';

export class Migration1765352677025 implements MigrationInterface {
  name = 'Migration1765352677025';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_entity" ADD "settings" jsonb NOT NULL DEFAULT '{"currency":"USD","timezone":"UTC"}'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user_entity" DROP COLUMN "settings"`);
  }
}
