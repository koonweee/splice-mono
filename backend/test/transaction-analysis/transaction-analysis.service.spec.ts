import { AccountType } from 'plaid';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AccountEntity } from '../../src/account/account.entity';
import { AnalysisRuleEntity } from '../../src/analysis-rule/analysis-rule.entity';
import { AnalysisRuleService } from '../../src/analysis-rule/analysis-rule.service';
import { CategoryEntity } from '../../src/category/category.entity';
import { CurrencyConversionService } from '../../src/currency-exchange/currency-conversion.service';
import { BalanceSnapshotEntity } from '../../src/balance-snapshot/balance-snapshot.entity';
import { CryptoAccountType } from '../../src/types/AccountType';
import { BalanceSnapshotType } from '../../src/types/BalanceSnapshot';
import type { CreateAccountDto } from '../../src/types/Account';
import { TransactionEntity } from '../../src/transaction/transaction.entity';
import { TransactionAnalysisService } from '../../src/transaction-analysis/transaction-analysis.service';
import { MoneySign, getDecimalPlaces } from '../../src/types/MoneyWithSign';
import type { AnalysisCategoryScope } from '../../src/types/AnalysisRule';

const mockUserId = 'user-uuid-123';

/**
 * Real conversion logic (mirrors CurrencyConversionService.convertAmount)
 * so mock behaves identically to production code.
 */
function realConvertAmount(
  amount: number,
  sourceCurrency: string,
  targetCurrency: string,
  rate: number,
): number {
  const sourceDecimals = getDecimalPlaces(sourceCurrency);
  const targetDecimals = getDecimalPlaces(targetCurrency);
  const majorUnits = amount / Math.pow(10, sourceDecimals);
  return Math.round(majorUnits * rate * Math.pow(10, targetDecimals));
}

function buildTransaction(params: {
  id: string;
  amount: number;
  sign: MoneySign;
  accountId?: string;
  currency?: string;
  providerDate: string;
  reportingDateOverride?: string | null;
  pending?: boolean;
  primary?: string | null;
  detailed?: string | null;
  userPrimary?: string | null;
  userDetailed?: string | null;
  categoryColor?: string;
  accountName?: string | null;
  accountCustomName?: string | null;
}): TransactionEntity {
  const entity = TransactionEntity.fromDto(
    {
      amount: {
        money: {
          amount: params.amount,
          currency: params.currency ?? 'USD',
        },
        sign: params.sign,
      },
      accountId: params.accountId ?? 'account-1',
      pending: params.pending ?? false,
      providerDate: params.providerDate,
      reportingDateOverride: params.reportingDateOverride ?? null,
    },
    mockUserId,
  );

  entity.id = params.id;
  entity.account = {
    id: entity.accountId,
    name: params.accountName ?? 'Checking',
    customName: params.accountCustomName ?? null,
    toObject() {
      return {
        id: entity.accountId,
        userId: mockUserId,
        name: params.accountName ?? 'Checking',
        customName: params.accountCustomName ?? null,
        mask: null,
        availableBalance: {
          money: {
            amount: 0,
            currency: params.currency ?? 'USD',
          },
          sign: MoneySign.POSITIVE,
        },
        currentBalance: {
          money: {
            amount: 0,
            currency: params.currency ?? 'USD',
          },
          sign: MoneySign.POSITIVE,
        },
        type: 'depository',
        subType: null,
        externalAccountId: null,
        bankLinkId: null,
        bankLink: null,
        createdAt: entity.createdAt,
        updatedAt: entity.updatedAt,
      };
    },
  } as AccountEntity;
  const categoryPrimary = params.userPrimary ?? params.primary;
  const categoryDetailed =
    params.userDetailed ?? params.detailed ?? `${categoryPrimary}_DETAIL`;
  entity.category = categoryPrimary
    ? ({
        id: `cat-${categoryPrimary}`,
        primary: categoryPrimary,
        detailed: categoryDetailed,
        description: `${categoryPrimary} category`,
        color: params.categoryColor ?? '#228be6',
        toObject() {
          return {
            id: `cat-${categoryPrimary}`,
            primary: categoryPrimary,
            detailed: categoryDetailed,
            description: `${categoryPrimary} category`,
            color: params.categoryColor ?? '#228be6',
            archivedAt: null,
            createdAt: entity.createdAt,
            updatedAt: entity.updatedAt,
          };
        },
      } as CategoryEntity)
    : null;
  entity.categoryId = entity.category?.id ?? null;
  entity.categoryUpdatedAt = params.userPrimary
    ? new Date('2024-01-02T00:00:00Z')
    : null;

  return entity;
}

function buildAccount(params: {
  id: string;
  accountName?: string | null;
  accountCustomName?: string | null;
  type?: CreateAccountDto['type'];
}): AccountEntity {
  const accountName =
    params.accountName === undefined ? 'Checking' : params.accountName;
  const accountCustomName =
    params.accountCustomName === undefined ? null : params.accountCustomName;
  const entity = AccountEntity.fromDto(
    {
      name: accountName,
      customName: accountCustomName,
      mask: null,
      type: params.type ?? AccountType.Depository,
      subType: null,
      externalAccountId: null,
      bankLinkId: null,
      availableBalance: {
        money: {
          amount: 0,
          currency: 'USD',
        },
        sign: MoneySign.POSITIVE,
      },
      currentBalance: {
        money: {
          amount: 0,
          currency: 'USD',
        },
        sign: MoneySign.POSITIVE,
      },
    },
    mockUserId,
  );

  entity.id = params.id;

  return entity;
}

function buildBalanceSnapshot(params: {
  accountId: string;
  snapshotDate: string;
  amount: number;
  sign?: MoneySign;
  currency?: string;
}): BalanceSnapshotEntity {
  const currency = params.currency ?? 'USD';
  const sign = params.sign ?? MoneySign.POSITIVE;

  const snapshot = BalanceSnapshotEntity.fromDto(
    {
      accountId: params.accountId,
      snapshotDate: params.snapshotDate,
      snapshotType: BalanceSnapshotType.SYNC,
      currentBalance: {
        money: {
          amount: params.amount,
          currency,
        },
        sign,
      },
      availableBalance: {
        money: {
          amount: params.amount,
          currency,
        },
        sign,
      },
    },
    mockUserId,
  );

  snapshot.id = `${params.accountId}-${params.snapshotDate}`;

  return snapshot;
}

function buildAnalysisRule(params: {
  id: string;
  type: 'exclude' | 'neutralize';
  excludeScope?: AnalysisCategoryScope | null;
  inflowScope?: AnalysisCategoryScope | null;
  outflowScope?: AnalysisCategoryScope | null;
  createdAt?: Date;
}): AnalysisRuleEntity {
  return {
    id: params.id,
    userId: mockUserId,
    name: params.id,
    type: params.type,
    excludeScope: params.excludeScope ?? null,
    inflowScope: params.inflowScope ?? null,
    outflowScope: params.outflowScope ?? null,
    archivedAt: null,
    createdAt: params.createdAt ?? new Date('2024-01-01T00:00:00Z'),
    updatedAt: params.createdAt ?? new Date('2024-01-01T00:00:00Z'),
  } as AnalysisRuleEntity;
}

const broadNeutralizationRule = buildAnalysisRule({
  id: 'broad-neutralization',
  type: 'neutralize',
  inflowScope: { mode: 'all' },
  outflowScope: { mode: 'all' },
});

type ComparisonOperator = '<=' | '<' | '>=' | '>';

interface DateConstraint {
  operator: ComparisonOperator;
  providerDate: string;
  column: 'snapshotDate' | 'date';
}

interface SnapshotOrder {
  field: 'snapshotDate' | 'accountId';
  direction: 'ASC' | 'DESC';
}

