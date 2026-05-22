import { AddInvestmentHoldings1776900000000 } from '../../src/migrations/1776900000000-AddInvestmentHoldings';

describe('AddInvestmentHoldings1776900000000', () => {
  it('creates investment security and daily holding snapshot tables with uniqueness constraints', async () => {
    const migration = new AddInvestmentHoldings1776900000000();
    const queryRunner = {
      query: jest.fn().mockResolvedValue(undefined),
    };

    await migration.up(queryRunner as never);

    expect(queryRunner.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining(`CREATE TABLE "investment_security_entity"`),
    );
    expect(queryRunner.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining(
        `CONSTRAINT "UQ_investment_security_user_provider_external" UNIQUE ("userId", "provider", "externalSecurityId")`,
      ),
    );
    expect(queryRunner.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining(
        `CREATE TABLE "investment_holding_snapshot_entity"`,
      ),
    );
    expect(queryRunner.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining(
        `CONSTRAINT "UQ_investment_holding_account_date_security" UNIQUE ("accountId", "snapshotDate", "securityId")`,
      ),
    );
    expect(queryRunner.query).toHaveBeenNthCalledWith(
      3,
      `CREATE INDEX "IDX_investment_security_user_provider" ON "investment_security_entity" ("userId", "provider")`,
    );
    expect(queryRunner.query).toHaveBeenNthCalledWith(
      4,
      `CREATE INDEX "IDX_investment_holding_user_account_date" ON "investment_holding_snapshot_entity" ("userId", "accountId", "snapshotDate")`,
    );
  });

  it('drops investment holding schema on rollback', async () => {
    const migration = new AddInvestmentHoldings1776900000000();
    const queryRunner = {
      query: jest.fn().mockResolvedValue(undefined),
    };

    await migration.down(queryRunner as never);

    expect(queryRunner.query).toHaveBeenLastCalledWith(
      `DROP TABLE "investment_security_entity"`,
    );
    expect(queryRunner.query).toHaveBeenCalledWith(
      `DROP TABLE "investment_holding_snapshot_entity"`,
    );
  });
});
