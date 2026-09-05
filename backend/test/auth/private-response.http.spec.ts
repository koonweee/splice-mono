import {
  type INestApplication,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AccountController } from '../../src/account/account.controller';
import { AccountService } from '../../src/account/account.service';
import { JwtAuthGuard } from '../../src/auth/guards/jwt-auth.guard';
import { JwtStrategy } from '../../src/auth/strategies/jwt.strategy';
import { PersonalAccessTokenService } from '../../src/auth/personal-access-token.service';
import { AuthService } from '../../src/auth/auth.service';
import { GoogleOAuthService } from '../../src/auth/google-oauth.service';
import { HealthController } from '../../src/health/health.controller';
import { TransactionController } from '../../src/transaction/transaction.controller';
import { TransactionService } from '../../src/transaction/transaction.service';
import { CurrencyConversionService } from '../../src/currency-exchange/currency-conversion.service';
import { UserController } from '../../src/user/user.controller';
import { UserService } from '../../src/user/user.service';

const user = { userId: 'synthetic-user', email: 'fixture@example.test' };
describe('Private API response headers', () => {
  let app: INestApplication;
  let previousSecret: string | undefined;
  const secret = 'synthetic-private-response-secret';
  const jwt = new JwtService({ secret });
  const bearer = jwt.sign({ sub: user.userId, email: user.email });
  const accounts = {
    findAll: jest.fn().mockResolvedValue([]),
    update: jest.fn().mockResolvedValue({ id: 'account', customName: 'Saved' }),
  };
  const syntheticTokens = {
    accessToken: 'synthetic-access',
    refreshToken: 'synthetic-refresh',
  };
  const users = {
    findOne: jest.fn().mockResolvedValue({ id: user.userId }),
    refreshTokens: jest.fn().mockResolvedValue(syntheticTokens),
  };
  const pats = {
    isPersonalAccessToken: (token: string) => token.startsWith('splice_pat_'),
    validateToken: async (token: string) =>
      token === 'splice_pat_valid' ? user : null,
  };
  beforeAll(async () => {
    previousSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = secret;
    const module = await Test.createTestingModule({
      controllers: [
        AccountController,
        UserController,
        TransactionController,
        HealthController,
      ],
      providers: [
        JwtStrategy,
        { provide: AccountService, useValue: accounts },
        { provide: UserService, useValue: users },
        { provide: AuthService, useValue: { revokeToken: jest.fn() } },
        { provide: GoogleOAuthService, useValue: {} },
        { provide: PersonalAccessTokenService, useValue: pats },
        {
          provide: TransactionService,
          useValue: { findAllPaginated: async () => ({ data: [], total: 0 }) },
        },
        { provide: CurrencyConversionService, useValue: {} },
      ],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalGuards(
      new JwtAuthGuard(
        new Reflector(),
        pats as unknown as PersonalAccessTokenService,
      ),
    );
    await app.init();
  });
  afterAll(async () => {
    await app.close();
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  });

  it.each(['/account', '/transaction', '/user/me'])(
    'protects actual %s responses for JWTs, PATs and unauthorized requests',
    async (path) => {
      for (const token of [bearer, 'splice_pat_valid']) {
        await request(app.getHttpServer())
          .get(path)
          .set('Authorization', `Bearer ${token}`)
          .expect('Cache-Control', 'private, no-store')
          .expect(200);
      }
      for (const token of [
        null,
        'splice_pat_invalid',
        jwt.sign({ sub: user.userId }, { expiresIn: -1 }),
      ]) {
        const call = request(app.getHttpServer()).get(path);
        if (token) call.set('Authorization', `Bearer ${token}`);
        await call.expect('Cache-Control', 'private, no-store').expect(401);
      }
    },
  );

  it('protects mutation success and validation failures', async () => {
    await request(app.getHttpServer())
      .patch('/account/account')
      .set('Authorization', `Bearer ${bearer}`)
      .send({ customName: 'Saved' })
      .expect('Cache-Control', 'private, no-store')
      .expect(200);
    await request(app.getHttpServer())
      .patch('/account/account')
      .set('Authorization', `Bearer ${bearer}`)
      .send({ balance: 123 })
      .expect('Cache-Control', 'private, no-store')
      .expect(400);
  });

  it('protects temporary backend errors and missing users', async () => {
    accounts.findAll.mockRejectedValueOnce(
      new ServiceUnavailableException('Temporary fixture failure'),
    );
    await request(app.getHttpServer())
      .get('/account')
      .set('Authorization', `Bearer ${bearer}`)
      .expect('Cache-Control', 'private, no-store')
      .expect(503);
    users.findOne.mockResolvedValueOnce(null);
    await request(app.getHttpServer())
      .get('/user/me')
      .set('Authorization', `Bearer ${bearer}`)
      .expect('Cache-Control', 'private, no-store')
      .expect(404);
  });

  it('protects public refresh/logout session routes while leaving public health cache policy alone', async () => {
    await request(app.getHttpServer())
      .post('/user/refresh')
      .send({})
      .expect('Cache-Control', 'private, no-store')
      .expect(400);
    await request(app.getHttpServer())
      .post('/user/refresh')
      .send({ refreshToken: 'synthetic-refresh' })
      .expect('Cache-Control', 'private, no-store')
      .expect(201);
    users.refreshTokens.mockRejectedValueOnce(new UnauthorizedException());
    await request(app.getHttpServer())
      .post('/user/refresh')
      .send({ refreshToken: 'invalid-refresh' })
      .expect('Cache-Control', 'private, no-store')
      .expect(401);
    await request(app.getHttpServer())
      .post('/user/logout')
      .send({})
      .expect('Cache-Control', 'private, no-store')
      .expect(201);
    const response = await request(app.getHttpServer())
      .get('/health')
      .expect(200);
    expect(response.headers['cache-control']).toBeUndefined();
  });
});
