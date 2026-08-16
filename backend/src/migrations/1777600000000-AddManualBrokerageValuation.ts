import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddManualBrokerageValuation1777600000000
  implements MigrationInterface
{
  name = 'AddManualBrokerageValuation1777600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "account_entity" ADD "valuationMode" character varying NOT NULL DEFAULT 'balance'`,
    );
    await queryRunner.query(
      `ALTER TABLE "account_entity" ADD CONSTRAINT "CHK_account_valuation_mode" CHECK ("valuationMode" IN ('balance', 'holdings'))`,
    );
    await queryRunner.query(
      `ALTER TABLE "investment_holding_snapshot_entity" ADD "accountCurrency" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "investment_holding_snapshot_entity" ADD "exchangeRateToAccountCurrency" numeric(30,12)`,
    );
    await queryRunner.query(
      `ALTER TABLE "investment_holding_snapshot_entity" ADD "accountValue" numeric(30,12)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "investment_holding_snapshot_entity" DROP COLUMN "accountValue"`,
    );
    await queryRunner.query(
      `ALTER TABLE "investment_holding_snapshot_entity" DROP COLUMN "exchangeRateToAccountCurrency"`,
    );
    await queryRunner.query(
      `ALTER TABLE "investment_holding_snapshot_entity" DROP COLUMN "accountCurrency"`,
    );
    await queryRunner.query(
      `ALTER TABLE "account_entity" DROP CONSTRAINT "CHK_account_valuation_mode"`,
    );
    await queryRunner.query(
      `ALTER TABLE "account_entity" DROP COLUMN "valuationMode"`,
    );
  }
}
