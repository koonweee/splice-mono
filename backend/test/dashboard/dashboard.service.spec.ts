import { Test, TestingModule } from '@nestjs/testing';
import { AccountType } from 'plaid';
import { AccountService } from '../../src/account/account.service';
import { BalanceSnapshotService } from '../../src/balance-snapshot/balance-snapshot.service';
import { DashboardService } from '../../src/dashboard/dashboard.service';
import { TimePeriod } from '../../src/types/Dashboard';
import { MoneySign } from '../../src/types/MoneyWithSign';
import {
  createMockAccountWithConversion,
  createMockSnapshotWithConversion,
  mockCheckingAccount,
  mockCreditCardAccount,
  mockSavingsAccount,
  mockUserId,
} from '../mocks/dashboard/dashboard.mock';

describe('DashboardService', () => {
  let service: DashboardService;
  let accountService: {
    findAllWithConversion: jest.Mock;
  };
  let balanceSnapshotService: {
    findSnapshotsNearDateWithConversion: jest.Mock;
  };

  beforeEach(async () => {
    accountService = {
      findAllWithConversion: jest.fn(),
    };
    balanceSnapshotService = {
      findSnapshotsNearDateWithConversion: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        {
          provide: AccountService,
          useValue: accountService,
        },
        {
          provide: BalanceSnapshotService,
          useValue: balanceSnapshotService,
        },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getSummary', () => {
    it('should return dashboard summary with net worth calculated from assets', async () => {
      accountService.findAllWithConversion.mockResolvedValue([
        mockCheckingAccount,
      ]);
      balanceSnapshotService.findSnapshotsNearDateWithConversion.mockResolvedValue(
        new Map(),
      );

      const result = await service.getSummary(mockUserId);

      expect(result.netWorth.money.amount).toBe(100000); // $1,000 in cents
      expect(result.netWorth.money.currency).toBe('USD');
      expect(result.netWorth.sign).toBe(MoneySign.POSITIVE);
      expect(result.assets).toHaveLength(1);
      expect(result.assets[0].id).toBe('checking-1');
      expect(result.liabilities).toHaveLength(0);
    });

    it('should calculate net worth with multiple asset accounts', async () => {
      accountService.findAllWithConversion.mockResolvedValue([
        mockCheckingAccount,
        mockSavingsAccount,
      ]);
      balanceSnapshotService.findSnapshotsNearDateWithConversion.mockResolvedValue(
        new Map(),
      );

      const result = await service.getSummary(mockUserId);

      expect(result.netWorth.money.amount).toBe(600000); // $1,000 + $5,000 in cents
      expect(result.netWorth.sign).toBe(MoneySign.POSITIVE);
      expect(result.assets).toHaveLength(2);
    });

    it('should subtract liabilities from net worth', async () => {
      accountService.findAllWithConversion.mockResolvedValue([
        mockCheckingAccount, // $1,000 asset
        mockCreditCardAccount, // $500 liability
      ]);
      balanceSnapshotService.findSnapshotsNearDateWithConversion.mockResolvedValue(
        new Map(),
      );

      const result = await service.getSummary(mockUserId);

      expect(result.netWorth.money.amount).toBe(50000); // $1,000 - $500 = $500 in cents
      expect(result.netWorth.sign).toBe(MoneySign.POSITIVE);
      expect(result.assets).toHaveLength(1);
      expect(result.liabilities).toHaveLength(1);
    });

    it('should return null changePercent when no previous snapshots exist', async () => {
      accountService.findAllWithConversion.mockResolvedValue([
        mockCheckingAccount,
      ]);
      balanceSnapshotService.findSnapshotsNearDateWithConversion.mockResolvedValue(
        new Map(),
      );

      const result = await service.getSummary(mockUserId);

      expect(result.changePercent).toBeNull();
      expect(result.assets[0].changePercent).toBeNull();
    });

    it('should calculate MoM change when previous snapshots exist', async () => {
      const account = createMockAccountWithConversion({
        id: 'account-1',
        currentBalanceAmount: 110000, // $1,100 current
      });

      const previousSnapshot = createMockSnapshotWithConversion({
        accountId: 'account-1',
        currentBalanceAmount: 100000, // $1,000 previous
        snapshotDate: getDateDaysAgo(30),
      });

      accountService.findAllWithConversion.mockResolvedValue([account]);
      balanceSnapshotService.findSnapshotsNearDateWithConversion.mockResolvedValue(
        new Map([['account-1', previousSnapshot]]),
      );

      const result = await service.getSummary(mockUserId);

      // 10% increase: (1100 - 1000) / 1000 * 100 = 10
      expect(result.changePercent).toBe(10);
      expect(result.assets[0].changePercent).toBe(10);
    });

    it('should handle negative MoM change', async () => {
      const account = createMockAccountWithConversion({
        id: 'account-1',
        currentBalanceAmount: 90000, // $900 current
      });

      const previousSnapshot = createMockSnapshotWithConversion({
        accountId: 'account-1',
        currentBalanceAmount: 100000, // $1,000 previous
        snapshotDate: getDateDaysAgo(30),
      });

      accountService.findAllWithConversion.mockResolvedValue([account]);
      balanceSnapshotService.findSnapshotsNearDateWithConversion.mockResolvedValue(
        new Map([['account-1', previousSnapshot]]),
      );

      const result = await service.getSummary(mockUserId);

      // -10% decrease: (900 - 1000) / 1000 * 100 = -10
      expect(result.changePercent).toBe(-10);
    });

    it('should return empty arrays when user has no accounts', async () => {
      accountService.findAllWithConversion.mockResolvedValue([]);
      balanceSnapshotService.findSnapshotsNearDateWithConversion.mockResolvedValue(
        new Map(),
      );

      const result = await service.getSummary(mockUserId);

      expect(result.netWorth.money.amount).toBe(0);
      expect(result.netWorth.sign).toBe(MoneySign.POSITIVE);
      expect(result.assets).toEqual([]);
      expect(result.liabilities).toEqual([]);
      expect(result.changePercent).toBeNull();
    });

    it('should handle negative sign balances correctly', async () => {
      const negativeAccount = createMockAccountWithConversion({
        id: 'account-1',
        currentBalanceAmount: 100000,
        currentBalanceSign: MoneySign.NEGATIVE,
      });

      accountService.findAllWithConversion.mockResolvedValue([negativeAccount]);
      balanceSnapshotService.findSnapshotsNearDateWithConversion.mockResolvedValue(
        new Map(),
      );

      const result = await service.getSummary(mockUserId);

      // Negative sign means negative balance, but for depository it's treated as asset
      expect(result.netWorth.money.amount).toBe(100000); // $1,000 in cents (absolute value)
      expect(result.netWorth.sign).toBe(MoneySign.NEGATIVE);
    });

    it('should categorize account types correctly', async () => {
      const depositoryAccount = createMockAccountWithConversion({
        id: 'depository-1',
        type: AccountType.Depository,
        currentBalanceAmount: 100000,
      });
      const investmentAccount = createMockAccountWithConversion({
        id: 'investment-1',
        type: AccountType.Investment,
        currentBalanceAmount: 200000,
      });
      const creditAccount = createMockAccountWithConversion({
        id: 'credit-1',
        type: AccountType.Credit,
        currentBalanceAmount: 50000,
      });
      const loanAccount = createMockAccountWithConversion({
        id: 'loan-1',
        type: AccountType.Loan,
        currentBalanceAmount: 100000,
      });

      accountService.findAllWithConversion.mockResolvedValue([
        depositoryAccount,
        investmentAccount,
        creditAccount,
        loanAccount,
      ]);
      balanceSnapshotService.findSnapshotsNearDateWithConversion.mockResolvedValue(
        new Map(),
      );

      const result = await service.getSummary(mockUserId);

      // Assets: depository ($1,000) + investment ($2,000) = $3,000
      // Liabilities: credit ($500) + loan ($1,000) = $1,500
      // Net worth: $3,000 - $1,500 = $1,500
      expect(result.netWorth.money.amount).toBe(150000); // $1,500 in cents
      expect(result.netWorth.sign).toBe(MoneySign.POSITIVE);
      expect(result.assets).toHaveLength(2);
      expect(result.liabilities).toHaveLength(2);
    });

    it('should default to MONTH comparison period', async () => {
      accountService.findAllWithConversion.mockResolvedValue([
        mockCheckingAccount,
      ]);
      balanceSnapshotService.findSnapshotsNearDateWithConversion.mockResolvedValue(
        new Map(),
      );

      const result = await service.getSummary(mockUserId);

      expect(result.comparisonPeriod).toBe(TimePeriod.MONTH);
    });

    it('should use DAY period when specified', async () => {
      const account = createMockAccountWithConversion({
        id: 'account-1',
        currentBalanceAmount: 110000, // $1,100 current
      });

      const yesterdaySnapshot = createMockSnapshotWithConversion({
        accountId: 'account-1',
        currentBalanceAmount: 100000, // $1,000 yesterday
        snapshotDate: getDateDaysAgo(1),
      });

      accountService.findAllWithConversion.mockResolvedValue([account]);
      balanceSnapshotService.findSnapshotsNearDateWithConversion.mockResolvedValue(
        new Map([['account-1', yesterdaySnapshot]]),
      );

      const result = await service.getSummary(mockUserId, TimePeriod.DAY);

      expect(result.comparisonPeriod).toBe(TimePeriod.DAY);
      expect(result.changePercent).toBe(10); // 10% increase from yesterday
    });

    it('should use WEEK period when specified', async () => {
      const account = createMockAccountWithConversion({
        id: 'account-1',
        currentBalanceAmount: 107000, // $1,070 current
      });

      const weekAgoSnapshot = createMockSnapshotWithConversion({
        accountId: 'account-1',
        currentBalanceAmount: 100000, // $1,000 week ago
        snapshotDate: getDateDaysAgo(7),
      });

      accountService.findAllWithConversion.mockResolvedValue([account]);
      balanceSnapshotService.findSnapshotsNearDateWithConversion.mockResolvedValue(
        new Map([['account-1', weekAgoSnapshot]]),
      );

      const result = await service.getSummary(mockUserId, TimePeriod.WEEK);

      expect(result.comparisonPeriod).toBe(TimePeriod.WEEK);
      expect(result.changePercent).toBe(7); // 7% increase from week ago
    });

    it('should use YEAR period when specified', async () => {
      const account = createMockAccountWithConversion({
        id: 'account-1',
        currentBalanceAmount: 120000, // $1,200 current
      });

      const yearAgoSnapshot = createMockSnapshotWithConversion({
        accountId: 'account-1',
        currentBalanceAmount: 100000, // $1,000 year ago
        snapshotDate: getDateDaysAgo(365),
      });

      accountService.findAllWithConversion.mockResolvedValue([account]);
      balanceSnapshotService.findSnapshotsNearDateWithConversion.mockResolvedValue(
        new Map([['account-1', yearAgoSnapshot]]),
      );

      const result = await service.getSummary(mockUserId, TimePeriod.YEAR);

      expect(result.comparisonPeriod).toBe(TimePeriod.YEAR);
      expect(result.changePercent).toBe(20); // 20% increase from year ago
    });

    it('should include convertedCurrentBalance in account summaries', async () => {
      accountService.findAllWithConversion.mockResolvedValue([
        mockCheckingAccount,
      ]);
      balanceSnapshotService.findSnapshotsNearDateWithConversion.mockResolvedValue(
        new Map(),
      );

      const result = await service.getSummary(mockUserId);

      expect(result.assets[0].convertedCurrentBalance).toEqual(
        mockCheckingAccount.convertedCurrentBalance,
      );
    });
  });

  describe('chartData', () => {
    it('should return 6 months of chart data', async () => {
      accountService.findAllWithConversion.mockResolvedValue([
        mockCheckingAccount,
      ]);
      balanceSnapshotService.findSnapshotsNearDateWithConversion.mockResolvedValue(
        new Map(),
      );

      const result = await service.getSummary(mockUserId);

      expect(result.chartData).toHaveLength(6);
    });

    it('should return null values for months without snapshot data', async () => {
      accountService.findAllWithConversion.mockResolvedValue([
        mockCheckingAccount,
      ]);
      balanceSnapshotService.findSnapshotsNearDateWithConversion.mockResolvedValue(
        new Map(),
      );

      const result = await service.getSummary(mockUserId);

      // All chart points should have null values since no snapshots exist
      for (const point of result.chartData) {
        expect(point.value).toBeNull();
      }
    });

    it('should return actual values when snapshots exist', async () => {
      const account = createMockAccountWithConversion({
        id: 'account-1',
        currentBalanceAmount: 100000,
      });

      // Create snapshot for first of current month
      const currentMonthFirst = new Date();
      currentMonthFirst.setDate(1);
      const snapshotDate = currentMonthFirst.toISOString().split('T')[0];

      const snapshot = createMockSnapshotWithConversion({
        accountId: 'account-1',
        snapshotDate,
        currentBalanceAmount: 100000,
      });

      accountService.findAllWithConversion.mockResolvedValue([account]);
      balanceSnapshotService.findSnapshotsNearDateWithConversion.mockImplementation(
        () => {
          return Promise.resolve(new Map([['account-1', snapshot]]));
        },
      );

      const result = await service.getSummary(mockUserId);

      // At least the current month should have data
      const hasNonNullValue = result.chartData.some(
        (point) => point.value !== null,
      );
      expect(hasNonNullValue).toBe(true);
    });

    it('should include date in YYYY-MM-DD format', async () => {
      accountService.findAllWithConversion.mockResolvedValue([]);
      balanceSnapshotService.findSnapshotsNearDateWithConversion.mockResolvedValue(
        new Map(),
      );

      const result = await service.getSummary(mockUserId);

      for (const point of result.chartData) {
        expect(point.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    });
  });
});

/**
 * Helper to get a date string N days ago in YYYY-MM-DD format
 */
function getDateDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().split('T')[0];
}
