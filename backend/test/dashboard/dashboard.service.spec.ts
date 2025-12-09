import { Test, TestingModule } from '@nestjs/testing';
import { AccountType } from 'plaid';
import { AccountService } from '../../src/account/account.service';
import { BalanceSnapshotService } from '../../src/balance-snapshot/balance-snapshot.service';
import { DashboardService } from '../../src/dashboard/dashboard.service';
import { TimePeriod } from '../../src/types/Dashboard';
import { MoneySign } from '../../src/types/MoneyWithSign';
import { UserService } from '../../src/user/user.service';
import {
  createMockAccount,
  createMockSnapshotWithConversion,
  mockCheckingAccount,
  mockCheckingSnapshot,
  mockCreditCardAccount,
  mockCreditCardSnapshot,
  mockSavingsAccount,
  mockSavingsSnapshot,
  mockUserId,
} from '../mocks/dashboard/dashboard.mock';
import { mockUserService } from '../mocks/user/user-service.mock';

describe('DashboardService', () => {
  let service: DashboardService;
  let accountService: {
    findAll: jest.Mock;
  };
  let balanceSnapshotService: {
    findSnapshotsForDateWithConversion: jest.Mock;
  };

  beforeEach(async () => {
    accountService = {
      findAll: jest.fn(),
    };
    balanceSnapshotService = {
      findSnapshotsForDateWithConversion: jest.fn(),
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
        {
          provide: UserService,
          useValue: mockUserService,
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
      accountService.findAll.mockResolvedValue([mockCheckingAccount]);
      // Return current snapshot for today (or yesterday as fallback)
      balanceSnapshotService.findSnapshotsForDateWithConversion.mockResolvedValue(
        new Map([['checking-1', mockCheckingSnapshot]]),
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
      accountService.findAll.mockResolvedValue([
        mockCheckingAccount,
        mockSavingsAccount,
      ]);
      balanceSnapshotService.findSnapshotsForDateWithConversion.mockResolvedValue(
        new Map([
          ['checking-1', mockCheckingSnapshot],
          ['savings-1', mockSavingsSnapshot],
        ]),
      );

      const result = await service.getSummary(mockUserId);

      expect(result.netWorth.money.amount).toBe(600000); // $1,000 + $5,000 in cents
      expect(result.netWorth.sign).toBe(MoneySign.POSITIVE);
      expect(result.assets).toHaveLength(2);
    });

    it('should subtract liabilities from net worth', async () => {
      accountService.findAll.mockResolvedValue([
        mockCheckingAccount, // $1,000 asset
        mockCreditCardAccount, // $500 liability
      ]);
      balanceSnapshotService.findSnapshotsForDateWithConversion.mockResolvedValue(
        new Map([
          ['checking-1', mockCheckingSnapshot],
          ['credit-1', mockCreditCardSnapshot],
        ]),
      );

      const result = await service.getSummary(mockUserId);

      expect(result.netWorth.money.amount).toBe(50000); // $1,000 - $500 = $500 in cents
      expect(result.netWorth.sign).toBe(MoneySign.POSITIVE);
      expect(result.assets).toHaveLength(1);
      expect(result.liabilities).toHaveLength(1);
    });

    it('should return null changePercent when no previous snapshots exist', async () => {
      accountService.findAll.mockResolvedValue([mockCheckingAccount]);
      const today = new Date();
      const comparisonDate = getDateDaysAgo(30);

      // Return current snapshot for recent dates, empty for comparison date
      balanceSnapshotService.findSnapshotsForDateWithConversion.mockImplementation(
        (_userId: string, snapshotDate: string) => {
          // Return empty for comparison date (30 days ago)
          if (snapshotDate === comparisonDate) {
            return Promise.resolve(new Map());
          }
          // Return snapshot for all other dates (including today and chart data)
          const snapshotDateObj = new Date(snapshotDate);
          const daysDiff = Math.floor(
            (today.getTime() - snapshotDateObj.getTime()) /
              (1000 * 60 * 60 * 24),
          );
          if (daysDiff <= 1) {
            return Promise.resolve(
              new Map([['checking-1', mockCheckingSnapshot]]),
            );
          }
          return Promise.resolve(new Map());
        },
      );

      const result = await service.getSummary(mockUserId);

      expect(result.changePercent).toBeNull();
      expect(result.assets[0].changePercent).toBeNull();
    });

    it('should calculate MoM change when previous snapshots exist', async () => {
      const account = createMockAccount({
        id: 'account-1',
      });

      const currentSnapshot = createMockSnapshotWithConversion({
        accountId: 'account-1',
        currentBalanceAmount: 110000, // $1,100 current
      });

      const previousSnapshot = createMockSnapshotWithConversion({
        accountId: 'account-1',
        currentBalanceAmount: 100000, // $1,000 previous
        snapshotDate: getDateDaysAgo(30),
      });

      const comparisonDate = getDateDaysAgo(30);

      accountService.findAll.mockResolvedValue([account]);
      // Use mockImplementation to handle all calls including chart data
      balanceSnapshotService.findSnapshotsForDateWithConversion.mockImplementation(
        (_userId: string, snapshotDate: string) => {
          if (snapshotDate === comparisonDate) {
            return Promise.resolve(new Map([['account-1', previousSnapshot]]));
          }
          return Promise.resolve(new Map([['account-1', currentSnapshot]]));
        },
      );

      const result = await service.getSummary(mockUserId);

      // 10% increase: (1100 - 1000) / 1000 * 100 = 10
      expect(result.changePercent).toBe(10);
      expect(result.assets[0].changePercent).toBe(10);
    });

    it('should handle negative MoM change', async () => {
      const account = createMockAccount({
        id: 'account-1',
      });

      const currentSnapshot = createMockSnapshotWithConversion({
        accountId: 'account-1',
        currentBalanceAmount: 90000, // $900 current
      });

      const previousSnapshot = createMockSnapshotWithConversion({
        accountId: 'account-1',
        currentBalanceAmount: 100000, // $1,000 previous
        snapshotDate: getDateDaysAgo(30),
      });

      const comparisonDate = getDateDaysAgo(30);

      accountService.findAll.mockResolvedValue([account]);
      balanceSnapshotService.findSnapshotsForDateWithConversion.mockImplementation(
        (_userId: string, snapshotDate: string) => {
          if (snapshotDate === comparisonDate) {
            return Promise.resolve(new Map([['account-1', previousSnapshot]]));
          }
          return Promise.resolve(new Map([['account-1', currentSnapshot]]));
        },
      );

      const result = await service.getSummary(mockUserId);

      // -10% decrease: (900 - 1000) / 1000 * 100 = -10
      expect(result.changePercent).toBe(-10);
    });

    it('should return empty arrays when user has no accounts', async () => {
      accountService.findAll.mockResolvedValue([]);

      const result = await service.getSummary(mockUserId);

      expect(result.netWorth.money.amount).toBe(0);
      expect(result.netWorth.sign).toBe(MoneySign.POSITIVE);
      expect(result.assets).toEqual([]);
      expect(result.liabilities).toEqual([]);
      expect(result.changePercent).toBeNull();
    });

    it('should handle negative sign balances correctly', async () => {
      const negativeAccount = createMockAccount({
        id: 'account-1',
      });

      const negativeSnapshot = createMockSnapshotWithConversion({
        accountId: 'account-1',
        currentBalanceAmount: 100000,
        currentBalanceSign: MoneySign.NEGATIVE,
      });

      accountService.findAll.mockResolvedValue([negativeAccount]);
      balanceSnapshotService.findSnapshotsForDateWithConversion.mockResolvedValue(
        new Map([['account-1', negativeSnapshot]]),
      );

      const result = await service.getSummary(mockUserId);

      // Negative sign means negative balance, but for depository it's treated as asset
      expect(result.netWorth.money.amount).toBe(100000); // $1,000 in cents (absolute value)
      expect(result.netWorth.sign).toBe(MoneySign.NEGATIVE);
    });

    it('should categorize account types correctly', async () => {
      const depositoryAccount = createMockAccount({
        id: 'depository-1',
        type: AccountType.Depository,
      });
      const investmentAccount = createMockAccount({
        id: 'investment-1',
        type: AccountType.Investment,
      });
      const creditAccount = createMockAccount({
        id: 'credit-1',
        type: AccountType.Credit,
      });
      const loanAccount = createMockAccount({
        id: 'loan-1',
        type: AccountType.Loan,
      });

      const depositorySnapshot = createMockSnapshotWithConversion({
        accountId: 'depository-1',
        currentBalanceAmount: 100000,
      });
      const investmentSnapshot = createMockSnapshotWithConversion({
        accountId: 'investment-1',
        currentBalanceAmount: 200000,
      });
      const creditSnapshot = createMockSnapshotWithConversion({
        accountId: 'credit-1',
        currentBalanceAmount: 50000,
      });
      const loanSnapshot = createMockSnapshotWithConversion({
        accountId: 'loan-1',
        currentBalanceAmount: 100000,
      });

      accountService.findAll.mockResolvedValue([
        depositoryAccount,
        investmentAccount,
        creditAccount,
        loanAccount,
      ]);
      balanceSnapshotService.findSnapshotsForDateWithConversion.mockResolvedValue(
        new Map([
          ['depository-1', depositorySnapshot],
          ['investment-1', investmentSnapshot],
          ['credit-1', creditSnapshot],
          ['loan-1', loanSnapshot],
        ]),
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
      accountService.findAll.mockResolvedValue([mockCheckingAccount]);
      balanceSnapshotService.findSnapshotsForDateWithConversion.mockResolvedValue(
        new Map([['checking-1', mockCheckingSnapshot]]),
      );

      const result = await service.getSummary(mockUserId);

      expect(result.comparisonPeriod).toBe(TimePeriod.MONTH);
    });

    it('should use DAY period when specified', async () => {
      const account = createMockAccount({
        id: 'account-1',
      });

      const currentSnapshot = createMockSnapshotWithConversion({
        accountId: 'account-1',
        currentBalanceAmount: 110000, // $1,100 current
      });

      const yesterdaySnapshot = createMockSnapshotWithConversion({
        accountId: 'account-1',
        currentBalanceAmount: 100000, // $1,000 yesterday
        snapshotDate: getDateDaysAgo(1),
      });

      const comparisonDate = getDateDaysAgo(1);

      accountService.findAll.mockResolvedValue([account]);
      balanceSnapshotService.findSnapshotsForDateWithConversion.mockImplementation(
        (_userId: string, snapshotDate: string) => {
          if (snapshotDate === comparisonDate) {
            return Promise.resolve(new Map([['account-1', yesterdaySnapshot]]));
          }
          return Promise.resolve(new Map([['account-1', currentSnapshot]]));
        },
      );

      const result = await service.getSummary(mockUserId, TimePeriod.DAY);

      expect(result.comparisonPeriod).toBe(TimePeriod.DAY);
      expect(result.changePercent).toBe(10); // 10% increase from yesterday
    });

    it('should use WEEK period when specified', async () => {
      const account = createMockAccount({
        id: 'account-1',
      });

      const currentSnapshot = createMockSnapshotWithConversion({
        accountId: 'account-1',
        currentBalanceAmount: 107000, // $1,070 current
      });

      const weekAgoSnapshot = createMockSnapshotWithConversion({
        accountId: 'account-1',
        currentBalanceAmount: 100000, // $1,000 week ago
        snapshotDate: getDateDaysAgo(7),
      });

      const comparisonDate = getDateDaysAgo(7);

      accountService.findAll.mockResolvedValue([account]);
      balanceSnapshotService.findSnapshotsForDateWithConversion.mockImplementation(
        (_userId: string, snapshotDate: string) => {
          if (snapshotDate === comparisonDate) {
            return Promise.resolve(new Map([['account-1', weekAgoSnapshot]]));
          }
          return Promise.resolve(new Map([['account-1', currentSnapshot]]));
        },
      );

      const result = await service.getSummary(mockUserId, TimePeriod.WEEK);

      expect(result.comparisonPeriod).toBe(TimePeriod.WEEK);
      expect(result.changePercent).toBe(7); // 7% increase from week ago
    });

    it('should use YEAR period when specified', async () => {
      const account = createMockAccount({
        id: 'account-1',
      });

      const currentSnapshot = createMockSnapshotWithConversion({
        accountId: 'account-1',
        currentBalanceAmount: 120000, // $1,200 current
      });

      const yearAgoSnapshot = createMockSnapshotWithConversion({
        accountId: 'account-1',
        currentBalanceAmount: 100000, // $1,000 year ago
        snapshotDate: getDateDaysAgo(365),
      });

      const comparisonDate = getDateDaysAgo(365);

      accountService.findAll.mockResolvedValue([account]);
      balanceSnapshotService.findSnapshotsForDateWithConversion.mockImplementation(
        (_userId: string, snapshotDate: string) => {
          if (snapshotDate === comparisonDate) {
            return Promise.resolve(new Map([['account-1', yearAgoSnapshot]]));
          }
          return Promise.resolve(new Map([['account-1', currentSnapshot]]));
        },
      );

      const result = await service.getSummary(mockUserId, TimePeriod.YEAR);

      expect(result.comparisonPeriod).toBe(TimePeriod.YEAR);
      expect(result.changePercent).toBe(20); // 20% increase from year ago
    });

    it('should include convertedCurrentBalance in account summaries', async () => {
      accountService.findAll.mockResolvedValue([mockCheckingAccount]);
      balanceSnapshotService.findSnapshotsForDateWithConversion.mockResolvedValue(
        new Map([['checking-1', mockCheckingSnapshot]]),
      );

      const result = await service.getSummary(mockUserId);

      expect(result.assets[0].convertedCurrentBalance).toEqual(
        mockCheckingSnapshot.convertedCurrentBalance,
      );
    });
  });

  describe('chartData', () => {
    it('should return empty chart data when no snapshots exist', async () => {
      accountService.findAll.mockResolvedValue([mockCheckingAccount]);
      balanceSnapshotService.findSnapshotsForDateWithConversion.mockResolvedValue(
        new Map(),
      );

      const result = await service.getSummary(mockUserId);

      expect(result.chartData).toHaveLength(0);
    });

    it('should return chart data only for dates with snapshots', async () => {
      const account = createMockAccount({
        id: 'account-1',
      });

      const snapshot = createMockSnapshotWithConversion({
        accountId: 'account-1',
        currentBalanceAmount: 100000,
      });

      accountService.findAll.mockResolvedValue([account]);
      // Return data for all dates (simulating full history)
      balanceSnapshotService.findSnapshotsForDateWithConversion.mockResolvedValue(
        new Map([['account-1', snapshot]]),
      );

      const result = await service.getSummary(mockUserId);

      // Should have 31 daily points for MONTH period (30 days + today)
      expect(result.chartData).toHaveLength(31);
      for (const point of result.chartData) {
        expect(point.value).not.toBeNull();
      }
    });

    it('should use daily granularity for DAY period', async () => {
      const account = createMockAccount({
        id: 'account-1',
      });

      const snapshot = createMockSnapshotWithConversion({
        accountId: 'account-1',
        currentBalanceAmount: 100000,
      });

      accountService.findAll.mockResolvedValue([account]);
      balanceSnapshotService.findSnapshotsForDateWithConversion.mockResolvedValue(
        new Map([['account-1', snapshot]]),
      );

      const result = await service.getSummary(mockUserId, TimePeriod.DAY);

      // Should have 2 daily points for DAY period (1 day ago + today)
      expect(result.chartData).toHaveLength(2);
    });

    it('should use daily granularity for WEEK period', async () => {
      const account = createMockAccount({
        id: 'account-1',
      });

      const snapshot = createMockSnapshotWithConversion({
        accountId: 'account-1',
        currentBalanceAmount: 100000,
      });

      accountService.findAll.mockResolvedValue([account]);
      balanceSnapshotService.findSnapshotsForDateWithConversion.mockResolvedValue(
        new Map([['account-1', snapshot]]),
      );

      const result = await service.getSummary(mockUserId, TimePeriod.WEEK);

      // Should have 8 daily points for WEEK period (7 days ago + today)
      expect(result.chartData).toHaveLength(8);
    });

    it('should use daily granularity for YEAR period', async () => {
      const account = createMockAccount({
        id: 'account-1',
      });

      const snapshot = createMockSnapshotWithConversion({
        accountId: 'account-1',
        currentBalanceAmount: 100000,
      });

      accountService.findAll.mockResolvedValue([account]);
      balanceSnapshotService.findSnapshotsForDateWithConversion.mockResolvedValue(
        new Map([['account-1', snapshot]]),
      );

      const result = await service.getSummary(mockUserId, TimePeriod.YEAR);

      // Should have 366 daily points for YEAR period (365 days ago + today)
      expect(result.chartData).toHaveLength(366);
    });

    it('should include date in YYYY-MM-DD format', async () => {
      const account = createMockAccount({
        id: 'account-1',
      });

      const snapshot = createMockSnapshotWithConversion({
        accountId: 'account-1',
        currentBalanceAmount: 100000,
      });

      accountService.findAll.mockResolvedValue([account]);
      balanceSnapshotService.findSnapshotsForDateWithConversion.mockResolvedValue(
        new Map([['account-1', snapshot]]),
      );

      const result = await service.getSummary(mockUserId);

      for (const point of result.chartData) {
        expect(point.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    });

    it('should start from first date with data going backwards', async () => {
      const account = createMockAccount({
        id: 'account-1',
      });

      const snapshot = createMockSnapshotWithConversion({
        accountId: 'account-1',
        currentBalanceAmount: 100000,
      });

      accountService.findAll.mockResolvedValue([account]);

      // Only return data for the last 10 days
      const today = new Date();
      balanceSnapshotService.findSnapshotsForDateWithConversion.mockImplementation(
        (_userId: string, snapshotDate: string) => {
          const snapshotDateObj = new Date(snapshotDate);
          const daysDiff = Math.floor(
            (today.getTime() - snapshotDateObj.getTime()) /
              (1000 * 60 * 60 * 24),
          );
          // Only return data for dates within the last 10 days
          if (daysDiff <= 10) {
            return Promise.resolve(new Map([['account-1', snapshot]]));
          }
          return Promise.resolve(new Map());
        },
      );

      // Use MONTH period (30 days), but only last 10 days have data
      const result = await service.getSummary(mockUserId);

      // Should have 11 points (10 days ago through today)
      expect(result.chartData.length).toBe(11);
      // All returned points should have values (no nulls)
      for (const point of result.chartData) {
        expect(point.value).not.toBeNull();
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
