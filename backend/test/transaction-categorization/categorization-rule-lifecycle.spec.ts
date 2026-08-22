import { ConflictException } from '@nestjs/common';
import { AccountEntity } from '../../src/account/account.entity';
import { CategoryEntity } from '../../src/category/category.entity';
import { BalanceColumns } from '../../src/common/balance.columns';
import { TransactionEntity } from '../../src/transaction/transaction.entity';
import { CategorizationRuleEntity } from '../../src/transaction-categorization/categorization-rule.entity';
import { TransactionCategorizationService } from '../../src/transaction-categorization/categorization-rule.service';
import { RuleBasedCategorizationEngine } from '../../src/transaction-categorization/rule-based-categorization.engine';
import { MoneySign } from '../../src/types/MoneyWithSign';

const userId = '11111111-1111-4111-8111-111111111111';
const accountId = '22222222-2222-4222-8222-222222222222';
const salaryCategoryId = '33333333-3333-4333-8333-333333333333';
const reimbursementCategoryId = '44444444-4444-4444-8444-444444444444';
const broadRuleId = '55555555-5555-4555-8555-555555555555';
const fallbackRuleId = '66666666-6666-4666-8666-666666666666';

function buildCategory(id: string): CategoryEntity {
  return {
    id,
    userId,
    primary: id === salaryCategoryId ? 'Income' : 'Transfer',
    detailed: id === salaryCategoryId ? 'Salary' : 'Reimbursement',
    color: '#228be6',
    archivedAt: null,
  } as CategoryEntity;
}

function buildRule(
  overrides: Partial<CategorizationRuleEntity> = {},
): CategorizationRuleEntity {
  return {
    id: broadRuleId,
    userId,
    name: 'Broad income wages',
    priority: 10,
    targetCategoryId: salaryCategoryId,
    conditions: [
      {
        field: 'providerCategoryDetailed',
        operator: 'equals',
        value: 'income_wages',
      },
    ],
    archivedAt: null,
    createdAt: new Date('2026-02-01T00:00:00.000Z'),
    updatedAt: new Date('2026-02-14T00:00:00.000Z'),
    ...overrides,
  } as CategorizationRuleEntity;
}

function buildTransaction(params: {
  id: string;
  merchantName: string;
  categoryAssignmentSource?: 'manual' | 'rule' | null;
  categoryAssignmentRuleId?: string | null;
  categoryId?: string | null;
  source?: 'provider' | 'manual';
}): TransactionEntity {
  const transaction = TransactionEntity.fromDto(
    {
      accountId,
      amount: {
        money: { amount: 100_00, currency: 'USD' },
        sign: MoneySign.POSITIVE,
      },
      merchantName: params.merchantName,
      providerTransactionName: params.merchantName,
      originalDescription: params.merchantName,
      pending: false,
      providerDate: '2026-02-14',
      personalFinanceCategory: {
        primary: 'INCOME',
        detailed: 'INCOME_WAGES',
      },
    },
    userId,
  );
  transaction.id = params.id;
  transaction.createdAt = new Date('2026-02-14T00:00:00.000Z');
  transaction.updatedAt = new Date('2026-02-14T00:00:00.000Z');
  transaction.activity.createdAt = transaction.createdAt;
  transaction.activity.updatedAt = transaction.updatedAt;
  transaction.amount = BalanceColumns.fromMoneyWithSign({
    money: { amount: 100_00, currency: 'USD' },
    sign: MoneySign.POSITIVE,
  });
  transaction.source = params.source ?? 'provider';
  transaction.categoryAssignmentSource =
    params.categoryAssignmentSource ?? null;
  transaction.categoryAssignmentRuleId =
    params.categoryAssignmentRuleId ?? null;
  transaction.categoryId = params.categoryId ?? null;
  transaction.category = null;
  return transaction;
}

function findOperatorType(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  return Reflect.get(value, '_type') as string | undefined;
}

