import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWebhookEventContext1773819000000
  implements MigrationInterface
{
  name = 'AddWebhookEventContext1773819000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "webhook_event_entity" ADD "context" jsonb`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "webhook_event_entity" DROP COLUMN "context"`,
    );
  }
}
