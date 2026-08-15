import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLifecycleCleanupConstraints1777501000000
  implements MigrationInterface
{
  name = 'AddLifecycleCleanupConstraints1777501000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "refresh_token" ADD CONSTRAINT "FK_refresh_token_replacement" FOREIGN KEY ("replacedByTokenId") REFERENCES "refresh_token"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_refresh_token_expiry_cleanup" ON "refresh_token" ("expiresAt", "id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_refresh_token_revoked_cleanup" ON "refresh_token" ("revokedAt", "id") WHERE "revoked" = true`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_webhook_event_pending_expiry_cleanup" ON "webhook_event_entity" ("expiresAt", "id") WHERE "status" = 'pending' AND "expiresAt" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_webhook_event_pending_expiry_cleanup"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_refresh_token_revoked_cleanup"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_refresh_token_expiry_cleanup"`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_token" DROP CONSTRAINT "FK_refresh_token_replacement"`,
    );
  }
}
