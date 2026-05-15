import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRefreshTokenRotationMetadata1776800000000
  implements MigrationInterface
{
  name = 'AddRefreshTokenRotationMetadata1776800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "refresh_token" ADD "revokedAt" TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_token" ADD "revocationReason" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_token" ADD "rotationGraceExpiresAt" TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_token" ADD "replacedByTokenId" uuid`,
    );
    await queryRunner.query(
      `UPDATE "refresh_token" SET "revokedAt" = "updatedAt", "revocationReason" = 'legacy' WHERE "revoked" = true`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "refresh_token" DROP COLUMN "replacedByTokenId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_token" DROP COLUMN "rotationGraceExpiresAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_token" DROP COLUMN "revocationReason"`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_token" DROP COLUMN "revokedAt"`,
    );
  }
}
