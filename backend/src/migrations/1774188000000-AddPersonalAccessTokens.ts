import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPersonalAccessTokens1774188000000
  implements MigrationInterface
{
  name = 'AddPersonalAccessTokens1774188000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "personal_access_token" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "name" character varying NOT NULL, "tokenHash" character varying NOT NULL, "prefix" character varying NOT NULL, "lastUsedAt" TIMESTAMP, "expiresAt" TIMESTAMP, "revokedAt" TIMESTAMP, CONSTRAINT "PK_personal_access_token_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_personal_access_token_hash" ON "personal_access_token" ("tokenHash")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_personal_access_token_user_id" ON "personal_access_token" ("userId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "personal_access_token" ADD CONSTRAINT "FK_personal_access_token_user_id" FOREIGN KEY ("userId") REFERENCES "user_entity"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "personal_access_token" DROP CONSTRAINT "FK_personal_access_token_user_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_personal_access_token_user_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_personal_access_token_hash"`,
    );
    await queryRunner.query(`DROP TABLE "personal_access_token"`);
  }
}
