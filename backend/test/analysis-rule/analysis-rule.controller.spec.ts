import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AnalysisRuleController } from '../../src/analysis-rule/analysis-rule.controller';
import { AnalysisRuleService } from '../../src/analysis-rule/analysis-rule.service';

describe('AnalysisRuleController', () => {
  let app: INestApplication;
  let service: {
    findAll: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  const mockUser = {
    userId: '11111111-1111-4111-8111-111111111111',
    email: 'test@example.com',
  };

  beforeEach(async () => {
    service = {
      findAll: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      update: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AnalysisRuleController],
      providers: [
        {
          provide: AnalysisRuleService,
          useValue: service,
        },
      ],
    }).compile();

    app = module.createNestApplication();
    app.use((req, _res, next) => {
      req.user = mockUser;
      next();
    });
    await app.init();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
    jest.clearAllMocks();
  });

  it('lists active rules by default', async () => {
    const response = await request(app.getHttpServer()).get('/analysis-rules');

    expect(response.status).toBe(200);
    expect(service.findAll).toHaveBeenCalledWith(mockUser.userId, {
      archivedMode: false,
    });
  });

  it('lists archived rules when requested', async () => {
    const response = await request(app.getHttpServer())
      .get('/analysis-rules')
      .query({ archived: 'true' });

    expect(response.status).toBe(200);
    expect(service.findAll).toHaveBeenCalledWith(mockUser.userId, {
      archivedMode: true,
    });
  });

  it('validates create rule bodies before delegating', async () => {
    const response = await request(app.getHttpServer())
      .post('/analysis-rules')
      .send({
        name: 'Bad',
        type: 'exclude',
        excludeScope: {
          mode: 'selected',
          categoryIds: [],
          includeUncategorized: false,
        },
      });

    expect(response.status).toBe(400);
    expect(service.create).not.toHaveBeenCalled();
  });

  it('delegates valid update requests', async () => {
    service.update.mockResolvedValue({
      id: '33333333-3333-4333-8333-333333333333',
      name: 'Archived',
      type: 'exclude',
      excludeScope: { mode: 'all' },
      inflowScope: null,
      outflowScope: null,
      archivedAt: '2024-01-01T00:00:00.000Z',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    });

    const response = await request(app.getHttpServer())
      .patch('/analysis-rules/33333333-3333-4333-8333-333333333333')
      .send({ archived: true });

    expect(response.status).toBe(200);
    expect(service.update).toHaveBeenCalledWith(
      '33333333-3333-4333-8333-333333333333',
      mockUser.userId,
      { archived: true },
    );
  });

  it('returns 404 when an owned rule is not found', async () => {
    service.update.mockResolvedValue(null);

    const response = await request(app.getHttpServer())
      .patch('/analysis-rules/33333333-3333-4333-8333-333333333333')
      .send({ archived: true });

    expect(response.status).toBe(404);
  });
});
