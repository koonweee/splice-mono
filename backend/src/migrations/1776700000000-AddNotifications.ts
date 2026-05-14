import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNotifications1776700000000 implements MigrationInterface {
  name = 'AddNotifications1776700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "notification_entity" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "userId" uuid NOT NULL, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "type" character varying NOT NULL, "dedupeKey" character varying NOT NULL, "payload" jsonb NOT NULL, "status" character varying NOT NULL DEFAULT 'active', "readAt" TIMESTAMP WITH TIME ZONE, "archivedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_notification_entity" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_notification_type_dedupe" ON "notification_entity" ("type", "dedupeKey")`,
    );
    await queryRunner.query(
      `CREATE TABLE "push_subscription_entity" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "userId" uuid NOT NULL, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "endpoint" text NOT NULL, "p256dh" text NOT NULL, "auth" text NOT NULL, "userAgent" text, "revokedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_push_subscription_entity" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_push_subscription_endpoint" ON "push_subscription_entity" ("endpoint")`,
    );
    await queryRunner.query(
      `CREATE TABLE "notification_push_delivery_entity" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "notificationId" uuid NOT NULL, "subscriptionId" uuid NOT NULL, "status" character varying NOT NULL DEFAULT 'pending', "attemptCount" integer NOT NULL DEFAULT '0', "availableAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "processingStartedAt" TIMESTAMP WITH TIME ZONE, "sentAt" TIMESTAMP WITH TIME ZONE, "lastError" text, CONSTRAINT "PK_notification_push_delivery_entity" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_notification_push_delivery_pending" ON "notification_push_delivery_entity" ("status", "availableAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_notification_push_delivery_cleanup" ON "notification_push_delivery_entity" ("createdAt")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_notification_push_delivery_target" ON "notification_push_delivery_entity" ("notificationId", "subscriptionId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "notification_entity" ADD CONSTRAINT "FK_notification_user" FOREIGN KEY ("userId") REFERENCES "user_entity"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "push_subscription_entity" ADD CONSTRAINT "FK_push_subscription_user" FOREIGN KEY ("userId") REFERENCES "user_entity"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "notification_push_delivery_entity" ADD CONSTRAINT "FK_notification_push_delivery_notification" FOREIGN KEY ("notificationId") REFERENCES "notification_entity"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "notification_push_delivery_entity" ADD CONSTRAINT "FK_notification_push_delivery_subscription" FOREIGN KEY ("subscriptionId") REFERENCES "push_subscription_entity"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "notification_push_delivery_entity" DROP CONSTRAINT "FK_notification_push_delivery_subscription"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notification_push_delivery_entity" DROP CONSTRAINT "FK_notification_push_delivery_notification"`,
    );
    await queryRunner.query(
      `ALTER TABLE "push_subscription_entity" DROP CONSTRAINT "FK_push_subscription_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notification_entity" DROP CONSTRAINT "FK_notification_user"`,
    );
    await queryRunner.query(
      `DROP INDEX "UQ_notification_push_delivery_target"`,
    );
    await queryRunner.query(
      `DROP INDEX "IDX_notification_push_delivery_cleanup"`,
    );
    await queryRunner.query(
      `DROP INDEX "IDX_notification_push_delivery_pending"`,
    );
    await queryRunner.query(`DROP TABLE "notification_push_delivery_entity"`);
    await queryRunner.query(`DROP INDEX "UQ_push_subscription_endpoint"`);
    await queryRunner.query(`DROP TABLE "push_subscription_entity"`);
    await queryRunner.query(`DROP INDEX "UQ_notification_type_dedupe"`);
    await queryRunner.query(`DROP TABLE "notification_entity"`);
  }
}
