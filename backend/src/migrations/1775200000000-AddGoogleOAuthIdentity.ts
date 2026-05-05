import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGoogleOAuthIdentity1775200000000 implements MigrationInterface {
  name = 'AddGoogleOAuthIdentity1775200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_entity" ADD "googleSubject" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_entity" ADD "displayName" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_entity" ADD "avatarUrl" character varying`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_user_entity_google_subject" ON "user_entity" ("googleSubject") WHERE "googleSubject" IS NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_entity" ALTER COLUMN "hashedPassword" DROP NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "user_entity" SET "hashedPassword" = 'oauth-only-user' WHERE "hashedPassword" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_entity" ALTER COLUMN "hashedPassword" SET NOT NULL`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_user_entity_google_subject"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_entity" DROP COLUMN "avatarUrl"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_entity" DROP COLUMN "displayName"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_entity" DROP COLUMN "googleSubject"`,
    );
  }
}
