import { AddManualBrokerageValuation1777600000000 } from '../../src/migrations/1777600000000-AddManualBrokerageValuation';

describe('AddManualBrokerageValuation1777600000000', () => {
  it('adds a backward-compatible valuation mode and holding normalization columns', async () => {
    const migration = new AddManualBrokerageValuation1777600000000();
    const queryRunner = { query: jest.fn().mockResolvedValue(undefined) };

    await migration.up(queryRunner as never);

    expect(queryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining(
        `"valuationMode" character varying NOT NULL DEFAULT 'balance'`,
      ),
    );
    expect(queryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining(
        `CHECK ("valuationMode" IN ('balance', 'holdings'))`,
      ),
    );
    expect(queryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining(`ADD "accountCurrency" character varying`),
    );
    expect(queryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining(
        `ADD "exchangeRateToAccountCurrency" numeric(30,12)`,
      ),
    );
    expect(queryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining(`ADD "accountValue" numeric(30,12)`),
    );
  });

  it('removes every new column and constraint on rollback', async () => {
    const migration = new AddManualBrokerageValuation1777600000000();
    const queryRunner = { query: jest.fn().mockResolvedValue(undefined) };

    await migration.down(queryRunner as never);

    expect(queryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining(`DROP COLUMN "accountValue"`),
    );
    expect(queryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining(`DROP CONSTRAINT "CHK_account_valuation_mode"`),
    );
    expect(queryRunner.query).toHaveBeenLastCalledWith(
      expect.stringContaining(`DROP COLUMN "valuationMode"`),
    );
  });
});
