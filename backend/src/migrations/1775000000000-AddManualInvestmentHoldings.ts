import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddManualInvestmentHoldings1775000000000
  implements MigrationInterface
{
  name = 'AddManualInvestmentHoldings1775000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "account_entity" ADD "manualValuationMode" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "account_entity" ADD "lastUserSnapshotAt" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "account_entity" ADD "lastValuationAt" TIMESTAMP WITH TIME ZONE`,
    );

    await queryRunner.query(
      `CREATE TABLE "security_instrument_entity" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "symbol" character varying NOT NULL, "providerName" character varying NOT NULL, "providerSymbol" character varying NOT NULL, "exchange" character varying, "priceCurrency" character varying NOT NULL, "displayName" character varying, CONSTRAINT "UQ_9d9390ce2f6f26a16cf4c6d55d9" UNIQUE ("providerName", "providerSymbol"), CONSTRAINT "PK_a7a23e8ec2c6370d36a27071f50" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_b07e9b9ea9d6dc8da709b44d12" ON "security_instrument_entity" ("symbol") `,
    );

    await queryRunner.query(
      `CREATE TABLE "security_price_daily_entity" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "instrumentId" uuid NOT NULL, "priceDate" date NOT NULL, "closePrice" numeric(20,8) NOT NULL, "priceCurrency" character varying NOT NULL, CONSTRAINT "UQ_6d02827503c35a41fd8aa502f7c" UNIQUE ("instrumentId", "priceDate"), CONSTRAINT "PK_9b2e2ba8f5bffcbf0e58d2aa863" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_6ba6de318c04b98c07d4035787" ON "security_price_daily_entity" ("instrumentId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_a4eac6f9b1ed2236a8f823010d" ON "security_price_daily_entity" ("priceDate") `,
    );

    await queryRunner.query(
      `CREATE TABLE "manual_investment_snapshot_entity" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "userId" uuid NOT NULL, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "accountId" uuid NOT NULL, "snapshotDate" date NOT NULL, "cashBalanceAmount" bigint NOT NULL, "cashBalanceCurrency" character varying NOT NULL, "cashBalanceSign" character varying NOT NULL, CONSTRAINT "UQ_86ee35ed3652ce302753caf39ca" UNIQUE ("accountId", "snapshotDate"), CONSTRAINT "PK_58319ce6c3190f8671f89836b14" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "manual_investment_holding_entity" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "snapshotId" uuid NOT NULL, "instrumentId" uuid NOT NULL, "symbol" character varying NOT NULL, "displayName" character varying, "quantity" numeric(20,8) NOT NULL, CONSTRAINT "UQ_ab4a5643df26e1fd58f4fd2cde6" UNIQUE ("snapshotId", "instrumentId"), CONSTRAINT "PK_eb08a03f1184cf9501bd679a0fa" PRIMARY KEY ("id"))`,
    );

    await queryRunner.query(
      `ALTER TABLE "security_price_daily_entity" ADD CONSTRAINT "FK_d19b9e0aa7a85bc24a1152d23f1" FOREIGN KEY ("instrumentId") REFERENCES "security_instrument_entity"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "manual_investment_snapshot_entity" ADD CONSTRAINT "FK_2c88acd02a2b637679fb5c54cbf" FOREIGN KEY ("userId") REFERENCES "user_entity"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "manual_investment_snapshot_entity" ADD CONSTRAINT "FK_8dff04dfaf039479f474d4db314" FOREIGN KEY ("accountId") REFERENCES "account_entity"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "manual_investment_holding_entity" ADD CONSTRAINT "FK_4ec2d88c2ee7e594173adf8ebdc" FOREIGN KEY ("snapshotId") REFERENCES "manual_investment_snapshot_entity"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "manual_investment_holding_entity" ADD CONSTRAINT "FK_54ed71ec85dd79d96ddd77d5ec1" FOREIGN KEY ("instrumentId") REFERENCES "security_instrument_entity"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "manual_investment_holding_entity" DROP CONSTRAINT "FK_54ed71ec85dd79d96ddd77d5ec1"`,
    );
    await queryRunner.query(
      `ALTER TABLE "manual_investment_holding_entity" DROP CONSTRAINT "FK_4ec2d88c2ee7e594173adf8ebdc"`,
    );
    await queryRunner.query(
      `ALTER TABLE "manual_investment_snapshot_entity" DROP CONSTRAINT "FK_8dff04dfaf039479f474d4db314"`,
    );
    await queryRunner.query(
      `ALTER TABLE "manual_investment_snapshot_entity" DROP CONSTRAINT "FK_2c88acd02a2b637679fb5c54cbf"`,
    );
    await queryRunner.query(
      `ALTER TABLE "security_price_daily_entity" DROP CONSTRAINT "FK_d19b9e0aa7a85bc24a1152d23f1"`,
    );
    await queryRunner.query(`DROP TABLE "manual_investment_holding_entity"`);
    await queryRunner.query(`DROP TABLE "manual_investment_snapshot_entity"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_a4eac6f9b1ed2236a8f823010d"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_6ba6de318c04b98c07d4035787"`,
    );
    await queryRunner.query(`DROP TABLE "security_price_daily_entity"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_b07e9b9ea9d6dc8da709b44d12"`,
    );
    await queryRunner.query(`DROP TABLE "security_instrument_entity"`);
    await queryRunner.query(
      `ALTER TABLE "account_entity" DROP COLUMN "lastValuationAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "account_entity" DROP COLUMN "lastUserSnapshotAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "account_entity" DROP COLUMN "manualValuationMode"`,
    );
  }
}
