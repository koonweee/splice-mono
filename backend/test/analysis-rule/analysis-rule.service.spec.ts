import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CategoryEntity } from '../../src/category/category.entity';
import { AnalysisRuleEntity } from '../../src/analysis-rule/analysis-rule.entity';
import { AnalysisRuleService } from '../../src/analysis-rule/analysis-rule.service';
import type { AnalysisCategoryScope } from '../../src/types/AnalysisRule';

const mockUserId = '11111111-1111-4111-8111-111111111111';
const otherUserId = '22222222-2222-4222-8222-222222222222';
const categoryAId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const categoryBId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function buildCategory(params: {
  id: string;
  userId?: string;
  primary: string;
  detailed: string;
  archivedAt?: Date | null;
}): CategoryEntity {
  return {
    id: params.id,
    userId: params.userId ?? mockUserId,
    primary: params.primary,
    detailed: params.detailed,
    color: '#228be6',
    archivedAt: params.archivedAt ?? null,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
  } as CategoryEntity;
}

function buildRule(params: {
  id: string;
  name: string;
  type: 'exclude' | 'neutralize';
  excludeScope?: AnalysisCategoryScope | null;
  inflowScope?: AnalysisCategoryScope | null;
  outflowScope?: AnalysisCategoryScope | null;
  archivedAt?: Date | null;
  createdAt?: Date;
}): AnalysisRuleEntity {
  return {
    id: params.id,
    userId: mockUserId,
    name: params.name,
    type: params.type,
    excludeScope: params.excludeScope ?? null,
    inflowScope: params.inflowScope ?? null,
    outflowScope: params.outflowScope ?? null,
    archivedAt: params.archivedAt ?? null,
    createdAt: params.createdAt ?? new Date('2024-01-01T00:00:00Z'),
    updatedAt: params.createdAt ?? new Date('2024-01-01T00:00:00Z'),
  } as AnalysisRuleEntity;
}

