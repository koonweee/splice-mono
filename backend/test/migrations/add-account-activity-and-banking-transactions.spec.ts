import { AddAccountActivityAndBankingTransactions1777000000000 } from '../../src/migrations/1777000000000-AddAccountActivityAndBankingTransactions';

describe('AddAccountActivityAndBankingTransactions1777000000000', () => {
  it('creates account activity and banking transaction tables with provider uniqueness', async () => {
    const migration =
      new AddAccountActivityAndBankingTransactions1777000000000();
    const queryRunner = {
      query: jest.fn().mockResolvedValue(undefined),
    };

    await migration.up(queryRunner as never);

    expect(queryRunner.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining(`CREATE TABLE "account_activity_entity"`),
    );
    expect(queryRunner.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining(`CREATE TABLE "banking_transaction_entity"`),
    );
    expect(queryRunner.query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining(`CREATE TABLE "investment_transaction_entity"`),
    );
    expect(queryRunner.query).toHaveBeenCalledWith(
      `CREATE UNIQUE INDEX "UQ_account_activity_provider_external" ON "account_activity_entity" ("userId", "accountId", "provider", "activityKind", "externalActivityId") WHERE "externalActivityId" IS NOT NULL`,
    );
    expect(queryRunner.query).toHaveBeenCalledWith(
      `CREATE UNIQUE INDEX "UQ_banking_transaction_activity" ON "banking_transaction_entity" ("activityId")`,
    );
    expect(queryRunner.query).toHaveBeenCalledWith(
      `CREATE UNIQUE INDEX "UQ_investment_transaction_activity" ON "investment_transaction_entity" ("activityId")`,
    );
    expect(queryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining(`DROP TABLE "transaction_entity" CASCADE`),
    );
  });

  it('rolls the schema back to transaction_entity', async () => {
    const migration =
      new AddAccountActivityAndBankingTransactions1777000000000();
    const queryRunner = {
      query: jest.fn().mockResolvedValue(undefined),
    };

    await migration.down(queryRunner as never);

    expect(queryRunner.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining(`CREATE TABLE "transaction_entity"`),
    );
    expect(queryRunner.query).toHaveBeenCalledWith(
      `DROP TABLE "banking_transaction_entity"`,
    );
    expect(queryRunner.query).toHaveBeenCalledWith(
      `DROP TABLE "investment_transaction_entity"`,
    );
    expect(queryRunner.query).toHaveBeenCalledWith(
      `DROP TABLE "account_activity_entity"`,
    );
  });
});
