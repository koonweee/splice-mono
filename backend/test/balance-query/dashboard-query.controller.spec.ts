import type { INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../../src/auth/guards/jwt-auth.guard';
import { JwtStrategy } from '../../src/auth/strategies/jwt.strategy';
import { PersonalAccessTokenService } from '../../src/auth/personal-access-token.service';
import { BalanceQueryController } from '../../src/balance-query/balance-query.controller';
import { BalanceQueryService } from '../../src/balance-query/balance-query.service';
import { DashboardQueryService } from '../../src/balance-query/dashboard-query.service';
import { generateSchemaComponents } from '../../src/common/zod-api-response';
import { DashboardQuerySchema } from '../../src/types/Dashboard';

const secret = 'synthetic-dashboard-test-secret';
describe('Dashboard endpoints', () => {
  let app: INestApplication;
  let previousSecret: string | undefined;
  const service = {
    getSummary: jest.fn().mockResolvedValue({ assets: [], liabilities: [] }),
    getSeries: jest.fn().mockResolvedValue({ points: [] }),
  };
  const token = new JwtService({ secret }).sign({
    sub: 'authenticated-user',
    email: 'test@example.com',
  });
  beforeAll(async () => {
    previousSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = secret;
    const module = await Test.createTestingModule({
      controllers: [BalanceQueryController],
      providers: [
        JwtStrategy,
        { provide: BalanceQueryService, useValue: {} },
        { provide: DashboardQueryService, useValue: service },
      ],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalGuards(
      new JwtAuthGuard(new Reflector(), {
        isPersonalAccessToken: () => false,
      } as unknown as PersonalAccessTokenService),
    );
    await app.init();
  });
  afterAll(async () => {
    await app.close();
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  });
  beforeEach(() => jest.clearAllMocks());
  it.each(['dashboard-summary', 'dashboard-series'])(
    'requires authentication for %s',
    async (path) => {
      await request(app.getHttpServer())
        .get(`/balance-query/${path}?period=month&endDate=2026-09-05`)
        .expect(401);
      expect(service.getSummary).not.toHaveBeenCalled();
      expect(service.getSeries).not.toHaveBeenCalled();
    },
  );
  it.each([
    'period=year&endDate=2026-02-30',
    'period=month&endDate=2025-02-29',
    'period=all&endDate=2026-09-05',
    'period=month',
    'period=month&endDate=2026-09-05&userId=other',
    'period=month&endDate=2026-09-05&reportingCurrency=EUR',
  ])('rejects invalid input before reads: %s', async (query) => {
    await request(app.getHttpServer())
      .get(`/balance-query/dashboard-summary?${query}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
    expect(service.getSummary).not.toHaveBeenCalled();
  });
  it('uses authenticated ownership and private response headers for both endpoints', async () => {
    for (const path of ['dashboard-summary', 'dashboard-series'])
      await request(app.getHttpServer())
        .get(`/balance-query/${path}?period=month&endDate=2026-09-05`)
        .set('Authorization', `Bearer ${token}`)
        .expect('Cache-Control', 'private, no-store')
        .expect(200);
    expect(service.getSummary).toHaveBeenCalledWith('authenticated-user', {
      period: 'month',
      endDate: '2026-09-05',
    });
    expect(service.getSeries).toHaveBeenCalledWith('authenticated-user', {
      period: 'month',
      endDate: '2026-09-05',
    });
    expect(
      DashboardQuerySchema.safeParse({ period: 'month', endDate: '2024-02-29' })
        .success,
    ).toBe(true);
  });
  it('publishes registered money/account schemas and required query parameters in OpenAPI', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('Dashboard').setVersion('1').build(),
    );
    const summary = document.paths['/balance-query/dashboard-summary'].get!;
    expect(summary.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'period', required: true }),
        expect.objectContaining({ name: 'endDate', required: true }),
      ]),
    );
    expect(summary.responses['200']).toMatchObject({
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/DashboardSummaryResponse' },
        },
      },
    });
    const schemas = generateSchemaComponents();
    expect(schemas).toHaveProperty('DashboardSummaryResponse');
    expect(schemas).toHaveProperty('DashboardSeriesResponse');
    expect(schemas.DashboardAccountSummary).toMatchObject({
      properties: {
        effectiveBalance: { $ref: '#/components/schemas/MoneyWithSign' },
      },
    });
  });
});
