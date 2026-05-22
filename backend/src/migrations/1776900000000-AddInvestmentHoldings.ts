import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddInvestmentHoldings1776900000000 implements MigrationInterface {
  name = 'AddInvestmentHoldings1776900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "investment_security_entity" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "userId" uuid NOT NULL, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "provider" character varying NOT NULL, "externalSecurityId" character varying NOT NULL, "institutionId" character varying, "institutionSecurityId" character varying, "name" character varying, "tickerSymbol" character varying, "isin" character varying, "cusip" character varying, "sedol" character varying, "type" character varying, "subtype" character varying, "isCashEquivalent" boolean, "closePrice" numeric(30,12), "closePriceAsOf" date, "updateDatetime" character varying, "isoCurrencyCode" character varying, "unofficialCurrencyCode" character varying, "marketIdentifierCode" character varying, "sector" character varying, "industry" character varying, CONSTRAINT "UQ_investment_security_user_provider_external" UNIQUE ("userId", "provider", "externalSecurityId"), CONSTRAINT "PK_investment_security_entity" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "investment_holding_snapshot_entity" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "userId" uuid NOT NULL, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "accountId" uuid NOT NULL, "securityId" uuid NOT NULL, "provider" character varying NOT NULL, "snapshotDate" date NOT NULL, "quantity" numeric(30,12), "costBasis" numeric(30,12), "institutionPrice" numeric(30,12), "institutionPriceAsOf" date, "institutionPriceDatetime" character varying, "institutionValue" numeric(30,12), "isoCurrencyCode" character varying, "unofficialCurrencyCode" character varying, "vestedQuantity" numeric(30,12), "vestedValue" numeric(30,12), CONSTRAINT "UQ_investment_holding_account_date_security" UNIQUE ("accountId", "snapshotDate", "securityId"), CONSTRAINT "PK_investment_holding_snapshot_entity" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_investment_security_user_provider" ON "investment_security_entity" ("userId", "provider")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_investment_holding_user_account_date" ON "investment_holding_snapshot_entity" ("userId", "accountId", "snapshotDate")`,
    );
    await queryRunner.query(
      `ALTER TABLE "investment_security_entity" ADD CONSTRAINT "FK_investment_security_user" FOREIGN KEY ("userId") REFERENCES "user_entity"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "investment_holding_snapshot_entity" ADD CONSTRAINT "FK_investment_holding_user" FOREIGN KEY ("userId") REFERENCES "user_entity"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "investment_holding_snapshot_entity" ADD CONSTRAINT "FK_investment_holding_account" FOREIGN KEY ("accountId") REFERENCES "account_entity"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "investment_holding_snapshot_entity" ADD CONSTRAINT "FK_investment_holding_security" FOREIGN KEY ("securityId") REFERENCES "investment_security_entity"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "investment_holding_snapshot_entity" DROP CONSTRAINT "FK_investment_holding_security"`,
    );
    await queryRunner.query(
      `ALTER TABLE "investment_holding_snapshot_entity" DROP CONSTRAINT "FK_investment_holding_account"`,
    );
    await queryRunner.query(
      `ALTER TABLE "investment_holding_snapshot_entity" DROP CONSTRAINT "FK_investment_holding_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "investment_security_entity" DROP CONSTRAINT "FK_investment_security_user"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_investment_holding_user_account_date"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_investment_security_user_provider"`,
    );
    await queryRunner.query(`DROP TABLE "investment_holding_snapshot_entity"`);
    await queryRunner.query(`DROP TABLE "investment_security_entity"`);
  }
}
