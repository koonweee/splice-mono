import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBankLinkArchival1777502000000 implements MigrationInterface {
  name = 'AddBankLinkArchival1777502000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "bank_link_entity" ADD "archivedAt" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_bank_link_user_active" ON "bank_link_entity" ("userId", "archivedAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_bank_link_user_active"`);
    await queryRunner.query(
      `ALTER TABLE "bank_link_entity" DROP COLUMN "archivedAt"`,
    );
  }
}
