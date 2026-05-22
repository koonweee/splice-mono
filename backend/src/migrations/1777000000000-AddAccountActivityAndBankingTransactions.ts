import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAccountActivityAndBankingTransactions1777000000000
  implements MigrationInterface
{
  name = 'AddAccountActivityAndBankingTransactions1777000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "account_activity_entity" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "userId" uuid NOT NULL, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "accountId" uuid NOT NULL, "provider" character varying NOT NULL, "externalActivityId" character varying, "activityKind" character varying NOT NULL, "activityDate" date NOT NULL, "providerDate" date NOT NULL, "providerDatetime" TIMESTAMP WITH TIME ZONE, "amountAmount" bigint NOT NULL, "amountCurrency" character varying NOT NULL, "amountSign" character varying NOT NULL, CONSTRAINT "PK_account_activity_entity" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "banking_transaction_entity" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "activityId" uuid NOT NULL, "source" character varying NOT NULL DEFAULT 'provider', "merchantName" character varying, "providerTransactionName" character varying, "originalDescription" character varying, "pending" boolean NOT NULL, "pendingTransactionId" character varying, "accountOwner" character varying, "logoUrl" character varying, "website" character varying, "merchantEntityId" character varying, "paymentChannel" character varying, "transactionCode" character varying, "personalFinanceCategoryIconUrl" character varying, "personalFinanceCategoryConfidenceLevel" character varying, "providerCategoryProvider" character varying, "providerCategoryPrimary" character varying, "providerCategoryDetailed" character varying, "counterparties" jsonb, "location" jsonb, "paymentMeta" jsonb, "providerPayload" jsonb, "authorizedDate" date, "authorizedDatetime" TIMESTAMP WITH TIME ZONE, "reportingDateOverride" date, "categoryId" uuid, "categoryUpdatedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_banking_transaction_entity" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "investment_transaction_entity" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "userId" uuid NOT NULL, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "activityId" uuid NOT NULL, "securityId" uuid, "externalSecurityId" character varying, "name" character varying NOT NULL, "quantity" numeric(30,12) NOT NULL, "price" numeric(30,12) NOT NULL, "fees" numeric(30,12), "investmentType" character varying NOT NULL, "investmentSubtype" character varying NOT NULL, "cancelExternalActivityId" character varying, "providerPayload" jsonb, CONSTRAINT "PK_investment_transaction_entity" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_account_activity_user_date_id" ON "account_activity_entity" ("userId", "activityDate", "id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_account_activity_account_date" ON "account_activity_entity" ("accountId", "activityDate")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_account_activity_provider_identity" ON "account_activity_entity" ("userId", "accountId", "provider", "activityKind", "externalActivityId")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_account_activity_provider_external" ON "account_activity_entity" ("userId", "accountId", "provider", "activityKind", "externalActivityId") WHERE "externalActivityId" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_banking_transaction_activity" ON "banking_transaction_entity" ("activityId")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_investment_transaction_activity" ON "investment_transaction_entity" ("activityId")`,
    );
    await queryRunner.query(
      `INSERT INTO "account_activity_entity" ("createdAt", "updatedAt", "userId", "id", "accountId", "provider", "externalActivityId", "activityKind", "activityDate", "providerDate", "providerDatetime", "amountAmount", "amountCurrency", "amountSign")
       SELECT "createdAt", "updatedAt", "userId", "id", "accountId", CASE WHEN "source" = 'manual' THEN 'manual' ELSE 'plaid' END, "externalTransactionId", 'banking_transaction', COALESCE("reportingDateOverride", "authorizedDate", "providerDate"), "providerDate", "providerDatetime", "amountAmount", "amountCurrency", "amountSign"
       FROM "transaction_entity"`,
    );
    await queryRunner.query(
      `INSERT INTO "banking_transaction_entity" ("createdAt", "updatedAt", "id", "activityId", "source", "merchantName", "providerTransactionName", "originalDescription", "pending", "pendingTransactionId", "accountOwner", "logoUrl", "website", "merchantEntityId", "paymentChannel", "transactionCode", "personalFinanceCategoryIconUrl", "personalFinanceCategoryConfidenceLevel", "providerCategoryProvider", "providerCategoryPrimary", "providerCategoryDetailed", "counterparties", "location", "paymentMeta", "authorizedDate", "authorizedDatetime", "reportingDateOverride", "categoryId", "categoryUpdatedAt")
       SELECT "createdAt", "updatedAt", "id", "id", "source", "merchantName", "providerTransactionName", "originalDescription", "pending", "pendingTransactionId", "accountOwner", "logoUrl", "website", "merchantEntityId", "paymentChannel", "transactionCode", "personalFinanceCategoryIconUrl", "personalFinanceCategoryConfidenceLevel", "providerCategoryProvider", "providerCategoryPrimary", "providerCategoryDetailed", "counterparties", "location", "paymentMeta", "authorizedDate", "authorizedDatetime", "reportingDateOverride", "categoryId", "categoryUpdatedAt"
       FROM "transaction_entity"`,
    );
    await queryRunner.query(`DROP TABLE "transaction_entity" CASCADE`);
    await queryRunner.query(
      `ALTER TABLE "account_activity_entity" ADD CONSTRAINT "FK_account_activity_user" FOREIGN KEY ("userId") REFERENCES "user_entity"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "account_activity_entity" ADD CONSTRAINT "FK_account_activity_account" FOREIGN KEY ("accountId") REFERENCES "account_entity"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "banking_transaction_entity" ADD CONSTRAINT "FK_banking_transaction_activity" FOREIGN KEY ("activityId") REFERENCES "account_activity_entity"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "banking_transaction_entity" ADD CONSTRAINT "FK_banking_transaction_category" FOREIGN KEY ("categoryId") REFERENCES "category_entity"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "investment_transaction_entity" ADD CONSTRAINT "FK_investment_transaction_user" FOREIGN KEY ("userId") REFERENCES "user_entity"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "investment_transaction_entity" ADD CONSTRAINT "FK_investment_transaction_activity" FOREIGN KEY ("activityId") REFERENCES "account_activity_entity"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "investment_transaction_entity" ADD CONSTRAINT "FK_investment_transaction_security" FOREIGN KEY ("securityId") REFERENCES "investment_security_entity"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "transaction_entity" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "userId" uuid NOT NULL, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "source" character varying NOT NULL DEFAULT 'provider', "accountId" uuid NOT NULL, "merchantName" character varying, "providerTransactionName" character varying, "originalDescription" character varying, "pending" boolean NOT NULL, "pendingTransactionId" character varying, "accountOwner" character varying, "externalTransactionId" character varying, "logoUrl" character varying, "website" character varying, "merchantEntityId" character varying, "paymentChannel" character varying, "transactionCode" character varying, "personalFinanceCategoryIconUrl" character varying, "personalFinanceCategoryConfidenceLevel" character varying, "providerCategoryProvider" character varying, "providerCategoryPrimary" character varying, "providerCategoryDetailed" character varying, "counterparties" jsonb, "location" jsonb, "paymentMeta" jsonb, "providerDate" date NOT NULL, "providerDatetime" TIMESTAMP WITH TIME ZONE, "authorizedDate" date, "authorizedDatetime" TIMESTAMP WITH TIME ZONE, "reportingDateOverride" date, "categoryId" uuid, "categoryUpdatedAt" TIMESTAMP WITH TIME ZONE, "amountAmount" bigint NOT NULL, "amountCurrency" character varying NOT NULL, "amountSign" character varying NOT NULL, CONSTRAINT "PK_6f9d7f02d8835ac9ef1f685a2e8" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `INSERT INTO "transaction_entity" ("createdAt", "updatedAt", "userId", "id", "source", "accountId", "merchantName", "providerTransactionName", "originalDescription", "pending", "pendingTransactionId", "accountOwner", "externalTransactionId", "logoUrl", "website", "merchantEntityId", "paymentChannel", "transactionCode", "personalFinanceCategoryIconUrl", "personalFinanceCategoryConfidenceLevel", "providerCategoryProvider", "providerCategoryPrimary", "providerCategoryDetailed", "counterparties", "location", "paymentMeta", "providerDate", "providerDatetime", "authorizedDate", "authorizedDatetime", "reportingDateOverride", "categoryId", "categoryUpdatedAt", "amountAmount", "amountCurrency", "amountSign")
       SELECT activity."createdAt", activity."updatedAt", activity."userId", banking."id", banking."source", activity."accountId", banking."merchantName", banking."providerTransactionName", banking."originalDescription", banking."pending", banking."pendingTransactionId", banking."accountOwner", activity."externalActivityId", banking."logoUrl", banking."website", banking."merchantEntityId", banking."paymentChannel", banking."transactionCode", banking."personalFinanceCategoryIconUrl", banking."personalFinanceCategoryConfidenceLevel", banking."providerCategoryProvider", banking."providerCategoryPrimary", banking."providerCategoryDetailed", banking."counterparties", banking."location", banking."paymentMeta", activity."providerDate", activity."providerDatetime", banking."authorizedDate", banking."authorizedDatetime", banking."reportingDateOverride", banking."categoryId", banking."categoryUpdatedAt", activity."amountAmount", activity."amountCurrency", activity."amountSign"
       FROM "banking_transaction_entity" banking
       INNER JOIN "account_activity_entity" activity ON activity."id" = banking."activityId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "banking_transaction_entity" DROP CONSTRAINT "FK_banking_transaction_category"`,
    );
    await queryRunner.query(
      `ALTER TABLE "investment_transaction_entity" DROP CONSTRAINT "FK_investment_transaction_security"`,
    );
    await queryRunner.query(
      `ALTER TABLE "investment_transaction_entity" DROP CONSTRAINT "FK_investment_transaction_activity"`,
    );
    await queryRunner.query(
      `ALTER TABLE "investment_transaction_entity" DROP CONSTRAINT "FK_investment_transaction_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "banking_transaction_entity" DROP CONSTRAINT "FK_banking_transaction_activity"`,
    );
    await queryRunner.query(
      `ALTER TABLE "account_activity_entity" DROP CONSTRAINT "FK_account_activity_account"`,
    );
    await queryRunner.query(
      `ALTER TABLE "account_activity_entity" DROP CONSTRAINT "FK_account_activity_user"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."UQ_banking_transaction_activity"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."UQ_investment_transaction_activity"`,
    );
    await queryRunner.query(`DROP TABLE "banking_transaction_entity"`);
    await queryRunner.query(`DROP TABLE "investment_transaction_entity"`);
    await queryRunner.query(
      `DROP INDEX "public"."UQ_account_activity_provider_external"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_account_activity_provider_identity"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_account_activity_account_date"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_account_activity_user_date_id"`,
    );
    await queryRunner.query(`DROP TABLE "account_activity_entity"`);
    await queryRunner.query(
      `ALTER TABLE "transaction_entity" ADD CONSTRAINT "UQ_3262fbecb7b4fb5de8a7baefeed" UNIQUE ("accountId", "externalTransactionId")`,
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
  }
}