function buildSnapshotQueryBuilder(rows: BalanceSnapshotEntity[]) {
  const snapshotRows = [...rows];
  const state = {
    accountIds: new Set<string>(),
    userId: null as string | null,
    snapshotType: new Set<string>(),
    dateConstraints: [] as DateConstraint[],
    orders: [
      { field: 'snapshotDate', direction: 'DESC' as const },
    ] as Array<SnapshotOrder>,
    distinctOn: [] as string[],
    limit: null as number | null,
  };
  let pendingDateConstraintParams: Array<{
    column: 'snapshotDate' | 'date';
    operator: ComparisonOperator;
    paramName: string;
  }> = [];
  let pendingAccountIdParams = new Set<string>();
  let pendingUserIdParams = new Set<string>();
  let pendingSnapshotTypeParams = new Set<string>();

  const resetPredicateState = () => {
    state.accountIds.clear();
    state.userId = null;
    state.snapshotType.clear();
    state.dateConstraints = [];
    pendingDateConstraintParams = [];
    pendingAccountIdParams = new Set<string>();
    pendingUserIdParams = new Set<string>();
    pendingSnapshotTypeParams = new Set<string>();
  };

  const isDateValue = (value: unknown): value is string => {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
  };

  const normalizeColumn = (value: string) =>
    value.includes('.') ? (value.split('.').pop() ?? value) : value;

  const isTrackedDateColumn = (
    value: string,
  ): value is 'snapshotDate' | 'date' =>
    value === 'snapshotDate' || value === 'date';

  const addDateConstraint = (constraint: {
    column: 'snapshotDate' | 'date';
    operator: ComparisonOperator;
    providerDate: string;
  }) => {
    if (
      state.dateConstraints.some(
        (existing) =>
          existing.column === constraint.column &&
          existing.operator === constraint.operator &&
          existing.providerDate === constraint.providerDate,
      )
    ) {
      return;
    }

    state.dateConstraints.push(constraint);
  };

  const updateDateConstraints = (
    query: string,
    params: Record<string, unknown>,
  ) => {
    const dateConstraintMatch = query.match(
      /(?:\w+\.)?(snapshotDate|date)\s*(<=|<|>=|>)\s*:(\w+)/i,
    );

    if (!dateConstraintMatch) {
      return;
    }

    const [, rawColumn, operator, paramName] = dateConstraintMatch;
    const value = params[paramName];
    if (isDateValue(value) && isTrackedDateColumn(rawColumn)) {
      addDateConstraint({
        operator: operator as ComparisonOperator,
        providerDate: value,
        column: rawColumn,
      });
      return;
    }

    if (isTrackedDateColumn(rawColumn)) {
      pendingDateConstraintParams.push({
        column: rawColumn,
        operator: operator as ComparisonOperator,
        paramName,
      });
    }
  };

  const updateAccountFilters = (
    query: string,
    params: Record<string, unknown>,
  ) => {
    const accountInMatch = query.match(
      /(?:\w+\.)?accountId\s+IN\s*\(:\.\.\.(\w+)\)/i,
    );
    if (accountInMatch) {
      const accountIds = params[accountInMatch[1]];
      if (Array.isArray(accountIds)) {
        accountIds
          .filter((id): id is string => typeof id === 'string')
          .forEach((id) => state.accountIds.add(id));
        return;
      }
      if (typeof accountInMatch[1] === 'string') {
        pendingAccountIdParams.add(accountInMatch[1]);
      }
      return;
    }

    const accountEqMatch = query.match(/(?:\w+\.)?accountId\s*=\s*:(\w+)/i);
    if (accountEqMatch) {
      const accountId = params[accountEqMatch[1]];
      if (typeof accountId === 'string') {
        state.accountIds.add(accountId);
      } else {
        pendingAccountIdParams.add(accountEqMatch[1]);
      }
    }
  };

  const updateUserFilters = (
    query: string,
    params: Record<string, unknown>,
  ) => {
    const userMatch = query.match(/(?:\w+\.)?userId\s*=\s*:(\w+)/i);
    if (!userMatch) {
      return;
    }

    const userId = params[userMatch[1]];
    if (typeof userId === 'string') {
      state.userId = userId;
    } else {
      pendingUserIdParams.add(userMatch[1]);
    }
  };

  const updateSnapshotTypeFilters = (
    query: string,
    params: Record<string, unknown>,
  ) => {
    const snapshotTypeInMatch = query.match(
      /(?:\w+\.)?snapshotType\s+IN\s*\(:\.\.\.(\w+)\)/i,
    );
    if (snapshotTypeInMatch) {
      const snapshotTypes = params[snapshotTypeInMatch[1]];
      if (Array.isArray(snapshotTypes)) {
        snapshotTypes
          .filter((value): value is string => typeof value === 'string')
          .forEach((value) => state.snapshotType.add(value));
        return;
      }
      if (typeof snapshotTypeInMatch[1] === 'string') {
        pendingSnapshotTypeParams.add(snapshotTypeInMatch[1]);
      }
      return;
    }

    const snapshotTypeEqMatch = query.match(
      /(?:\w+\.)?snapshotType\s*=\s*:(\w+)/i,
    );
    if (snapshotTypeEqMatch) {
      const snapshotType = params[snapshotTypeEqMatch[1]];
      if (typeof snapshotType === 'string') {
        state.snapshotType.add(snapshotType);
      } else {
        pendingSnapshotTypeParams.add(snapshotTypeEqMatch[1]);
      }
    }
  };

  const updateOrder = (
    query: string,
    direction: 'ASC' | 'DESC' = 'ASC',
    append = false,
  ) => {
    const fieldMatch = query.match(/^\s*(?:\w+\.)?(\w+)/i);
    if (!fieldMatch) {
      return;
    }

    const field = normalizeColumn(fieldMatch[1]);
    if (field !== 'snapshotDate' && field !== 'accountId') {
      return;
    }

    const normalizedDirection = direction === 'DESC' ? 'DESC' : 'ASC';
    const order: SnapshotOrder = {
      field,
      direction: normalizedDirection,
    };

    if (append) {
      state.orders.push(order);
      return;
    }

    state.orders = [order];
  };

  const applyPendingParameters = (params: Record<string, unknown>) => {
    [...pendingAccountIdParams].forEach((paramName) => {
      const value = params[paramName];
      if (typeof value === 'string') {
        state.accountIds.add(value);
        pendingAccountIdParams.delete(paramName);
      }
      if (Array.isArray(value)) {
        value
          .filter((id): id is string => typeof id === 'string')
          .forEach((id) => state.accountIds.add(id));
        pendingAccountIdParams.delete(paramName);
      }
    });

    [...pendingUserIdParams].forEach((paramName) => {
      const value = params[paramName];
      if (typeof value === 'string') {
        state.userId = value;
        pendingUserIdParams.delete(paramName);
      }
    });

    [...pendingSnapshotTypeParams].forEach((paramName) => {
      const value = params[paramName];
      if (typeof value === 'string') {
        state.snapshotType.add(value);
        pendingSnapshotTypeParams.delete(paramName);
      }
      if (Array.isArray(value)) {
        value
          .filter((val): val is string => typeof val === 'string')
          .forEach((val) => state.snapshotType.add(val));
        pendingSnapshotTypeParams.delete(paramName);
      }
    });

    const nextPendingDateConstraintParams: Array<{
      column: 'snapshotDate' | 'date';
      operator: ComparisonOperator;
      paramName: string;
    }> = [];
    pendingDateConstraintParams.forEach((constraint) => {
      const value = params[constraint.paramName];
      if (isDateValue(value)) {
        addDateConstraint({
          operator: constraint.operator,
          providerDate: value,
          column: constraint.column,
        });
        return;
      }

      nextPendingDateConstraintParams.push(constraint);
    });
    pendingDateConstraintParams = nextPendingDateConstraintParams;
  };

  const updateFromClause = (query: string, params: Record<string, unknown>) => {
    updateDateConstraints(query, params);
    updateAccountFilters(query, params);
    updateUserFilters(query, params);
    updateSnapshotTypeFilters(query, params);
    applyPendingParameters(params);
  };

  const applyFromClause = (query: string, params: Record<string, unknown>) => {
    updateFromClause(query, params);
  };

  const compareByDate = (
    left: BalanceSnapshotEntity,
    right: BalanceSnapshotEntity,
  ) => right.snapshotDate.localeCompare(left.snapshotDate);

  const compareById = (
    left: BalanceSnapshotEntity,
    right: BalanceSnapshotEntity,
  ) => right.id.localeCompare(left.id);

  const getOrderValue = (
    snapshot: BalanceSnapshotEntity,
    field: SnapshotOrder['field'],
  ) => {
    if (field === 'snapshotDate') {
      return snapshot.snapshotDate;
    }

    return snapshot[field];
  };

  const compareSnapshots = (
    left: BalanceSnapshotEntity,
    right: BalanceSnapshotEntity,
  ) => {
    for (const order of state.orders) {
      const leftValue = getOrderValue(left, order.field);
      const rightValue = getOrderValue(right, order.field);

      if (order.field === 'snapshotDate') {
        const diff =
          order.direction === 'DESC'
            ? rightValue.localeCompare(leftValue)
            : leftValue.localeCompare(rightValue);
        if (diff !== 0) {
          return diff;
        }
      } else if (order.field === 'accountId') {
        if (leftValue !== rightValue) {
          const diff =
            order.direction === 'DESC'
              ? rightValue.localeCompare(leftValue)
              : leftValue.localeCompare(rightValue);
          if (diff !== 0) {
            return diff;
          }
        }
      }
    }

    return compareByDate(left, right) || compareById(left, right);
  };

  const satisfiesDateConstraint = (
    snapshot: BalanceSnapshotEntity,
    constraint: DateConstraint,
  ) => {
    const candidateValue =
      constraint.column === 'date'
        ? snapshot.snapshotDate
        : snapshot.snapshotDate;

    switch (constraint.operator) {
      case '<':
        return candidateValue < constraint.providerDate;
      case '<=':
        return candidateValue <= constraint.providerDate;
      case '>':
        return candidateValue > constraint.providerDate;
      case '>=':
        return candidateValue >= constraint.providerDate;
      default:
        return true;
    }
  };

  const applyDistinctOn = (rows: BalanceSnapshotEntity[]) => {
    if (state.distinctOn.length === 0) {
      return rows;
    }

    const seen = new Set<string>();
    const distinctRows: BalanceSnapshotEntity[] = [];

    rows.forEach((snapshot) => {
      const key = state.distinctOn
        .map((field) => {
          const value = snapshot[field as keyof BalanceSnapshotEntity];
          return typeof value === 'string' ? value : '';
        })
        .join('|');

      if (seen.has(key)) {
        return;
      }

      seen.add(key);
      distinctRows.push(snapshot);
    });

    return distinctRows;
  };

  const selectSnapshots = (): BalanceSnapshotEntity[] => {
    const baseRows = snapshotRows
      .filter((snapshot) => {
        if (
          state.accountIds.size > 0 &&
          !state.accountIds.has(snapshot.accountId)
        ) {
          return false;
        }
        if (state.userId && snapshot.userId !== state.userId) {
          return false;
        }
        if (
          state.snapshotType.size > 0 &&
          !state.snapshotType.has(snapshot.snapshotType)
        ) {
          return false;
        }

        if (state.dateConstraints.length > 0) {
          return state.dateConstraints.every((constraint) =>
            satisfiesDateConstraint(snapshot, constraint),
          );
        }

        return true;
      })
      .sort(compareSnapshots);

    return applyDistinctOn(baseRows).slice(0, state.limit ?? baseRows.length);
  };

  const queryBuilder = {
    where: jest.fn((query: string, params: Record<string, unknown> = {}) => {
      resetPredicateState();
      applyFromClause(query, params);
      return queryBuilder;
    }),
    andWhere: jest.fn((query: string, params: Record<string, unknown> = {}) => {
      applyFromClause(query, params);
      return queryBuilder;
    }),
    orderBy: jest.fn((query: string, direction: 'ASC' | 'DESC' = 'ASC') => {
      updateOrder(query, direction);
      return queryBuilder;
    }),
    addOrderBy: jest.fn((query: string, direction: 'ASC' | 'DESC' = 'ASC') => {
      updateOrder(query, direction, true);
      return queryBuilder;
    }),
    distinctOn: jest.fn((fields: string[]) => {
      state.distinctOn = fields.map(normalizeColumn);
      return queryBuilder;
    }),
    take: jest.fn((count: number) => {
      state.limit = count;
      return queryBuilder;
    }),
    limit: jest.fn((count: number) => {
      state.limit = count;
      return queryBuilder;
    }),
    setParameters: jest.fn((params: Record<string, unknown> = {}) => {
      applyFromClause('', params);
      return queryBuilder;
    }),
    getMany: jest.fn(async () => selectSnapshots()),
    getOne: jest.fn(async () => selectSnapshots()[0] ?? null),
  };

  return queryBuilder;
}