function createHarness(
  rules: CategorizationRuleEntity[],
  transactions: TransactionEntity[],
) {
  const categories = [
    buildCategory(salaryCategoryId),
    buildCategory(reimbursementCategoryId),
  ];
  const ruleRepository = {
    find: jest.fn(async (options?: { where?: Record<string, unknown> }) => {
      const archiveFilter = options?.where?.archivedAt;
      const archiveType = findOperatorType(archiveFilter);
      if (archiveType === 'isNull') {
        return rules.filter((rule) => rule.archivedAt === null);
      }
      if (archiveType === 'not') {
        return rules.filter((rule) => rule.archivedAt !== null);
      }
      return rules;
    }),
    findOne: jest.fn(
      async (options: { where: Record<string, unknown> }) =>
        rules.find(
          (rule) =>
            rule.id === options.where.id &&
            rule.userId === options.where.userId &&
            (findOperatorType(options.where.archivedAt) !== 'isNull' ||
              rule.archivedAt === null),
        ) ?? null,
    ),
    create: jest.fn(
      (value: Partial<CategorizationRuleEntity>) =>
        value as CategorizationRuleEntity,
    ),
    save: jest.fn(async (rule: CategorizationRuleEntity) => rule),
    update: jest.fn(
      async (
        criteria: { id: string; userId: string; updatedAt: Date },
        next: Partial<CategorizationRuleEntity>,
      ) => {
        const rule = rules.find(
          (candidate) =>
            candidate.id === criteria.id &&
            candidate.userId === criteria.userId &&
            candidate.updatedAt.getTime() === criteria.updatedAt.getTime(),
        );
        if (!rule) {
          return { affected: 0 };
        }
        Object.assign(rule, next, {
          updatedAt: new Date(criteria.updatedAt.getTime() + 1_000),
        });
        return { affected: 1 };
      },
    ),
    createQueryBuilder: jest.fn(),
  };
  const accountRepository = {
    find: jest.fn().mockResolvedValue([{ id: accountId } as AccountEntity]),
  };
  const categoryRepository = {
    findOne: jest.fn(
      async (options: { where: { id: string; userId: string } }) =>
        categories.find(
          (category) =>
            category.id === options.where.id &&
            category.userId === options.where.userId,
        ) ?? null,
    ),
    find: jest.fn(async (options: { where: { id: { _value?: string[] } } }) => {
      const ids = options.where.id._value;
      return ids
        ? categories.filter((category) => ids.includes(category.id))
        : categories;
    }),
  };
  const transactionRepoForManager = {
    find: jest.fn().mockResolvedValue(transactions),
    save: jest.fn(async (updates: TransactionEntity[]) => updates),
  };
  const categoryRepoForManager = {
    findOne: jest.fn(
      async (options: { where: { id: string } }) =>
        categories.find((category) => category.id === options.where.id) ?? null,
    ),
  };
  const manager = {
    transaction: jest.fn(async (callback: (value: unknown) => unknown) =>
      callback(manager),
    ),
    getRepository: jest.fn((entity: unknown) => {
      if (entity === TransactionEntity) {
        return transactionRepoForManager;
      }
      if (entity === CategoryEntity) {
        return categoryRepoForManager;
      }
      return ruleRepository;
    }),
  };
  const transactionRepository = {
    find: jest.fn().mockResolvedValue(transactions),
    manager,
  };
  const service = new TransactionCategorizationService(
    ruleRepository as never,
    accountRepository as never,
    categoryRepository as never,
    transactionRepository as never,
    new RuleBasedCategorizationEngine(),
  );

  return { service, ruleRepository, transactionRepoForManager };
}