describe('AnalysisRuleService', () => {
  let service: AnalysisRuleService;
  let ruleRepository: {
    find: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let categoryRepository: {
    find: jest.Mock;
  };
  const categories = [
    buildCategory({
      id: categoryAId,
      primary: 'Income',
      detailed: 'Reimbursement',
    }),
    buildCategory({
      id: categoryBId,
      primary: 'Rent',
      detailed: 'Monthly Rent',
    }),
  ];

  beforeEach(async () => {
    ruleRepository = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      create: jest.fn((dto: Partial<AnalysisRuleEntity>) => ({
        id: '33333333-3333-4333-8333-333333333333',
        createdAt: new Date('2024-01-03T00:00:00Z'),
        updatedAt: new Date('2024-01-03T00:00:00Z'),
        archivedAt: null,
        ...dto,
      })),
      save: jest.fn(async (entity: AnalysisRuleEntity) => entity),
    };
    categoryRepository = {
      find: jest.fn().mockResolvedValue(categories),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalysisRuleService,
        {
          provide: getRepositoryToken(AnalysisRuleEntity),
          useValue: ruleRepository,
        },
        {
          provide: getRepositoryToken(CategoryEntity),
          useValue: categoryRepository,
        },
      ],
    }).compile();

    service = module.get(AnalysisRuleService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('creates an exclude rule with normalized selected category scopes', async () => {
    const result = await service.create(mockUserId, {
      name: 'Ignore reimbursements',
      type: 'exclude',
      excludeScope: {
        mode: 'selected',
        categoryIds: [categoryBId, categoryAId, categoryAId],
        includeUncategorized: true,
      },
    });

    expect(ruleRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: mockUserId,
        name: 'Ignore reimbursements',
        type: 'exclude',
        excludeScope: {
          mode: 'selected',
          categoryIds: [categoryAId, categoryBId],
          includeUncategorized: true,
        },
      }),
    );
    expect(result.excludeScope).toEqual({
      mode: 'selected',
      includeUncategorized: true,
      categories: [
        expect.objectContaining({ id: categoryAId }),
        expect.objectContaining({ id: categoryBId }),
      ],
    });
  });

  it('rejects category IDs outside the current user scope', async () => {
    categoryRepository.find.mockResolvedValueOnce([
      buildCategory({
        id: categoryAId,
        userId: otherUserId,
        primary: 'Other',
        detailed: 'Other',
      }),
    ]);

    await expect(
      service.create(mockUserId, {
        name: 'Invalid category',
        type: 'exclude',
        excludeScope: {
          mode: 'selected',
          categoryIds: [categoryAId, categoryBId],
          includeUncategorized: false,
        },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects duplicate rules ignoring name and category order', async () => {
    ruleRepository.find.mockResolvedValueOnce([
      buildRule({
        id: '44444444-4444-4444-8444-444444444444',
        name: 'Existing',
        type: 'neutralize',
        inflowScope: {
          mode: 'selected',
          categoryIds: [categoryAId, categoryBId],
          includeUncategorized: false,
        },
        outflowScope: { mode: 'all' },
        archivedAt: new Date('2024-01-05T00:00:00Z'),
      }),
    ]);

    await expect(
      service.create(mockUserId, {
        name: 'Different name',
        type: 'neutralize',
        inflowScope: {
          mode: 'selected',
          categoryIds: [categoryBId, categoryAId],
          includeUncategorized: false,
        },
        outflowScope: { mode: 'all' },
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        rule: expect.objectContaining({
          ruleId: '44444444-4444-4444-8444-444444444444',
          archivedAt: new Date('2024-01-05T00:00:00Z'),
        }),
      }),
    });
  });

  it('blocks restore when an active duplicate exists', async () => {
    const archived = buildRule({
      id: '55555555-5555-4555-8555-555555555555',
      name: 'Archived',
      type: 'exclude',
      excludeScope: { mode: 'all' },
      archivedAt: new Date('2024-01-10T00:00:00Z'),
    });
    ruleRepository.findOne.mockResolvedValue(archived);
    ruleRepository.find.mockResolvedValueOnce([
      buildRule({
        id: '66666666-6666-4666-8666-666666666666',
        name: 'Active duplicate',
        type: 'exclude',
        excludeScope: { mode: 'all' },
      }),
    ]);

    await expect(
      service.update(archived.id, mockUserId, { archived: false }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('blocks archived rule edits that duplicate another rule', async () => {
    const archived = buildRule({
      id: '77777777-7777-4777-8777-777777777777',
      name: 'Archived',
      type: 'exclude',
      excludeScope: {
        mode: 'selected',
        categoryIds: [categoryAId],
        includeUncategorized: false,
      },
      archivedAt: new Date('2024-01-10T00:00:00Z'),
    });
    ruleRepository.findOne.mockResolvedValue(archived);
    ruleRepository.find.mockResolvedValueOnce([
      buildRule({
        id: '88888888-8888-4888-8888-888888888888',
        name: 'Archived duplicate',
        type: 'exclude',
        excludeScope: { mode: 'all' },
        archivedAt: new Date('2024-01-11T00:00:00Z'),
      }),
    ]);

    await expect(
      service.update(archived.id, mockUserId, {
        excludeScope: { mode: 'all' },
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        rule: expect.objectContaining({
          ruleId: '88888888-8888-4888-8888-888888888888',
          archivedAt: new Date('2024-01-11T00:00:00Z'),
        }),
      }),
    });
  });

  it('sorts neutralization rules by smallest pool before broad rules', () => {
    const broad = buildRule({
      id: 'broad',
      name: 'Broad',
      type: 'neutralize',
      inflowScope: { mode: 'all' },
      outflowScope: { mode: 'all' },
    });
    const specific = buildRule({
      id: 'specific',
      name: 'Specific',
      type: 'neutralize',
      inflowScope: {
        mode: 'selected',
        categoryIds: [categoryAId],
        includeUncategorized: false,
      },
      outflowScope: {
        mode: 'selected',
        categoryIds: [categoryBId],
        includeUncategorized: false,
      },
    });

    expect(service.compareNeutralizationRules(specific, broad)).toBeLessThan(0);
    expect(service.compareNeutralizationRules(broad, specific)).toBeGreaterThan(
      0,
    );
  });
});
