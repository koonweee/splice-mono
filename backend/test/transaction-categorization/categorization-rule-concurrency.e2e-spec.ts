import 'dotenv/config';
import { ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import { CategoryEntity } from '../../src/category/category.entity';
import { dataSourceOptions } from '../../src/data-source';
import { CategorizationRuleEntity } from '../../src/transaction-categorization/categorization-rule.entity';
import { TransactionCategorizationService } from '../../src/transaction-categorization/categorization-rule.service';
import { RuleBasedCategorizationEngine } from '../../src/transaction-categorization/rule-based-categorization.engine';

const userId = '11111111-1111-4111-8111-111111111111';
const categoryId = '22222222-2222-4222-8222-222222222222';
const ruleId = '33333333-3333-4333-8333-333333333333';

describe('categorization rule PostgreSQL concurrency guard', () => {
  const schema = `categorization_rule_revision_${process.pid}_${Date.now()}`;
  const postgresOptions = dataSourceOptions as PostgresConnectionOptions;
  let adminDataSource: DataSource;
  let testDataSource: DataSource;

  beforeAll(async () => {
    adminDataSource = new DataSource({
      ...postgresOptions,
      entities: [],
    });
    await adminDataSource.initialize();
    await adminDataSource.query(`CREATE SCHEMA "${schema}"`);

    testDataSource = new DataSource({
      ...postgresOptions,
      schema,
      entities: [CategorizationRuleEntity],
      synchronize: true,
    });
    await testDataSource.initialize();
  });

  afterAll(async () => {
    if (testDataSource?.isInitialized) {
      await testDataSource.destroy();
    }
    if (adminDataSource?.isInitialized) {
      await adminDataSource.query(`DROP SCHEMA "${schema}" CASCADE`);
      await adminDataSource.destroy();
    }
  });

  it('updates by integer revision even when updatedAt contains hidden microseconds', async () => {
    const repository = testDataSource.getRepository(CategorizationRuleEntity);
    await repository.save(
      repository.create({
        id: ruleId,
        userId,
        name: 'Salary deposits',
        priority: 10,
        targetCategoryId: categoryId,
        conditions: [
          {
            field: 'providerCategoryDetailed',
            operator: 'equals',
            value: 'income_wages',
          },
        ],
        archivedAt: null,
      }),
    );
    await testDataSource.query(
      `UPDATE "${schema}"."categorization_rule_entity" SET "updatedAt" = make_timestamp(2026, 8, 22, 20, 46, 13.138456) WHERE "id" = $1`,
      [ruleId],
    );

    const hydrated = await repository.findOneByOrFail({ id: ruleId, userId });
    expect(hydrated.updatedAt.toISOString()).toContain('.138Z');
    expect(hydrated.revision).toBe(1);

    const category = {
      id: categoryId,
      userId,
      primary: 'Income',
      detailed: 'Salary',
      color: '#228be6',
      archivedAt: null,
    } as CategoryEntity;
    const service = new TransactionCategorizationService(
      repository,
      { find: jest.fn().mockResolvedValue([]) } as never,
      {
        findOne: jest.fn().mockResolvedValue(category),
        find: jest.fn().mockResolvedValue([category]),
      } as never,
      { manager: testDataSource.manager } as never,
      new RuleBasedCategorizationEngine(),
    );

    const updated = await service.update(
      ruleId,
      userId,
      { priority: 5 },
      { expectedRevision: hydrated.revision },
    );
    expect(updated).toMatchObject({ priority: 5, revision: 2 });

    await expect(
      service.update(
        ruleId,
        userId,
        { priority: 1 },
        { expectedRevision: hydrated.revision },
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
