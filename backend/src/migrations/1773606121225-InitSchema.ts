import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitSchema1773606121225 implements MigrationInterface {
  name = 'InitSchema1773606121225';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(
      `CREATE TABLE "user_entity" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "email" character varying NOT NULL, "hashedPassword" character varying NOT NULL, "settings" jsonb NOT NULL DEFAULT '{"currency":"USD","timezone":"UTC"}', "providerDetails" jsonb, CONSTRAINT "UQ_415c35b9b3b6fe45a3b065030f5" UNIQUE ("email"), CONSTRAINT "PK_b54f8ea623b17094db7667d8206" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "webhook_event_entity" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "userId" uuid NOT NULL, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "webhookId" character varying NOT NULL, "webhookContent" jsonb, "status" character varying NOT NULL DEFAULT 'pending', "providerName" character varying NOT NULL, "expiresAt" TIMESTAMP WITH TIME ZONE, "completedAt" TIMESTAMP WITH TIME ZONE, "errorMessage" text, CONSTRAINT "UQ_db1d3b92af9c941e5d0a3fc010c" UNIQUE ("webhookId"), CONSTRAINT "PK_5c263a6d0e359f7f9780e5e7058" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "bank_link_entity" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "userId" uuid NOT NULL, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "providerName" character varying NOT NULL, "authentication" jsonb NOT NULL, "accountIds" text NOT NULL, "institutionId" character varying, "institutionName" character varying, "status" character varying NOT NULL DEFAULT 'OK', "statusDate" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(), "statusBody" jsonb, CONSTRAINT "PK_653862a61f118ca868b0340c9f9" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "account_entity" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "userId" uuid NOT NULL, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying, "customName" character varying, "mask" character varying, "type" character varying NOT NULL, "subType" character varying, "externalAccountId" character varying, "rawApiAccount" jsonb, "bankLinkId" uuid, "availableBalanceAmount" bigint NOT NULL, "availableBalanceCurrency" character varying NOT NULL, "availableBalanceSign" character varying NOT NULL, "currentBalanceAmount" bigint NOT NULL, "currentBalanceCurrency" character varying NOT NULL, "currentBalanceSign" character varying NOT NULL, CONSTRAINT "PK_b482dad15becff9a89ad707dcbe" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "category_entity" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "primary" character varying NOT NULL, "detailed" character varying NOT NULL, "description" character varying NOT NULL, CONSTRAINT "UQ_category_primary_detailed" UNIQUE ("primary", "detailed"), CONSTRAINT "PK_1a38b9007ed8afab85026703a53" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "transaction_entity" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "userId" uuid NOT NULL, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "accountId" uuid NOT NULL, "merchantName" character varying, "pending" boolean NOT NULL, "externalTransactionId" character varying, "logoUrl" character varying, "date" date NOT NULL, "datetime" TIMESTAMP WITH TIME ZONE, "authorizedDate" date, "authorizedDatetime" TIMESTAMP WITH TIME ZONE, "categoryId" uuid, "amountAmount" bigint NOT NULL, "amountCurrency" character varying NOT NULL, "amountSign" character varying NOT NULL, CONSTRAINT "UQ_3262fbecb7b4fb5de8a7baefeed" UNIQUE ("accountId", "externalTransactionId"), CONSTRAINT "PK_6f9d7f02d8835ac9ef1f685a2e8" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "exchange_rate_entity" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "baseCurrency" character varying NOT NULL, "targetCurrency" character varying NOT NULL, "rate" numeric(20,10) NOT NULL, "rateDate" date NOT NULL, CONSTRAINT "UQ_ea4425b568daa9977b88a783da7" UNIQUE ("baseCurrency", "targetCurrency", "rateDate"), CONSTRAINT "PK_845112f8d56154f1e2735585b2e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_86d785a51e45fbfb0f41182bee" ON "exchange_rate_entity" ("rateDate") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f5d928c18e89da66c21c2176a9" ON "exchange_rate_entity" ("baseCurrency", "targetCurrency") `,
    );
    await queryRunner.query(
      `CREATE TABLE "balance_snapshot_entity" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "userId" uuid NOT NULL, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "accountId" uuid NOT NULL, "snapshotDate" date NOT NULL, "snapshotType" character varying NOT NULL, "currentBalanceAmount" bigint NOT NULL, "currentBalanceCurrency" character varying NOT NULL, "currentBalanceSign" character varying NOT NULL, "availableBalanceAmount" bigint NOT NULL, "availableBalanceCurrency" character varying NOT NULL, "availableBalanceSign" character varying NOT NULL, CONSTRAINT "UQ_4aa8e3a1519c764a6f4ebb2e97c" UNIQUE ("accountId", "snapshotDate"), CONSTRAINT "PK_b9d16eb4814be222f64a1439b30" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "refresh_token" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "token" character varying NOT NULL, "userId" uuid NOT NULL, "expiresAt" TIMESTAMP NOT NULL, "revoked" boolean NOT NULL DEFAULT false, CONSTRAINT "UQ_c31d0a2f38e6e99110df62ab0af" UNIQUE ("token"), CONSTRAINT "PK_b575dd3c21fb0831013c909e7fe" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "webhook_event_entity" ADD CONSTRAINT "FK_fefd4a8c9e2833b6869789daebe" FOREIGN KEY ("userId") REFERENCES "user_entity"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "bank_link_entity" ADD CONSTRAINT "FK_0d30dbdb766913e5ae37248cc26" FOREIGN KEY ("userId") REFERENCES "user_entity"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "account_entity" ADD CONSTRAINT "FK_28df40c00a5e78d969489989531" FOREIGN KEY ("userId") REFERENCES "user_entity"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "account_entity" ADD CONSTRAINT "FK_6c1372876d02f62cdc56b75ef5e" FOREIGN KEY ("bankLinkId") REFERENCES "bank_link_entity"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction_entity" ADD CONSTRAINT "FK_d6703c8f1c01fde6ed20abb26eb" FOREIGN KEY ("userId") REFERENCES "user_entity"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction_entity" ADD CONSTRAINT "FK_bfca99de153d19e8471fcfea0fb" FOREIGN KEY ("accountId") REFERENCES "account_entity"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction_entity" ADD CONSTRAINT "FK_ed44524e7e60f910e6d5f419eee" FOREIGN KEY ("categoryId") REFERENCES "category_entity"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "balance_snapshot_entity" ADD CONSTRAINT "FK_52be8360ac4a22e22cda2d174ca" FOREIGN KEY ("userId") REFERENCES "user_entity"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "balance_snapshot_entity" ADD CONSTRAINT "FK_20d7a769e56437e904372835d43" FOREIGN KEY ("accountId") REFERENCES "account_entity"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_token" ADD CONSTRAINT "FK_8e913e288156c133999341156ad" FOREIGN KEY ("userId") REFERENCES "user_entity"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "refresh_token" DROP CONSTRAINT "FK_8e913e288156c133999341156ad"`,
    );
    await queryRunner.query(
      `ALTER TABLE "balance_snapshot_entity" DROP CONSTRAINT "FK_20d7a769e56437e904372835d43"`,
    );
    await queryRunner.query(
      `ALTER TABLE "balance_snapshot_entity" DROP CONSTRAINT "FK_52be8360ac4a22e22cda2d174ca"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction_entity" DROP CONSTRAINT "FK_ed44524e7e60f910e6d5f419eee"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction_entity" DROP CONSTRAINT "FK_bfca99de153d19e8471fcfea0fb"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction_entity" DROP CONSTRAINT "FK_d6703c8f1c01fde6ed20abb26eb"`,
    );
    await queryRunner.query(
      `ALTER TABLE "account_entity" DROP CONSTRAINT "FK_6c1372876d02f62cdc56b75ef5e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "account_entity" DROP CONSTRAINT "FK_28df40c00a5e78d969489989531"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bank_link_entity" DROP CONSTRAINT "FK_0d30dbdb766913e5ae37248cc26"`,
    );
    await queryRunner.query(
      `ALTER TABLE "webhook_event_entity" DROP CONSTRAINT "FK_fefd4a8c9e2833b6869789daebe"`,
    );
    await queryRunner.query(`DROP TABLE "refresh_token"`);
    await queryRunner.query(`DROP TABLE "balance_snapshot_entity"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_f5d928c18e89da66c21c2176a9"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_86d785a51e45fbfb0f41182bee"`);
    await queryRunner.query(`DROP TABLE "exchange_rate_entity"`);
    await queryRunner.query(`DROP TABLE "transaction_entity"`);
    await queryRunner.query(`DROP TABLE "category_entity"`);
    await queryRunner.query(`DROP TABLE "account_entity"`);
    await queryRunner.query(`DROP TABLE "bank_link_entity"`);
    await queryRunner.query(`DROP TABLE "webhook_event_entity"`);
    await queryRunner.query(`DROP TABLE "user_entity"`);
  }
}
