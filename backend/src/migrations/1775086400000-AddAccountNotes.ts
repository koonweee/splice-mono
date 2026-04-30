import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAccountNotes1775086400000 implements MigrationInterface {
  name = 'AddAccountNotes1775086400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "account_entity" ADD "notes" text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "account_entity" DROP COLUMN "notes"`);
  }
}