describe('TransactionAnalysisService', () => {
  let service: TransactionAnalysisService;
  let mockTransactionRepository: {
    find: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let mockAccountRepository: {
    find: jest.Mock;
  };
  let mockBalanceSnapshotRepository: {
    createQueryBuilder: jest.Mock;
  };
  let mockCurrencyConversionService: {
    getPreferredCurrency: jest.Mock;
    getRateMap: jest.Mock;
    convertAmount: jest.Mock;
  };
  let mockAnalysisRuleService: {
    findActiveForAnalysis: jest.Mock;
    scopeMatchesTransactionCategory: jest.Mock;
    compareNeutralizationRules: jest.Mock;
  };

  const buildTransactionQueryBuilder = () => {
    const params: Record<string, unknown> = {};
    const queryBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn((_query: string, nextParams?: Record<string, unknown>) => {
        Object.assign(params, nextParams);
        return queryBuilder;
      }),
      andWhere: jest.fn(
        (_query: string, nextParams?: Record<string, unknown>) => {
          Object.assign(params, nextParams);
          return queryBuilder;
        },
      ),
      getMany: jest.fn(() =>
        mockTransactionRepository.find({
          where: {
            userId: params.userId,
            pending: false,
            providerDate: {
              startDate: params.startDate,
              endDate: params.endDate,
            },
          },
          relations: ['account', 'category'],
        }),
      ),
    };

    return queryBuilder;
  };

  beforeEach(async () => {
    mockTransactionRepository = {
      find: jest.fn(),
      createQueryBuilder: jest.fn(() => buildTransactionQueryBuilder()),
    };
    mockAccountRepository = {
      find: jest.fn().mockResolvedValue([]),
    };
    mockBalanceSnapshotRepository = {
      createQueryBuilder: jest.fn(() => buildSnapshotQueryBuilder([])),
    };
    mockCurrencyConversionService = {
      getPreferredCurrency: jest.fn().mockResolvedValue('USD'),
      getRateMap: jest.fn().mockResolvedValue(new Map([['EUR', 1.1]])),
      convertAmount: jest.fn().mockImplementation(realConvertAmount),
    };
    const scopeSpecificity = (scope: AnalysisCategoryScope | null) => {
      if (!scope || scope.mode === 'all') {
        return 1_000_000;
      }

      return scope.categoryIds.length + (scope.includeUncategorized ? 1 : 0);
    };
    mockAnalysisRuleService = {
      findActiveForAnalysis: jest
        .fn()
        .mockResolvedValue([broadNeutralizationRule]),
      scopeMatchesTransactionCategory: jest.fn(
        (scope: AnalysisCategoryScope, categoryId: string | null) => {
          if (scope.mode === 'all') {
            return true;
          }
          if (categoryId === null) {
            return scope.includeUncategorized;
          }

          return scope.categoryIds.includes(categoryId);
        },
      ),
      compareNeutralizationRules: jest.fn(
        (left: AnalysisRuleEntity, right: AnalysisRuleEntity) => {
          const scoreComparison =
            scopeSpecificity(left.inflowScope) +
            scopeSpecificity(left.outflowScope) -
            (scopeSpecificity(right.inflowScope) +
              scopeSpecificity(right.outflowScope));
          if (scoreComparison !== 0) {
            return scoreComparison;
          }

          return left.id.localeCompare(right.id);
        },
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionAnalysisService,
        {
          provide: getRepositoryToken(TransactionEntity),
          useValue: mockTransactionRepository,
        },
        {
          provide: getRepositoryToken(AccountEntity),
          useValue: mockAccountRepository,
        },
        {
          provide: getRepositoryToken(BalanceSnapshotEntity),
          useValue: mockBalanceSnapshotRepository,
        },
        {
          provide: CurrencyConversionService,
          useValue: mockCurrencyConversionService,
        },
        {
          provide: AnalysisRuleService,
          useValue: mockAnalysisRuleService,
        },
      ],
    }).compile();

    service = module.get<TransactionAnalysisService>(
      TransactionAnalysisService,
    );
  });

  const mockSnapshotRows = (rows: BalanceSnapshotEntity[]) => {
    mockBalanceSnapshotRepository.createQueryBuilder.mockImplementation(() =>
      buildSnapshotQueryBuilder(rows),
    );
  };

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getAnalysis', () => {
    it('excludes pending transactions from analysis entirely', async () => {
      mockTransactionRepository.find.mockResolvedValue([]);

      await expect(
        service.getAnalysis('2024-01-01', '2024-01-31', mockUserId),
      ).resolves.toMatchObject({
        totalInflow: 0,
        totalOutflow: 0,
        inflows: [],
        outflows: [],
      });

      expect(mockTransactionRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: mockUserId,
            pending: false,
            providerDate: expect.anything(),
          }),
          relations: ['account', 'category'],
        }),
      );
    });

    it('uses reportingDateOverride for analysis window membership', async () => {
      const rows = [
        buildTransaction({
          id: 'salary',
          amount: 560520,
          sign: MoneySign.POSITIVE,
          providerDate: '2026-04-29',
          reportingDateOverride: '2026-05-01',
          primary: 'INCOME',
        }),
        buildTransaction({
          id: 'purchase',
          amount: 1200,
          sign: MoneySign.NEGATIVE,
          providerDate: '2026-04-30',
          primary: 'FOOD_AND_DRINK',
        }),
      ];
      mockTransactionRepository.find.mockImplementation(
        (query: {
          where: {
            providerDate: { startDate: string; endDate: string };
          };
        }) =>
          Promise.resolve(
            rows.filter((transaction) => {
              const activityDate =
                transaction.reportingDateOverride ??
                transaction.authorizedDate ??
                transaction.providerDate;

              return (
                activityDate >= query.where.providerDate.startDate &&
                activityDate <= query.where.providerDate.endDate
              );
            }),
          ),
      );

      const april = await service.getAnalysis(
        '2026-04-01',
        '2026-04-30',
        mockUserId,
      );
      const may = await service.getAnalysis(
        '2026-05-01',
        '2026-05-31',
        mockUserId,
      );

      expect(april.inflows).toEqual([]);
      expect(april.outflows).toEqual([
        expect.objectContaining({
          primaryCategory: 'FOOD_AND_DRINK',
          totalAmount: 1200,
        }),
      ]);
      expect(may.inflows).toEqual([
        expect.objectContaining({
          primaryCategory: 'INCOME',
          totalAmount: 560520,
        }),
      ]);
      expect(may.outflows).toEqual([]);
    });

    it('cancels exact equal and opposite posted transactions in the same currency', async () => {
      mockTransactionRepository.find.mockResolvedValue([
        buildTransaction({
          id: 'expense',
          amount: 243360,
          sign: MoneySign.NEGATIVE,
          providerDate: '2024-01-28',
          primary: 'LOAN_PAYMENTS',
        }),
        buildTransaction({
          id: 'mirror-income',
          amount: 243360,
          sign: MoneySign.POSITIVE,
          providerDate: '2024-01-28',
          primary: 'INCOME',
        }),
      ]);

      await expect(
        service.getAnalysis('2024-01-01', '2024-01-31', mockUserId),
      ).resolves.toMatchObject({
        totalInflow: 0,
        totalOutflow: 0,
        inflows: [],
        outflows: [],
      });
    });

    it('does not neutralize equal and opposite transactions when no active neutralization rule exists', async () => {
      mockAnalysisRuleService.findActiveForAnalysis.mockResolvedValueOnce([]);
      mockTransactionRepository.find.mockResolvedValue([
        buildTransaction({
          id: 'expense',
          amount: 10000,
          sign: MoneySign.NEGATIVE,
          providerDate: '2024-01-28',
          primary: 'LOAN_PAYMENTS',
        }),
        buildTransaction({
          id: 'mirror-income',
          amount: 10000,
          sign: MoneySign.POSITIVE,
          providerDate: '2024-01-28',
          primary: 'INCOME',
        }),
      ]);

      await expect(
        service.getAnalysis('2024-01-01', '2024-01-31', mockUserId),
      ).resolves.toMatchObject({
        totalInflow: 10000,
        totalOutflow: 10000,
        inflows: [
          expect.objectContaining({
            primaryCategory: 'INCOME',
            totalAmount: 10000,
          }),
        ],
        outflows: [
          expect.objectContaining({
            primaryCategory: 'LOAN_PAYMENTS',
            totalAmount: 10000,
          }),
        ],
      });
    });

    it('applies exclusion rules before aggregation and neutralization', async () => {
      mockAnalysisRuleService.findActiveForAnalysis.mockResolvedValueOnce([
        buildAnalysisRule({
          id: 'exclude-ignore',
          type: 'exclude',
          excludeScope: {
            mode: 'selected',
            categoryIds: ['cat-IGNORE'],
            includeUncategorized: false,
          },
        }),
      ]);
      mockTransactionRepository.find.mockResolvedValue([
        buildTransaction({
          id: 'ignored',
          amount: 10000,
          sign: MoneySign.NEGATIVE,
          providerDate: '2024-01-28',
          primary: 'IGNORE',
        }),
        buildTransaction({
          id: 'kept',
          amount: 20000,
          sign: MoneySign.NEGATIVE,
          providerDate: '2024-01-28',
          primary: 'FOOD_AND_DRINK',
        }),
      ]);

      await expect(
        service.getAnalysis('2024-01-01', '2024-01-31', mockUserId),
      ).resolves.toMatchObject({
        totalOutflow: 20000,
        outflows: [
          expect.objectContaining({
            primaryCategory: 'FOOD_AND_DRINK',
            totalAmount: 20000,
          }),
        ],
      });
    });

    it('runs specific neutralization pools before broader pools', async () => {
      mockAnalysisRuleService.findActiveForAnalysis.mockResolvedValueOnce([
        broadNeutralizationRule,
        buildAnalysisRule({
          id: 'specific-rent-reimbursement',
          type: 'neutralize',
          inflowScope: {
            mode: 'selected',
            categoryIds: ['cat-REIMBURSEMENT'],
            includeUncategorized: false,
          },
          outflowScope: {
            mode: 'selected',
            categoryIds: ['cat-RENT'],
            includeUncategorized: false,
          },
          createdAt: new Date('2024-01-02T00:00:00Z'),
        }),
      ]);
      mockTransactionRepository.find.mockResolvedValue([
        buildTransaction({
          id: 'rent',
          amount: 10000,
          sign: MoneySign.NEGATIVE,
          providerDate: '2024-01-01',
          primary: 'RENT',
        }),
        buildTransaction({
          id: 'groceries',
          amount: 10000,
          sign: MoneySign.NEGATIVE,
          providerDate: '2024-01-10',
          primary: 'FOOD_AND_DRINK',
        }),
        buildTransaction({
          id: 'rent-reimbursement',
          amount: 10000,
          sign: MoneySign.POSITIVE,
          providerDate: '2024-01-10',
          primary: 'REIMBURSEMENT',
        }),
      ]);

      await expect(
        service.getAnalysis('2024-01-01', '2024-01-31', mockUserId),
      ).resolves.toMatchObject({
        totalInflow: 0,
        totalOutflow: 10000,
        outflows: [
          expect.objectContaining({
            primaryCategory: 'FOOD_AND_DRINK',
            totalAmount: 10000,
          }),
        ],
      });
    });

    it('aggregates transactions under the user category override when present', async () => {
      mockTransactionRepository.find.mockResolvedValue([
        buildTransaction({
          id: 'overridden',
          amount: 1200,
          sign: MoneySign.NEGATIVE,
          providerDate: '2024-01-15',
          primary: 'FOOD_AND_DRINK',
          userPrimary: 'GENERAL_MERCHANDISE',
        }),
      ]);

      const result = await service.getAnalysis(
        '2024-01-01',
        '2024-01-31',
        mockUserId,
      );

      expect(result.outflows).toEqual([
        expect.objectContaining({
          primaryCategory: 'GENERAL_MERCHANDISE',
          totalAmount: 1200,
          transactionCount: 1,
          color: '#228be6',
        }),
      ]);
      expect(
        result.outflows.some(
          (aggregate) => aggregate.primaryCategory === 'FOOD_AND_DRINK',
        ),
      ).toBe(false);
    });

    it('uses the largest contributing category row color for primary aggregates', async () => {
      mockTransactionRepository.find.mockResolvedValue([
        buildTransaction({
          id: 'small-travel',
          amount: 1200,
          sign: MoneySign.NEGATIVE,
          providerDate: '2024-01-15',
          primary: 'Travel',
          detailed: 'Taxi',
          categoryColor: '#111111',
        }),
        buildTransaction({
          id: 'large-travel',
          amount: 4800,
          sign: MoneySign.NEGATIVE,
          providerDate: '2024-01-16',
          primary: 'Travel',
          detailed: 'Flights',
          categoryColor: '#eeeeee',
        }),
      ]);

      const result = await service.getAnalysis(
        '2024-01-01',
        '2024-01-31',
        mockUserId,
      );

      expect(result.outflows).toEqual([
        expect.objectContaining({
          primaryCategory: 'Travel',
          totalAmount: 6000,
          transactionCount: 2,
          color: '#eeeeee',
        }),
      ]);
    });

    it('resolves aggregate colors separately for inflows and outflows', async () => {
      mockTransactionRepository.find.mockResolvedValue([
        buildTransaction({
          id: 'large-travel-outflow',
          amount: 9000,
          sign: MoneySign.NEGATIVE,
          providerDate: '2024-01-15',
          primary: 'Travel',
          detailed: 'Flights',
          categoryColor: '#cc2222',
        }),
        buildTransaction({
          id: 'small-travel-inflow',
          amount: 1200,
          sign: MoneySign.POSITIVE,
          providerDate: '2024-01-16',
          primary: 'Travel',
          detailed: 'Reimbursement',
          categoryColor: '#22cc22',
        }),
      ]);

      const result = await service.getAnalysis(
        '2024-01-01',
        '2024-01-31',
        mockUserId,
      );

      expect(result.inflows).toEqual([
        expect.objectContaining({
          primaryCategory: 'Travel',
          totalAmount: 1200,
          transactionCount: 1,
          color: '#22cc22',
        }),
      ]);
      expect(result.outflows).toEqual([
        expect.objectContaining({
          primaryCategory: 'Travel',
          totalAmount: 9000,
          transactionCount: 1,
          color: '#cc2222',
        }),
      ]);
    });

    it('matches each negative to the nearest positive after deterministic negative ordering', async () => {
      mockTransactionRepository.find.mockResolvedValue([
        buildTransaction({
          id: 'neg-near',
          amount: 6000,
          sign: MoneySign.NEGATIVE,
          providerDate: '2024-01-15',
          primary: 'FOOD_AND_DRINK',
        }),
        buildTransaction({
          id: 'neg-far',
          amount: 6000,
          sign: MoneySign.NEGATIVE,
          providerDate: '2024-01-01',
          primary: 'RENT_AND_UTILITIES',
        }),
        buildTransaction({
          id: 'pos',
          amount: 6000,
          sign: MoneySign.POSITIVE,
          providerDate: '2024-01-14',
          primary: 'INCOME',
        }),
      ]);

      await expect(
        service.getAnalysis('2024-01-01', '2024-01-31', mockUserId),
      ).resolves.toMatchObject({
        totalOutflow: 6000,
        outflows: [
          expect.objectContaining({
            primaryCategory: 'FOOD_AND_DRINK',
            totalAmount: 6000,
            transactionCount: 1,
          }),
        ],
      });
    });

    it('sorts negative candidates by date then id before matching', async () => {
      mockTransactionRepository.find.mockResolvedValue([
        buildTransaction({
          id: 'neg-late',
          amount: 6000,
          sign: MoneySign.NEGATIVE,
          providerDate: '2024-01-15',
          primary: 'FOOD_AND_DRINK',
        }),
        buildTransaction({
          id: 'neg-early-b',
          amount: 6000,
          sign: MoneySign.NEGATIVE,
          providerDate: '2024-01-10',
          primary: 'GENERAL_SERVICES',
        }),
        buildTransaction({
          id: 'neg-early-a',
          amount: 6000,
          sign: MoneySign.NEGATIVE,
          providerDate: '2024-01-10',
          primary: 'RENT_AND_UTILITIES',
        }),
        buildTransaction({
          id: 'pos-early',
          amount: 6000,
          sign: MoneySign.POSITIVE,
          providerDate: '2024-01-10',
          primary: 'INCOME',
        }),
      ]);

      await expect(
        service.getAnalysis('2024-01-01', '2024-01-31', mockUserId),
      ).resolves.toMatchObject({
        totalOutflow: 12000,
        outflows: expect.arrayContaining([
          expect.objectContaining({
            primaryCategory: 'GENERAL_SERVICES',
            totalAmount: 6000,
            transactionCount: 1,
          }),
          expect.objectContaining({
            primaryCategory: 'FOOD_AND_DRINK',
            totalAmount: 6000,
            transactionCount: 1,
          }),
        ]),
      });
    });

    it('does not cancel across different currencies', async () => {
      const usdExpense = buildTransaction({
        id: 'usd-expense',
        amount: 10000,
        sign: MoneySign.NEGATIVE,
        currency: 'USD',
        providerDate: '2024-01-10',
        primary: 'GENERAL_SERVICES',
      });
      const eurIncome = buildTransaction({
        id: 'eur-income',
        amount: 10000,
        sign: MoneySign.POSITIVE,
        currency: 'EUR',
        providerDate: '2024-01-10',
        primary: 'INCOME',
      });

      mockTransactionRepository.find.mockResolvedValue([usdExpense, eurIncome]);

      const result = await service.getAnalysis(
        '2024-01-01',
        '2024-01-31',
        mockUserId,
      );

      expect(result.totalInflow).toBe(11000);
      expect(result.totalOutflow).toBe(10000);
      expect(result.netFlow).toBe(1000);
      expect(result.inflows).toEqual([
        expect.objectContaining({
          primaryCategory: 'INCOME',
          totalAmount: 11000,
          currency: 'USD',
          transactionCount: 1,
        }),
      ]);
      expect(result.outflows).toEqual([
        expect.objectContaining({
          primaryCategory: 'GENERAL_SERVICES',
          totalAmount: 10000,
          currency: 'USD',
          transactionCount: 1,
        }),
      ]);

      expect(mockCurrencyConversionService.getRateMap).toHaveBeenCalledWith(
        ['EUR'],
        'USD',
        '2024-01-31',
      );
    });

    it('does not cancel transactions that fall in different analysis windows', async () => {
      const februaryExpense = buildTransaction({
        id: 'feb-expense',
        amount: 9000,
        sign: MoneySign.NEGATIVE,
        providerDate: '2024-02-29',
        primary: 'GENERAL_SERVICES',
      });
      const marchIncome = buildTransaction({
        id: 'march-income',
        amount: 9000,
        sign: MoneySign.POSITIVE,
        providerDate: '2024-03-01',
        primary: 'INCOME',
      });

      mockTransactionRepository.find
        .mockResolvedValueOnce([februaryExpense])
        .mockResolvedValueOnce([marchIncome]);

      const februaryResult = await service.getAnalysis(
        '2024-02-01',
        '2024-02-29',
        mockUserId,
      );
      const marchResult = await service.getAnalysis(
        '2024-03-01',
        '2024-03-31',
        mockUserId,
      );

      expect(februaryResult.totalOutflow).toBe(9000);
      expect(februaryResult.totalInflow).toBe(0);
      expect(februaryResult.outflows).toEqual([
        expect.objectContaining({
          primaryCategory: 'GENERAL_SERVICES',
          totalAmount: 9000,
          currency: 'USD',
          transactionCount: 1,
        }),
      ]);
      expect(februaryResult.inflows).toEqual([]);

      expect(marchResult.totalInflow).toBe(9000);
      expect(marchResult.totalOutflow).toBe(0);
      expect(marchResult.inflows).toEqual([
        expect.objectContaining({
          primaryCategory: 'INCOME',
          totalAmount: 9000,
          currency: 'USD',
          transactionCount: 1,
        }),
      ]);
      expect(marchResult.outflows).toEqual([]);

      expect(mockTransactionRepository.find).toHaveBeenCalledTimes(2);
      expect(mockTransactionRepository.find).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          where: expect.objectContaining({
            userId: mockUserId,
            pending: false,
          }),
          relations: ['account', 'category'],
        }),
      );
      expect(mockTransactionRepository.find).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          where: expect.objectContaining({
            userId: mockUserId,
            pending: false,
          }),
          relations: ['account', 'category'],
        }),
      );
    });

    it('neutralizes a production-shaped mirrored pair even when categories disagree', async () => {
      mockTransactionRepository.find.mockResolvedValue([
        buildTransaction({
          id: 'bilt-negative',
          amount: 243360,
          sign: MoneySign.NEGATIVE,
          providerDate: '2026-02-28',
          primary: 'LOAN_PAYMENTS',
        }),
        buildTransaction({
          id: 'bilt-positive',
          amount: 243360,
          sign: MoneySign.POSITIVE,
          providerDate: '2026-02-28',
          primary: 'INCOME',
        }),
      ]);

      await expect(
        service.getAnalysis('2026-02-01', '2026-02-28', mockUserId),
      ).resolves.toMatchObject({
        totalInflow: 0,
        totalOutflow: 0,
        inflows: [],
        outflows: [],
      });
    });

    it('keeps unmatched posted transactions in formerly excluded categories', async () => {
      mockTransactionRepository.find.mockResolvedValue([
        buildTransaction({
          id: 'unmatched-transfer-in',
          amount: 25000,
          sign: MoneySign.POSITIVE,
          providerDate: '2024-01-06',
          primary: 'TRANSFER_IN',
          detailed: 'TRANSFER_IN_ACCOUNT_TRANSFER',
        }),
        buildTransaction({
          id: 'unmatched-transfer-out',
          amount: 150000,
          sign: MoneySign.NEGATIVE,
          providerDate: '2024-01-07',
          primary: 'TRANSFER_OUT',
          detailed: 'TRANSFER_OUT_ACCOUNT_TRANSFER',
        }),
        buildTransaction({
          id: 'unmatched-loan-payment',
          amount: 45000,
          sign: MoneySign.NEGATIVE,
          providerDate: '2024-01-08',
          primary: 'LOAN_PAYMENTS',
          detailed: 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT',
        }),
      ]);

      await expect(
        service.getAnalysis('2024-01-01', '2024-01-31', mockUserId),
      ).resolves.toMatchObject({
        totalInflow: 25000,
        totalOutflow: 195000,
        inflows: [
          expect.objectContaining({
            primaryCategory: 'TRANSFER_IN',
            totalAmount: 25000,
            transactionCount: 1,
          }),
        ],
        outflows: expect.arrayContaining([
          expect.objectContaining({
            primaryCategory: 'TRANSFER_OUT',
            totalAmount: 150000,
            transactionCount: 1,
          }),
          expect.objectContaining({
            primaryCategory: 'LOAN_PAYMENTS',
            totalAmount: 45000,
            transactionCount: 1,
          }),
        ]),
      });
    });

    it('still aggregates unmatched posted transactions into their categories', async () => {
      mockTransactionRepository.find.mockResolvedValue([
        buildTransaction({
          id: 'paycheck',
          amount: 300000,
          sign: MoneySign.POSITIVE,
          providerDate: '2024-01-05',
          primary: 'INCOME',
        }),
        buildTransaction({
          id: 'rent',
          amount: 150000,
          sign: MoneySign.NEGATIVE,
          providerDate: '2024-01-07',
          primary: 'RENT_AND_UTILITIES',
        }),
        buildTransaction({
          id: 'groceries',
          amount: 50000,
          sign: MoneySign.NEGATIVE,
          providerDate: '2024-01-08',
          primary: 'FOOD_AND_DRINK',
        }),
      ]);

      await expect(
        service.getAnalysis('2024-01-01', '2024-01-31', mockUserId),
      ).resolves.toMatchObject({
        totalInflow: 300000,
        totalOutflow: 200000,
        inflows: [
          expect.objectContaining({
            primaryCategory: 'INCOME',
            totalAmount: 300000,
            transactionCount: 1,
          }),
        ],
        outflows: [
          expect.objectContaining({
            primaryCategory: 'RENT_AND_UTILITIES',
            totalAmount: 150000,
            transactionCount: 1,
          }),
          expect.objectContaining({
            primaryCategory: 'FOOD_AND_DRINK',
            totalAmount: 50000,
            transactionCount: 1,
          }),
        ],
      });
    });

    it('adds an inflow BALANCE_ADJUSTMENT when no posted transactions exist and snapshots indicate growth', async () => {
      const checking = buildAccount({
        id: 'acct-inflow',
        accountName: 'Checking',
        accountCustomName: 'Primary Checking',
      });
      const preStartSnapshot = buildBalanceSnapshot({
        accountId: 'acct-inflow',
        snapshotDate: '2023-12-20',
        amount: 5000,
      });
      const startSnapshot = buildBalanceSnapshot({
        accountId: 'acct-inflow',
        snapshotDate: '2023-12-31',
        amount: 10000,
      });
      const midSnapshot = buildBalanceSnapshot({
        accountId: 'acct-inflow',
        snapshotDate: '2024-01-15',
        amount: 15000,
      });
      const endSnapshot = buildBalanceSnapshot({
        accountId: 'acct-inflow',
        snapshotDate: '2024-01-29',
        amount: 17500,
      });
      const futureSnapshot = buildBalanceSnapshot({
        accountId: 'acct-inflow',
        snapshotDate: '2024-02-15',
        amount: 99999,
      });

      mockTransactionRepository.find.mockResolvedValue([]);
      mockAccountRepository.find.mockResolvedValue([checking]);
      mockSnapshotRows([
        futureSnapshot,
        preStartSnapshot,
        startSnapshot,
        midSnapshot,
        endSnapshot,
      ]);

      await expect(
        service.getAnalysis('2024-01-01', '2024-01-31', mockUserId),
      ).resolves.toMatchObject({
        totalInflow: 7500,
        totalOutflow: 0,
        netFlow: 7500,
        balanceAdjustments: [
          expect.objectContaining({
            accountId: 'acct-inflow',
            flowDirection: 'inflow',
            currency: 'USD',
            deltaAmount: 7500,
          }),
        ],
        inflows: [
          expect.objectContaining({
            primaryCategory: 'BALANCE_ADJUSTMENT',
            totalAmount: 7500,
            currency: 'USD',
            transactionCount: 1,
          }),
        ],
        uncategorizedInflow: 0,
        uncategorizedOutflow: 0,
      });
    });

    it('adds an outflow BALANCE_ADJUSTMENT when no posted transactions exist and snapshots indicate decline', async () => {
      const savings = buildAccount({
        id: 'acct-outflow',
        accountName: 'Savings',
        accountCustomName: 'High Yield Savings',
      });
      const preStartSnapshot = buildBalanceSnapshot({
        accountId: 'acct-outflow',
        snapshotDate: '2023-12-20',
        amount: 14000,
      });
      const startSnapshot = buildBalanceSnapshot({
        accountId: 'acct-outflow',
        snapshotDate: '2024-01-01',
        amount: 12000,
      });
      const midSnapshot = buildBalanceSnapshot({
        accountId: 'acct-outflow',
        snapshotDate: '2024-01-12',
        amount: 5000,
      });
      const endSnapshot = buildBalanceSnapshot({
        accountId: 'acct-outflow',
        snapshotDate: '2024-01-31',
        amount: 3000,
      });
      const futureSnapshot = buildBalanceSnapshot({
        accountId: 'acct-outflow',
        snapshotDate: '2024-02-15',
        amount: 1,
      });

      mockTransactionRepository.find.mockResolvedValue([]);
      mockAccountRepository.find.mockResolvedValue([savings]);
      mockSnapshotRows([
        preStartSnapshot,
        startSnapshot,
        midSnapshot,
        endSnapshot,
        futureSnapshot,
      ]);

      await expect(
        service.getAnalysis('2024-01-01', '2024-01-31', mockUserId),
      ).resolves.toMatchObject({
        totalInflow: 0,
        totalOutflow: 9000,
        netFlow: -9000,
        balanceAdjustments: [
          expect.objectContaining({
            accountId: 'acct-outflow',
            flowDirection: 'outflow',
            currency: 'USD',
            deltaAmount: 9000,
          }),
        ],
        outflows: [
          expect.objectContaining({
            primaryCategory: 'BALANCE_ADJUSTMENT',
            totalAmount: 9000,
            currency: 'USD',
            transactionCount: 1,
          }),
        ],
        uncategorizedInflow: 0,
        uncategorizedOutflow: 0,
      });
    });

    it('does not create synthetic adjustments for accounts with in-range posted transactions', async () => {
      const accountWithPosted = buildAccount({
        id: 'acct-posted-excluded',
        accountName: 'Checking',
        accountCustomName: 'Checking with activity',
      });
      const startSnapshot = buildBalanceSnapshot({
        accountId: 'acct-posted-excluded',
        snapshotDate: '2024-01-01',
        amount: 3000,
      });
      const endSnapshot = buildBalanceSnapshot({
        accountId: 'acct-posted-excluded',
        snapshotDate: '2024-01-31',
        amount: 4500,
      });

      mockTransactionRepository.find.mockResolvedValue([
        buildTransaction({
          id: 'posted-adjustment-offset',
          amount: 1000,
          sign: MoneySign.POSITIVE,
          providerDate: '2024-01-15',
          accountId: 'acct-posted-excluded',
          primary: 'INCOME',
        }),
      ]);
      mockAccountRepository.find.mockResolvedValue([accountWithPosted]);
      mockSnapshotRows([startSnapshot, endSnapshot]);

      await expect(
        service.getAnalysis('2024-01-01', '2024-01-31', mockUserId),
      ).resolves.toMatchObject({
        totalInflow: 1000,
        totalOutflow: 0,
        balanceAdjustments: [],
        inflows: [
          expect.objectContaining({
            primaryCategory: 'INCOME',
            totalAmount: 1000,
            currency: 'USD',
            transactionCount: 1,
          }),
        ],
      });
    });

    it.each([
      {
        title: 'skips investment accounts even when snapshots imply a delta',
        type: AccountType.Investment,
      },
      {
        title: 'skips crypto wallet accounts even when snapshots imply a delta',
        type: CryptoAccountType.CRYPTO_WALLET,
      },
    ])('$title', async ({ type }) => {
      const nonCashAccount = buildAccount({
        id: `acct-${type}-excluded`,
        accountName: 'Non-cash account',
        type,
      });
      const startSnapshot = buildBalanceSnapshot({
        accountId: nonCashAccount.id,
        snapshotDate: '2024-01-01',
        amount: 3000,
      });
      const endSnapshot = buildBalanceSnapshot({
        accountId: nonCashAccount.id,
        snapshotDate: '2024-01-31',
        amount: 4500,
      });

      mockTransactionRepository.find.mockResolvedValue([]);
      mockAccountRepository.find.mockResolvedValue([nonCashAccount]);
      mockSnapshotRows([startSnapshot, endSnapshot]);

      await expect(
        service.getAnalysis('2024-01-01', '2024-01-31', mockUserId),
      ).resolves.toMatchObject({
        totalInflow: 0,
        totalOutflow: 0,
        netFlow: 0,
        balanceAdjustments: [],
        inflows: [],
        outflows: [],
      });
    });

    it.each([
      {
        title: 'skips accounts with only an end boundary snapshot',
        snapshots: [
          buildBalanceSnapshot({
            accountId: 'acct-missing-boundary',
            snapshotDate: '2024-01-31',
            amount: 2000,
          }),
        ],
      },
      {
        title: 'skips accounts with only a start boundary snapshot',
        snapshots: [
          buildBalanceSnapshot({
            accountId: 'acct-missing-boundary',
            snapshotDate: '2024-01-01',
            amount: 1500,
          }),
        ],
      },
    ])('$title', async ({ snapshots }) => {
      const checking = buildAccount({
        id: 'acct-missing-boundary',
        accountName: 'Checking',
      });

      mockTransactionRepository.find.mockResolvedValue([]);
      mockAccountRepository.find.mockResolvedValue([checking]);
      mockSnapshotRows(snapshots);

      await expect(
        service.getAnalysis('2024-01-01', '2024-01-31', mockUserId),
      ).resolves.toMatchObject({
        totalInflow: 0,
        totalOutflow: 0,
        netFlow: 0,
        balanceAdjustments: [],
        inflows: [],
        outflows: [],
      });
    });

    it('keeps synthetic adjustments out of uncategorized totals', async () => {
      const accountWithPosted = buildAccount({
        id: 'acct-with-posted',
        accountName: 'Everyday',
      });
      const adjustmentAccount = buildAccount({
        id: 'acct-adjust-only',
        accountName: 'Investment',
        accountCustomName: 'Growth Bucket',
      });
      const adjustmentStart = buildBalanceSnapshot({
        accountId: 'acct-adjust-only',
        snapshotDate: '2024-01-01',
        amount: 1000,
      });
      const adjustmentEnd = buildBalanceSnapshot({
        accountId: 'acct-adjust-only',
        snapshotDate: '2024-01-31',
        amount: 2500,
      });

      mockTransactionRepository.find.mockResolvedValue([
        buildTransaction({
          id: 'uncategorized-receipt',
          amount: 700,
          sign: MoneySign.POSITIVE,
          providerDate: '2024-01-10',
          accountId: 'acct-with-posted',
        }),
      ]);
      mockAccountRepository.find.mockResolvedValue([
        accountWithPosted,
        adjustmentAccount,
      ]);
      mockSnapshotRows([adjustmentStart, adjustmentEnd]);

      await expect(
        service.getAnalysis('2024-01-01', '2024-01-31', mockUserId),
      ).resolves.toMatchObject({
        totalInflow: 2200,
        totalOutflow: 0,
        uncategorizedInflow: 700,
        uncategorizedOutflow: 0,
        balanceAdjustments: [
          expect.objectContaining({
            accountId: 'acct-adjust-only',
            flowDirection: 'inflow',
            currency: 'USD',
            deltaAmount: 1500,
          }),
        ],
        inflows: expect.arrayContaining([
          expect.objectContaining({
            primaryCategory: 'UNCATEGORIZED',
            totalAmount: 700,
            currency: 'USD',
            transactionCount: 1,
          }),
          expect.objectContaining({
            primaryCategory: 'BALANCE_ADJUSTMENT',
            totalAmount: 1500,
            currency: 'USD',
            transactionCount: 1,
          }),
        ]),
      });
    });

    it('skips foreign-currency balance adjustments when no FX rate is available', async () => {
      const euroAccount = buildAccount({
        id: 'acct-eur',
        accountName: 'Euro Savings',
      });
      const startSnapshot = buildBalanceSnapshot({
        accountId: 'acct-eur',
        snapshotDate: '2024-01-01',
        amount: 1000,
        currency: 'EUR',
      });
      const endSnapshot = buildBalanceSnapshot({
        accountId: 'acct-eur',
        snapshotDate: '2024-01-31',
        amount: 2000,
        currency: 'EUR',
      });

      mockTransactionRepository.find.mockResolvedValue([]);
      mockAccountRepository.find.mockResolvedValue([euroAccount]);
      mockSnapshotRows([startSnapshot, endSnapshot]);
      mockCurrencyConversionService.getRateMap.mockResolvedValue(new Map());

      await expect(
        service.getAnalysis('2024-01-01', '2024-01-31', mockUserId),
      ).resolves.toMatchObject({
        totalInflow: 0,
        totalOutflow: 0,
        netFlow: 0,
        balanceAdjustments: [],
        inflows: [],
        outflows: [],
      });
    });

    it('converts foreign-currency balance adjustment start and end balances into the preferred currency', async () => {
      const euroAccount = buildAccount({
        id: 'acct-eur-converted',
        accountName: 'Euro Savings',
      });
      const startSnapshot = buildBalanceSnapshot({
        accountId: 'acct-eur-converted',
        snapshotDate: '2024-01-01',
        amount: 1000,
        currency: 'EUR',
      });
      const endSnapshot = buildBalanceSnapshot({
        accountId: 'acct-eur-converted',
        snapshotDate: '2024-01-31',
        amount: 2000,
        currency: 'EUR',
      });

      mockTransactionRepository.find.mockResolvedValue([]);
      mockAccountRepository.find.mockResolvedValue([euroAccount]);
      mockSnapshotRows([startSnapshot, endSnapshot]);
      mockCurrencyConversionService.getRateMap.mockResolvedValue(
        new Map([['EUR', 1.1]]),
      );

      await expect(
        service.getAnalysis('2024-01-01', '2024-01-31', mockUserId),
      ).resolves.toMatchObject({
        totalInflow: 1100,
        totalOutflow: 0,
        netFlow: 1100,
        balanceAdjustments: [
          expect.objectContaining({
            accountId: 'acct-eur-converted',
            currency: 'USD',
            deltaAmount: 1100,
            startBalance: {
              amount: 1100,
              currency: 'USD',
            },
            endBalance: {
              amount: 2200,
              currency: 'USD',
            },
          }),
        ],
      });
    });

    it('sorts balance adjustment rows deterministically and uses a neutral unnamed-account fallback', async () => {
      const unnamedAccount = buildAccount({
        id: 'acct-c',
        accountName: null,
        accountCustomName: null,
      });
      const sharedNameFromName = buildAccount({
        id: 'acct-b',
        accountName: 'Shared',
      });
      const sharedNameFromCustom = buildAccount({
        id: 'acct-a',
        accountName: 'Checking',
        accountCustomName: 'Shared',
      });

      mockTransactionRepository.find.mockResolvedValue([]);
      mockAccountRepository.find.mockResolvedValue([
        unnamedAccount,
        sharedNameFromName,
        sharedNameFromCustom,
      ]);
      mockSnapshotRows([
        buildBalanceSnapshot({
          accountId: 'acct-c',
          snapshotDate: '2024-01-01',
          amount: 1000,
        }),
        buildBalanceSnapshot({
          accountId: 'acct-c',
          snapshotDate: '2024-01-31',
          amount: 1200,
        }),
        buildBalanceSnapshot({
          accountId: 'acct-b',
          snapshotDate: '2024-01-01',
          amount: 2000,
        }),
        buildBalanceSnapshot({
          accountId: 'acct-b',
          snapshotDate: '2024-01-31',
          amount: 2200,
        }),
        buildBalanceSnapshot({
          accountId: 'acct-a',
          snapshotDate: '2024-01-01',
          amount: 3000,
        }),
        buildBalanceSnapshot({
          accountId: 'acct-a',
          snapshotDate: '2024-01-31',
          amount: 3300,
        }),
      ]);

      await expect(
        service.getAnalysis('2024-01-01', '2024-01-31', mockUserId),
      ).resolves.toMatchObject({
        balanceAdjustments: [
          expect.objectContaining({
            accountId: 'acct-a',
            accountName: 'Shared',
          }),
          expect.objectContaining({
            accountId: 'acct-b',
            accountName: 'Shared',
          }),
          expect.objectContaining({
            accountId: 'acct-c',
            accountName: 'Unnamed account',
          }),
        ],
      });
    });
  });

  describe('getCategoryTransactions', () => {
    it('returns only unmatched positive transactions for an inflow category', async () => {
      mockTransactionRepository.find.mockResolvedValue([
        buildTransaction({
          id: 'bilt-negative',
          amount: 243360,
          sign: MoneySign.NEGATIVE,
          providerDate: '2026-02-28',
          primary: 'LOAN_PAYMENTS',
        }),
        buildTransaction({
          id: 'bilt-positive',
          amount: 243360,
          sign: MoneySign.POSITIVE,
          providerDate: '2026-02-28',
          primary: 'INCOME',
        }),
        buildTransaction({
          id: 'interest',
          amount: 4083,
          sign: MoneySign.POSITIVE,
          providerDate: '2026-02-28',
          primary: 'INCOME',
        }),
      ]);

      const result = await service.getCategoryTransactions(
        '2026-02-01',
        '2026-02-28',
        'INCOME',
        'inflow',
        mockUserId,
      );

      expect(result.map((transaction) => transaction.id)).toEqual(['interest']);
    });

    it('filters drilldown rows by effective category override', async () => {
      mockTransactionRepository.find.mockResolvedValue([
        buildTransaction({
          id: 'overridden',
          amount: 1200,
          sign: MoneySign.NEGATIVE,
          providerDate: '2024-01-15',
          primary: 'FOOD_AND_DRINK',
          userPrimary: 'GENERAL_MERCHANDISE',
        }),
      ]);

      const result = await service.getCategoryTransactions(
        '2024-01-01',
        '2024-01-31',
        'GENERAL_MERCHANDISE',
        'outflow',
        mockUserId,
      );

      expect(result.map((transaction) => transaction.id)).toEqual([
        'overridden',
      ]);
      expect(result[0].category?.primary).toBe('GENERAL_MERCHANDISE');
    });

    it('removes matched Bilt mirror rows from the LOAN_PAYMENTS outflow drilldown', async () => {
      mockTransactionRepository.find.mockResolvedValue([
        buildTransaction({
          id: 'bilt-negative',
          amount: 243360,
          sign: MoneySign.NEGATIVE,
          providerDate: '2026-02-28',
          primary: 'LOAN_PAYMENTS',
          detailed: 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT',
        }),
        buildTransaction({
          id: 'bilt-positive',
          amount: 243360,
          sign: MoneySign.POSITIVE,
          providerDate: '2026-02-28',
          primary: 'INCOME',
          detailed: 'INCOME_OTHER_INCOME',
        }),
        buildTransaction({
          id: 'real-loan-payment',
          amount: 1887,
          sign: MoneySign.NEGATIVE,
          providerDate: '2026-02-19',
          primary: 'LOAN_PAYMENTS',
          detailed: 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT',
        }),
      ]);

      const result = await service.getCategoryTransactions(
        '2026-02-01',
        '2026-02-28',
        'LOAN_PAYMENTS',
        'outflow',
        mockUserId,
      );

      expect(result.map((transaction) => transaction.id)).toEqual([
        'real-loan-payment',
      ]);
    });

    it('converts drilldown rows with rates anchored to endDate', async () => {
      mockTransactionRepository.find.mockResolvedValue([
        buildTransaction({
          id: 'eur-income',
          amount: 10000,
          sign: MoneySign.POSITIVE,
          currency: 'EUR',
          providerDate: '2024-01-10',
          primary: 'INCOME',
        }),
      ]);

      mockCurrencyConversionService.getRateMap.mockResolvedValue(
        new Map([['EUR', 1.1]]),
      );

      const result = await service.getCategoryTransactions(
        '2024-01-01',
        '2024-01-31',
        'INCOME',
        'inflow',
        mockUserId,
      );

      expect(mockCurrencyConversionService.getRateMap).toHaveBeenCalledWith(
        ['EUR'],
        'USD',
        '2024-01-31',
      );
      expect(result[0]?.convertedAmount?.money.amount).toBe(11000);
    });

    it('returns drilldown rows sorted by date descending then id descending', async () => {
      mockTransactionRepository.find.mockResolvedValue([
        buildTransaction({
          id: 'older-id',
          amount: 1000,
          sign: MoneySign.NEGATIVE,
          providerDate: '2024-01-10',
          primary: 'FOOD_AND_DRINK',
        }),
        buildTransaction({
          id: 'newer-id',
          amount: 2000,
          sign: MoneySign.NEGATIVE,
          providerDate: '2024-01-12',
          primary: 'FOOD_AND_DRINK',
        }),
        buildTransaction({
          id: 'same-day-b',
          amount: 3000,
          sign: MoneySign.NEGATIVE,
          providerDate: '2024-01-10',
          primary: 'FOOD_AND_DRINK',
        }),
      ]);

      const result = await service.getCategoryTransactions(
        '2024-01-01',
        '2024-01-31',
        'FOOD_AND_DRINK',
        'outflow',
        mockUserId,
      );

      expect(result.map((transaction) => transaction.id)).toEqual([
        'newer-id',
        'same-day-b',
        'older-id',
      ]);
    });

    it('preserves accountName from the loaded account relation in drilldown rows', async () => {
      mockTransactionRepository.find.mockResolvedValue([
        buildTransaction({
          id: 'paycheck',
          amount: 10000,
          sign: MoneySign.POSITIVE,
          providerDate: '2024-01-10',
          primary: 'INCOME',
          accountName: 'Payroll Checking',
          accountCustomName: 'Main Checking',
        }),
      ]);

      const result = await service.getCategoryTransactions(
        '2024-01-01',
        '2024-01-31',
        'INCOME',
        'inflow',
        mockUserId,
      );

      expect(mockTransactionRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          relations: ['account', 'category'],
        }),
      );
      expect(result[0]?.accountName).toBe('Main Checking');
    });
  });

  describe('getBalanceAdjustments', () => {
    const seedBalanceAdjustmentAnalysis = async () => {
      const inflowAccount = buildAccount({
        id: 'acct-inflow',
        accountName: 'Checking',
        accountCustomName: 'Primary Checking',
      });
      const outflowAccount = buildAccount({
        id: 'acct-outflow',
        accountName: 'Savings',
        accountCustomName: 'High Yield Savings',
      });

      mockTransactionRepository.find.mockResolvedValue([]);
      mockAccountRepository.find.mockResolvedValue([
        inflowAccount,
        outflowAccount,
      ]);
      mockSnapshotRows([
        buildBalanceSnapshot({
          accountId: 'acct-inflow',
          snapshotDate: '2023-12-31',
          amount: 5000,
        }),
        buildBalanceSnapshot({
          accountId: 'acct-inflow',
          snapshotDate: '2024-01-31',
          amount: 6500,
        }),
        buildBalanceSnapshot({
          accountId: 'acct-outflow',
          snapshotDate: '2023-12-31',
          amount: 9000,
        }),
        buildBalanceSnapshot({
          accountId: 'acct-outflow',
          snapshotDate: '2024-01-31',
          amount: 7000,
        }),
      ]);

      return service.getAnalysis('2024-01-01', '2024-01-31', mockUserId);
    };

    it('returns only inflow balance adjustments when requested', async () => {
      const analysis = await seedBalanceAdjustmentAnalysis();

      await expect(
        (
          service as unknown as {
            getBalanceAdjustments: (
              startDate: string,
              endDate: string,
              categoryPrimary: 'BALANCE_ADJUSTMENT',
              flowDirection: 'inflow' | 'outflow',
              userId: string,
            ) => Promise<unknown[]>;
          }
        ).getBalanceAdjustments(
          '2024-01-01',
          '2024-01-31',
          'BALANCE_ADJUSTMENT',
          'inflow',
          mockUserId,
        ),
      ).resolves.toEqual(
        analysis.balanceAdjustments.filter(
          (adjustment) => adjustment.flowDirection === 'inflow',
        ),
      );
    });

    it('returns only outflow balance adjustments when requested', async () => {
      const analysis = await seedBalanceAdjustmentAnalysis();

      await expect(
        (
          service as unknown as {
            getBalanceAdjustments: (
              startDate: string,
              endDate: string,
              categoryPrimary: 'BALANCE_ADJUSTMENT',
              flowDirection: 'inflow' | 'outflow',
              userId: string,
            ) => Promise<unknown[]>;
          }
        ).getBalanceAdjustments(
          '2024-01-01',
          '2024-01-31',
          'BALANCE_ADJUSTMENT',
          'outflow',
          mockUserId,
        ),
      ).resolves.toEqual(
        analysis.balanceAdjustments.filter(
          (adjustment) => adjustment.flowDirection === 'outflow',
        ),
      );
    });

    it('rejects unsupported categoryPrimary values before reading balance adjustment data', async () => {
      await expect(
        (
          service as unknown as {
            getBalanceAdjustments: (
              startDate: string,
              endDate: string,
              categoryPrimary: string,
              flowDirection: 'inflow' | 'outflow',
              userId: string,
            ) => Promise<unknown[]>;
          }
        ).getBalanceAdjustments(
          '2024-01-01',
          '2024-01-31',
          'INCOME',
          'inflow',
          mockUserId,
        ),
      ).rejects.toThrow('Unsupported categoryPrimary: INCOME');

      expect(
        mockCurrencyConversionService.getPreferredCurrency,
      ).not.toHaveBeenCalled();
      expect(mockTransactionRepository.find).not.toHaveBeenCalled();
      expect(mockAccountRepository.find).not.toHaveBeenCalled();
      expect(
        mockBalanceSnapshotRepository.createQueryBuilder,
      ).not.toHaveBeenCalled();
    });
  });
});
