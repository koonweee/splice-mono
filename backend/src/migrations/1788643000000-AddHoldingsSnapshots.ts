import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddHoldingsSnapshots1788643000000 implements MigrationInterface {
  name = 'AddHoldingsSnapshots1788643000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE holdings_snapshot_header_entity (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL REFERENCES user_entity(id) ON DELETE CASCADE,
      "accountId" uuid NOT NULL REFERENCES account_entity(id) ON DELETE CASCADE,
      provider varchar NOT NULL CHECK (provider IN ('plaid','manual')), "snapshotDate" date NOT NULL,
      revision integer NOT NULL DEFAULT 1 CHECK (revision > 0), "completedAt" timestamptz NOT NULL,
      "accountCurrency" varchar, "accountValueAmount" numeric(78,0) CHECK ("accountValueAmount" >= 0), "accountValueSign" varchar,
      "createdAt" timestamp NOT NULL DEFAULT now(), "updatedAt" timestamp NOT NULL DEFAULT now(),
      CONSTRAINT "UQ_holdings_header_account_provider_date" UNIQUE ("accountId",provider,"snapshotDate")
    )`);
    await queryRunner.query(
      `CREATE INDEX "IDX_holdings_header_user_account_date" ON holdings_snapshot_header_entity ("userId","accountId","snapshotDate" DESC)`,
    );
    // Position dates are factual. Provider balance syncs are not evidence that holdings were fetched.
    await queryRunner.query(`INSERT INTO holdings_snapshot_header_entity ("userId","accountId",provider,"snapshotDate","completedAt","createdAt","updatedAt")
      SELECT "userId","accountId",provider,"snapshotDate",max("updatedAt"),min("createdAt"),max("updatedAt")
      FROM investment_holding_snapshot_entity GROUP BY "userId","accountId",provider,"snapshotDate"`);
    // Manual brokerage factual balance rows represent completed valuations, including explicit clears.
    await queryRunner.query(`INSERT INTO holdings_snapshot_header_entity ("userId","accountId",provider,"snapshotDate","completedAt","accountCurrency","accountValueAmount","accountValueSign","createdAt","updatedAt")
      SELECT snapshot."userId",snapshot."accountId",'manual',snapshot."snapshotDate",snapshot."updatedAt",
        snapshot."currentBalanceCurrency",snapshot."currentBalanceAmount",snapshot."currentBalanceSign",snapshot."createdAt",snapshot."updatedAt"
      FROM balance_snapshot_entity snapshot JOIN account_entity account ON account.id=snapshot."accountId" AND account."userId"=snapshot."userId"
      WHERE account."valuationMode"='holdings' AND account."bankLinkId" IS NULL AND snapshot."snapshotType" IN ('USER_UPDATE','MARKET_REFRESH')
      ON CONFLICT ("accountId",provider,"snapshotDate") DO UPDATE SET
        "completedAt"=EXCLUDED."completedAt", "accountCurrency"=EXCLUDED."accountCurrency",
        "accountValueAmount"=EXCLUDED."accountValueAmount", "accountValueSign"=EXCLUDED."accountValueSign", "updatedAt"=EXCLUDED."updatedAt"`);
    await queryRunner.query(
      `ALTER TABLE investment_holding_snapshot_entity ADD "headerId" uuid`,
    );
    await queryRunner.query(`UPDATE investment_holding_snapshot_entity holding SET "headerId"=header.id
      FROM holdings_snapshot_header_entity header WHERE holding."userId"=header."userId" AND holding."accountId"=header."accountId" AND holding.provider=header.provider AND holding."snapshotDate"=header."snapshotDate"`);
    await queryRunner.query(
      `ALTER TABLE investment_holding_snapshot_entity ALTER COLUMN "headerId" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE investment_holding_snapshot_entity ADD CONSTRAINT "FK_holding_completed_header" FOREIGN KEY ("headerId") REFERENCES holdings_snapshot_header_entity(id) ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_holding_header" ON investment_holding_snapshot_entity ("headerId")`,
    );
    await queryRunner.query(`CREATE TABLE investment_sync_state_entity (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL REFERENCES user_entity(id) ON DELETE CASCADE,
      "bankLinkId" uuid NOT NULL REFERENCES bank_link_entity(id) ON DELETE CASCADE,
      kind varchar NOT NULL CHECK (kind IN ('holdings','transactions')),
      "requestedGeneration" bigint NOT NULL DEFAULT 0, "completedGeneration" bigint NOT NULL DEFAULT 0, "completedAt" timestamptz,
      "createdAt" timestamp NOT NULL DEFAULT now(), "updatedAt" timestamp NOT NULL DEFAULT now(),
      CONSTRAINT "UQ_investment_sync_link_kind" UNIQUE ("bankLinkId",kind)
    )`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE investment_sync_state_entity');
    await queryRunner.query(
      'ALTER TABLE investment_holding_snapshot_entity DROP COLUMN "headerId"',
    );
    await queryRunner.query('DROP TABLE holdings_snapshot_header_entity');
  }
}
