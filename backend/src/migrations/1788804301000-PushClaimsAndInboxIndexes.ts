import type { MigrationInterface, QueryRunner } from 'typeorm';

export class PushClaimsAndInboxIndexes1788804301000
  implements MigrationInterface
{
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE notification_push_delivery_entity ADD COLUMN "claimToken" uuid`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_notification_inbox_feed" ON notification_entity ("userId", "createdAt" DESC, id DESC) WHERE status = 'active' AND type <> 'system.test'`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_notification_inbox_unread" ON notification_entity ("userId", "createdAt") WHERE status = 'active' AND "readAt" IS NULL AND type <> 'system.test'`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_notification_inbox_unread"`);
    await queryRunner.query(`DROP INDEX "IDX_notification_inbox_feed"`);
    await queryRunner.query(
      `ALTER TABLE notification_push_delivery_entity DROP COLUMN "claimToken"`,
    );
  }
}