describe('TransactionCategorizationService rule lifecycle', () => {
  it('previews and edits a broad rule into a narrower rule without changing history', async () => {
    const rule = buildRule();
    const payroll = buildTransaction({
      id: '77777777-7777-4777-8777-777777777771',
      merchantName: 'Acme Payroll',
      categoryAssignmentSource: 'rule',
      categoryAssignmentRuleId: broadRuleId,
      categoryId: salaryCategoryId,
    });
    const reimbursement = buildTransaction({
      id: '77777777-7777-4777-8777-777777777772',
      merchantName: 'Expense reimbursement',
      categoryAssignmentSource: 'rule',
      categoryAssignmentRuleId: broadRuleId,
      categoryId: salaryCategoryId,
    });
    const manual = buildTransaction({
      id: '77777777-7777-4777-8777-777777777773',
      merchantName: 'Manual HSA activity',
      source: 'manual',
      categoryAssignmentSource: 'manual',
      categoryId: reimbursementCategoryId,
    });
    const { service, transactionRepoForManager } = createHarness(
      [rule],
      [payroll, reimbursement, manual],
    );
    const expectedUpdatedAt = rule.updatedAt;

    const preview = await service.previewRuleEdit(rule.id, userId, {
      name: 'Payroll income only',
      conditions: [
        ...rule.conditions,
        { field: 'merchantName', operator: 'contains', value: 'payroll' },
      ],
    });
    const edited = await service.update(
      rule.id,
      userId,
      {
        name: 'Payroll income only',
        conditions: [
          ...rule.conditions,
          { field: 'merchantName', operator: 'contains', value: 'payroll' },
        ],
      },
      { expectedUpdatedAt },
    );

    expect(preview?.impact).toMatchObject({
      matchedBefore: 3,
      matchedAfter: 1,
      noLongerMatched: 2,
      historicalAssignments: 2,
      historicalAssignmentsUntouched: true,
      skippedManual: 1,
    });
    expect(edited).toMatchObject({
      name: 'Payroll income only',
      conditions: expect.arrayContaining([
        { field: 'merchantName', operator: 'contains', value: 'payroll' },
      ]),
    });
    expect(payroll).toMatchObject({
      categoryId: salaryCategoryId,
      categoryAssignmentRuleId: broadRuleId,
    });
    expect(reimbursement).toMatchObject({
      categoryId: salaryCategoryId,
      categoryAssignmentRuleId: broadRuleId,
    });
    expect(manual).toMatchObject({
      categoryId: reimbursementCategoryId,
      categoryAssignmentSource: 'manual',
    });
    expect(transactionRepoForManager.save).not.toHaveBeenCalled();
  });

  it('previews target-category and priority changes using deterministic overlap precedence', async () => {
    const broadRule = buildRule();
    const fallbackRule = buildRule({
      id: fallbackRuleId,
      name: 'Existing winner',
      priority: 5,
      targetCategoryId: salaryCategoryId,
      createdAt: new Date('2026-02-02T00:00:00.000Z'),
    });
    const transaction = buildTransaction({
      id: '77777777-7777-4777-8777-777777777774',
      merchantName: 'Acme Payroll',
      categoryAssignmentSource: 'rule',
      categoryAssignmentRuleId: broadRuleId,
      categoryId: salaryCategoryId,
    });
    const { service } = createHarness([broadRule, fallbackRule], [transaction]);

    const preview = await service.previewRuleEdit(broadRule.id, userId, {
      priority: 1,
      targetCategoryId: reimbursementCategoryId,
    });
    const updated = await service.update(
      broadRule.id,
      userId,
      { priority: 1, targetCategoryId: reimbursementCategoryId },
      { expectedUpdatedAt: broadRule.updatedAt },
    );

    expect(preview?.proposedRule).toMatchObject({
      priority: 1,
      targetCategoryId: reimbursementCategoryId,
    });
    expect(preview?.impact).toMatchObject({
      winningBefore: 0,
      winningAfter: 1,
      winnerChanged: 1,
    });
    expect(updated).toMatchObject({
      priority: 1,
      targetCategoryId: reimbursementCategoryId,
    });
    expect(transaction).toMatchObject({
      categoryId: salaryCategoryId,
      categoryAssignmentRuleId: broadRuleId,
    });
  });

  it('archives, lists, stops matching, and restores a rule without touching assignments', async () => {
    const rule = buildRule();
    const historical = buildTransaction({
      id: '77777777-7777-4777-8777-777777777775',
      merchantName: 'Acme Payroll',
      categoryAssignmentSource: 'rule',
      categoryAssignmentRuleId: broadRuleId,
      categoryId: salaryCategoryId,
    });
    const newTransaction = buildTransaction({
      id: '77777777-7777-4777-8777-777777777776',
      merchantName: 'Acme Payroll',
    });
    const { service } = createHarness([rule], [historical]);

    const archivePreview = await service.previewRuleArchive(rule.id, userId);
    await service.update(
      rule.id,
      userId,
      { archived: true },
      { expectedUpdatedAt: rule.updatedAt },
    );

    expect(archivePreview?.impact).toMatchObject({
      winningBefore: 1,
      winningAfter: 0,
      historicalAssignments: 1,
      historicalAssignmentsUntouched: true,
    });
    expect(await service.findAll(userId)).toEqual([]);
    expect(await service.findAll(userId, { archivedMode: true })).toHaveLength(
      1,
    );
    expect(await service.findFirstMatch(userId, newTransaction)).toBeNull();
    expect(
      await service.applyRuleAssignmentIfEligible(userId, historical),
    ).toBe(false);
    expect(historical).toMatchObject({
      categoryId: salaryCategoryId,
      categoryAssignmentRuleId: broadRuleId,
    });

    const restoreVersion = rule.updatedAt;
    const restorePreview = await service.previewRuleRestore(rule.id, userId);
    await service.update(
      rule.id,
      userId,
      { archived: false },
      { expectedUpdatedAt: restoreVersion },
    );

    expect(restorePreview?.impact).toMatchObject({
      winningBefore: 0,
      winningAfter: 1,
    });
    expect(await service.findFirstMatch(userId, newTransaction)).toMatchObject({
      rule: { id: broadRuleId },
    });
  });

  it('rejects stale concurrent mutation state', async () => {
    const rule = buildRule();
    const { service, ruleRepository } = createHarness([rule], []);
    const previewVersion = rule.updatedAt;
    rule.updatedAt = new Date('2026-02-14T00:05:00.000Z');

    await expect(
      service.update(
        rule.id,
        userId,
        { priority: 1 },
        { expectedUpdatedAt: previewVersion },
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(ruleRepository.update).not.toHaveBeenCalled();
  });

  it('applies a saved rule historically only where that rule wins precedence', async () => {
    const selectedRule = buildRule({ priority: 10 });
    const higherPriorityRule = buildRule({
      id: fallbackRuleId,
      priority: 5,
      targetCategoryId: reimbursementCategoryId,
    });
    const eligible = buildTransaction({
      id: '77777777-7777-4777-8777-777777777777',
      merchantName: 'Acme Payroll',
    });
    const manual = buildTransaction({
      id: '77777777-7777-4777-8777-777777777778',
      merchantName: 'Manual payroll',
      categoryAssignmentSource: 'manual',
      categoryId: reimbursementCategoryId,
    });
    const { service, transactionRepoForManager } = createHarness(
      [selectedRule, higherPriorityRule],
      [eligible, manual],
    );

    const blockedByPriority = await service.previewRuleApplication(
      selectedRule.id,
      userId,
    );
    higherPriorityRule.archivedAt = new Date('2026-02-14T00:00:00.000Z');
    const applicable = await service.applyRuleToExisting(
      selectedRule.id,
      userId,
    );

    expect(blockedByPriority).toMatchObject({
      matched: 2,
      updated: 0,
      skippedManual: 1,
    });
    expect(applicable).toMatchObject({
      matched: 2,
      updated: 1,
      skippedManual: 1,
    });
    expect(eligible).toMatchObject({
      categoryId: salaryCategoryId,
      categoryAssignmentRuleId: broadRuleId,
    });
    expect(manual).toMatchObject({
      categoryId: reimbursementCategoryId,
      categoryAssignmentSource: 'manual',
    });
    expect(transactionRepoForManager.save).toHaveBeenCalledWith([eligible]);
  });
});
