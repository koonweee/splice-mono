import { NotFoundException } from '@nestjs/common';
import {
  McpTransactionCategoriesService,
  TransactionCategoryUpdatesSchema,
} from '../../src/mcp/mcp-transaction-categories.service';

const first = '11111111-1111-4111-8111-111111111111';
const second = '22222222-2222-4222-8222-222222222222';
const category = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function query(rows: unknown[]) {
  const builder: any = {};
  for (const method of [
    'select',
    'where',
    'andWhere',
    'innerJoin',
    'orderBy',
    'setLock',
  ]) {
    builder[method] = jest.fn().mockReturnValue(builder);
  }
  builder.getMany = jest.fn().mockResolvedValue(rows);
  return builder;
}

function setup(rows: unknown[], categories: unknown[] = [{ id: category }]) {
  const transactionQuery = query(rows);
  const categoryQuery = query(categories);
  const update = jest.fn().mockResolvedValue({ affected: rows.length });
  const repository = {
    createQueryBuilder: jest.fn().mockReturnValue(transactionQuery),
    update,
  };
  const manager = {
    getRepository: jest
      .fn()
      .mockImplementation((entity) =>
        entity.name === 'CategoryEntity'
          ? { createQueryBuilder: () => categoryQuery }
          : repository,
      ),
  };
  const transaction = jest
    .fn()
    .mockImplementation((callback) => callback(manager));
  const service = new McpTransactionCategoriesService({
    manager: { transaction },
  } as never);
  return { service, transaction, transactionQuery, categoryQuery, update };
}

describe('MCP direct transaction categories', () => {
  it('deduplicates and batches writes by category, including rule-to-manual changes', async () => {
    const fixture = setup(
      [first, second].map((id) => ({
        id,
        categoryId: category,
        categoryAssignmentSource: 'rule',
        categoryAssignmentRuleId: first,
      })),
    );
    const result = await fixture.service.setCategories('user', [
      { transactionIds: [first, first], categoryId: category.toUpperCase() },
      { transactionIds: [second], categoryId: category },
    ]);
    expect(result).toMatchObject({ requested: 2, updated: 2, unchanged: 0 });
    expect(fixture.update).toHaveBeenCalledTimes(1);
    expect(fixture.update.mock.calls[0][1]).toEqual({
      categoryId: category,
      categoryUpdatedAt: expect.any(Date),
      categoryAssignmentSource: 'manual',
      categoryAssignmentRuleId: null,
    });
    expect(fixture.transactionQuery.andWhere).toHaveBeenCalledWith(
      'activity.userId = :userId',
      { userId: 'user' },
    );
    expect(fixture.categoryQuery.andWhere).toHaveBeenCalledWith(
      'category.userId = :userId',
      { userId: 'user' },
    );
  });

  it('reports unchanged assignments and clears other categories explicitly', async () => {
    const fixture = setup([
      {
        id: first,
        categoryId: category,
        categoryAssignmentSource: 'manual',
        categoryAssignmentRuleId: null,
      },
      {
        id: second,
        categoryId: category,
        categoryAssignmentSource: 'rule',
        categoryAssignmentRuleId: first,
      },
    ]);
    const result = await fixture.service.setCategories('user', [
      { transactionIds: [first], categoryId: category },
      { transactionIds: [second], categoryId: null },
    ]);
    expect(result).toEqual({
      requested: 2,
      updated: 1,
      unchanged: 1,
      results: [
        {
          categoryId: category,
          updatedTransactionIds: [],
          unchangedTransactionIds: [first],
        },
        {
          categoryId: null,
          updatedTransactionIds: [second],
          unchangedTransactionIds: [],
        },
      ],
    });
    expect(fixture.update).toHaveBeenCalledTimes(1);
    expect(fixture.update.mock.calls[0][1]).toMatchObject({
      categoryId: null,
      categoryUpdatedAt: null,
      categoryAssignmentSource: 'manual',
    });
  });

  it('does not write an already manual Uncategorized assignment', async () => {
    const fixture = setup([
      {
        id: first,
        categoryId: null,
        categoryAssignmentSource: 'manual',
        categoryAssignmentRuleId: null,
      },
    ]);
    expect(
      await fixture.service.setCategories('user', [
        { transactionIds: [first], categoryId: null },
      ]),
    ).toMatchObject({ updated: 0, unchanged: 1 });
    expect(fixture.update).not.toHaveBeenCalled();
  });

  it.each(['category', 'transaction'])(
    'rejects missing or unowned %s before writes',
    async (missing) => {
      const fixture = setup(
        [],
        missing === 'category' ? [] : [{ id: category }],
      );
      await expect(
        fixture.service.setCategories('user', [
          { transactionIds: [first], categoryId: category },
        ]),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(fixture.update).not.toHaveBeenCalled();
    },
  );

  it('rejects conflicting targets, empty groups, invalid IDs and oversized batches', () => {
    for (const updates of [
      [],
      [{ transactionIds: [], categoryId: null }],
      [{ transactionIds: ['invalid'], categoryId: null }],
      [
        { transactionIds: [first], categoryId: null },
        { transactionIds: [first], categoryId: category },
      ],
      [
        { transactionIds: Array(251).fill(first), categoryId: null },
        { transactionIds: Array(250).fill(second), categoryId: null },
      ],
      Array(51).fill({ transactionIds: [first], categoryId: null }),
    ])
      expect(TransactionCategoryUpdatesSchema.safeParse(updates).success).toBe(
        false,
      );
    expect(
      TransactionCategoryUpdatesSchema.safeParse([
        { transactionIds: Array(500).fill(first), categoryId: null },
      ]).success,
    ).toBe(true);
  });
});
