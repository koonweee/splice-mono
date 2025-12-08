import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AccountType } from 'plaid';
import { AccountEntity } from '../../src/account/account.entity';
import { BalanceSnapshotEntity } from '../../src/balance-snapshot/balance-snapshot.entity';
import { DashboardService } from '../../src/dashboard/dashboard.service';
import { TimePeriod } from '../../src/types/Dashboard';
import { MoneySign } from '../../src/types/MoneyWithSign';
import {
  createMockAccountEntity,
  createMockSnapshotEntity,
  mockCheckingAccount,
  mockCreditCardAccount,
  mockSavingsAccount,
  mockUserId,
} from '../mocks/dashboard/dashboard.mock';

describe('DashboardService', () => {
  let service: DashboardService;
  let accountRepository: {
    find: jest.Mock;
  };
  let snapshotRepository: {
    find: jest.Mock;
  };

  beforeEach(async () => {
    accountRepository = {
      find: jest.fn(),
    };
    snapshotRepository = {
      find: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        {
          provide: getRepositoryToken(AccountEntity),
          useValue: accountRepository,
        },
        {
          provide: getRepositoryToken(BalanceSnapshotEntity),
          useValue: snapshotRepository,
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
      accountRepository.find.mockResolvedValue([mockCheckingAccount]);
      snapshotRepository.find.mockResolvedValue([]);

      const result = await service.getSummary(mockUserId);

      expect(result.netWorth.money.amount).toBe(100000); // $1,000 in cents
      expect(result.netWorth.money.currency).toBe('USD');
      expect(result.netWorth.sign).toBe(MoneySign.POSITIVE);
      expect(result.assets).toHaveLength(1);
      expect(result.assets[0].id).toBe('checking-1');
      expect(result.liabilities).toHaveLength(0);
    });

    it('should calculate net worth with multiple asset accounts', async () => {
      accountRepository.find.mockResolvedValue([
        mockCheckingAccount,
        mockSavingsAccount,
      ]);
      snapshotRepository.find.mockResolvedValue([]);

      const result = await service.getSummary(mockUserId);

      expect(result.netWorth.money.amount).toBe(600000); // $1,000 + $5,000 in cents
      expect(result.netWorth.sign).toBe(MoneySign.POSITIVE);
      expect(result.assets).toHaveLength(2);
    });

    it('should subtract liabilities from net worth', async () => {
      accountRepository.find.mockResolvedValue([
        mockCheckingAccount, // $1,000 asset
        mockCreditCardAccount, // $500 liability
      ]);
      snapshotRepository.find.mockResolvedValue([]);

      const result = await service.getSummary(mockUserId);

      expect(result.netWorth.money.amount).toBe(50000); // $1,000 - $500 = $500 in cents
      expect(result.netWorth.sign).toBe(MoneySign.POSITIVE);
      expect(result.assets).toHaveLength(1);
      expect(result.liabilities).toHaveLength(1);
    });

    it('should return null changePercent when no previous snapshots exist', async () => {
      accountRepository.find.mockResolvedValue([mockCheckingAccount]);
      snapshotRepository.find.mockResolvedValue([]);

      const result = await service.getSummary(mockUserId);

      expect(result.changePercent).toBeNull();
      expect(result.assets[0].changePercent).toBeNull();
    });

    it('should calculate MoM change when previous snapshots exist', async () => {
      const account = createMockAccountEntity({
        id: 'account-1',
        currentBalanceAmount: 110000, // $1,100 current
      });

      const previousSnapshot = createMockSnapshotEntity({
        accountId: 'account-1',
        currentBalanceAmount: 100000, // $1,000 previous
        snapshotDate: getDateDaysAgo(30),
      });

      accountRepository.find.mockResolvedValue([account]);
      snapshotRepository.find.mockResolvedValue([previousSnapshot]);

      const result = await service.getSummary(mockUserId);

      // 10% increase: (1100 - 1000) / 1000 * 100 = 10
      expect(result.changePercent).toBe(10);
      expect(result.assets[0].changePercent).toBe(10);
    });

    it('should handle negative MoM change', async () => {
      const account = createMockAccountEntity({
        id: 'account-1',
        currentBalanceAmount: 90000, // $900 current
      });

      const previousSnapshot = createMockSnapshotEntity({
        accountId: 'account-1',
        currentBalanceAmount: 100000, // $1,000 previous
        snapshotDate: getDateDaysAgo(30),
      });

      accountRepository.find.mockResolvedValue([account]);
      snapshotRepository.find.mockResolvedValue([previousSnapshot]);

      const result = await service.getSummary(mockUserId);

      // -10% decrease: (900 - 1000) / 1000 * 100 = -10
      expect(result.changePercent).toBe(-10);
    });

    it('should return empty arrays when user has no accounts', async () => {
      accountRepository.find.mockResolvedValue([]);
      snapshotRepository.find.mockResolvedValue([]);

      const result = await service.getSummary(mockUserId);

      expect(result.netWorth.money.amount).toBe(0);
      expect(result.netWorth.sign).toBe(MoneySign.POSITIVE);
      expect(result.assets).toEqual([]);
      expect(result.liabilities).toEqual([]);
      expect(result.changePercent).toBeNull();
    });

    it('should handle negative sign balances correctly', async () => {
      const negativeAccount = createMockAccountEntity({
        id: 'account-1',
        currentBalanceAmount: 100000,
        currentBalanceSign: MoneySign.NEGATIVE,
      });

      accountRepository.find.mockResolvedValue([negativeAccount]);
      snapshotRepository.find.mockResolvedValue([]);

      const result = await service.getSummary(mockUserId);

      // Negative sign means negative balance, but for depository it's treated as asset
      expect(result.netWorth.money.amount).toBe(100000); // $1,000 in cents (absolute value)
      expect(result.netWorth.sign).toBe(MoneySign.NEGATIVE);
    });

    it('should categorize account types correctly', async () => {
      const depositoryAccount = createMockAccountEntity({
        id: 'depository-1',
        type: AccountType.Depository,
        currentBalanceAmount: 100000,
      });
      const investmentAccount = createMockAccountEntity({
        id: 'investment-1',
        type: AccountType.Investment,
        currentBalanceAmount: 200000,
      });
      const creditAccount = createMockAccountEntity({
        id: 'credit-1',
        type: AccountType.Credit,
        currentBalanceAmount: 50000,
      });
      const loanAccount = createMockAccountEntity({
        id: 'loan-1',
        type: AccountType.Loan,
        currentBalanceAmount: 100000,
      });

      accountRepository.find.mockResolvedValue([
        depositoryAccount,
        investmentAccount,
        creditAccount,
        loanAccount,
      ]);
      snapshotRepository.find.mockResolvedValue([]);

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
      accountRepository.find.mockResolvedValue([mockCheckingAccount]);
      snapshotRepository.find.mockResolvedValue([]);

      const result = await service.getSummary(mockUserId);

      expect(result.comparisonPeriod).toBe(TimePeriod.MONTH);
    });

    it('should use DAY period when specified', async () => {
      const account = createMockAccountEntity({
        id: 'account-1',
        currentBalanceAmount: 110000, // $1,100 current
      });

      const yesterdaySnapshot = createMockSnapshotEntity({
        accountId: 'account-1',
        currentBalanceAmount: 100000, // $1,000 yesterday
        snapshotDate: getDateDaysAgo(1),
      });

      accountRepository.find.mockResolvedValue([account]);
      snapshotRepository.find.mockResolvedValue([yesterdaySnapshot]);

      const result = await service.getSummary(mockUserId, TimePeriod.DAY);

      expect(result.comparisonPeriod).toBe(TimePeriod.DAY);
      expect(result.changePercent).toBe(10); // 10% increase from yesterday
    });

    it('should use WEEK period when specified', async () => {
      const account = createMockAccountEntity({
        id: 'account-1',
        currentBalanceAmount: 107000, // $1,070 current
      });

      const weekAgoSnapshot = createMockSnapshotEntity({
        accountId: 'account-1',
        currentBalanceAmount: 100000, // $1,000 week ago
        snapshotDate: getDateDaysAgo(7),
      });

      accountRepository.find.mockResolvedValue([account]);
      snapshotRepository.find.mockResolvedValue([weekAgoSnapshot]);

      const result = await service.getSummary(mockUserId, TimePeriod.WEEK);

      expect(result.comparisonPeriod).toBe(TimePeriod.WEEK);
      expect(result.changePercent).toBe(7); // 7% increase from week ago
    });

    it('should use YEAR period when specified', async () => {
      const account = createMockAccountEntity({
        id: 'account-1',
        currentBalanceAmount: 120000, // $1,200 current
      });

      const yearAgoSnapshot = createMockSnapshotEntity({
        accountId: 'account-1',
        currentBalanceAmount: 100000, // $1,000 year ago
        snapshotDate: getDateDaysAgo(365),
      });

      accountRepository.find.mockResolvedValue([account]);
      snapshotRepository.find.mockResolvedValue([yearAgoSnapshot]);

      const result = await service.getSummary(mockUserId, TimePeriod.YEAR);

      expect(result.comparisonPeriod).toBe(TimePeriod.YEAR);
      expect(result.changePercent).toBe(20); // 20% increase from year ago
    });
  });

  describe('chartData', () => {
    it('should return 6 months of chart data', async () => {
      accountRepository.find.mockResolvedValue([mockCheckingAccount]);
      snapshotRepository.find.mockResolvedValue([]);

      const result = await service.getSummary(mockUserId);

      expect(result.chartData).toHaveLength(6);
    });

    it('should return null values for months without snapshot data', async () => {
      accountRepository.find.mockResolvedValue([mockCheckingAccount]);
      snapshotRepository.find.mockResolvedValue([]);

      const result = await service.getSummary(mockUserId);

      // All chart points should have null values since no snapshots exist
      for (const point of result.chartData) {
        expect(point.value).toBeNull();
      }
    });

    it('should return actual values when snapshots exist', async () => {
      const account = createMockAccountEntity({
        id: 'account-1',
        currentBalanceAmount: 100000,
      });

      // Create snapshot for first of current month
      const currentMonthFirst = new Date();
      currentMonthFirst.setDate(1);
      const snapshotDate = currentMonthFirst.toISOString().split('T')[0];

      const snapshot = createMockSnapshotEntity({
        accountId: 'account-1',
        snapshotDate,
        currentBalanceAmount: 100000,
      });

      accountRepository.find.mockResolvedValue([account]);
      snapshotRepository.find.mockImplementation((options) => {
        // Return snapshot only for queries that include the current month
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        const whereClause = options?.where;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        if (whereClause?.snapshotDate) {
          return [snapshot];
        }
        return [];
      });

      const result = await service.getSummary(mockUserId);

      // At least the current month should have data
      const hasNonNullValue = result.chartData.some(
        (point) => point.value !== null,
      );
      expect(hasNonNullValue).toBe(true);
    });

    it('should include date in YYYY-MM-DD format', async () => {
      accountRepository.find.mockResolvedValue([]);
      snapshotRepository.find.mockResolvedValue([]);

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
