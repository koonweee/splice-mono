import {
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
  ParseUUIDPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { AuthService } from '../../src/auth/auth.service';
import { OAUTH_STATE_COOKIE } from '../../src/auth/auth-cookies';
import { GoogleOAuthService } from '../../src/auth/google-oauth.service';
import { PersonalAccessTokenService } from '../../src/auth/personal-access-token.service';
import { UserController } from '../../src/user/user.controller';
import { UserService } from '../../src/user/user.service';
import { mockUserService } from '../mocks/user/user-service.mock';
import { mockOAuthLoginResponse, mockUser } from '../mocks/user/user.mock';

// Mock Express Response object
const mockResponse = () => ({
  cookie: jest.fn().mockReturnThis(),
  clearCookie: jest.fn().mockReturnThis(),
  redirect: jest.fn().mockReturnThis(),
});

// Mock Express Request object
const mockRequest = (
  cookies: Record<string, string> = {},
  hostname = 'localhost',
  remoteAddress = '127.0.0.1',
) => ({
  cookies,
  hostname,
  socket: {
    remoteAddress,
  },
});

describe('UserController', () => {
  let controller: UserController;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let service: UserService;
  const originalJwtSecret = process.env.JWT_SECRET;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalLocalAuthBypass = process.env.LOCAL_AUTH_BYPASS;
  const originalLocalAuthBypassEmail = process.env.LOCAL_AUTH_BYPASS_EMAIL;

  const mockPersonalAccessTokenService = {
    createToken: jest.fn(),
    listTokens: jest.fn(),
    revokeToken: jest.fn(),
  };

  const mockAuthService = {
    generateAccessToken: jest.fn().mockReturnValue('mock-dev-access-token'),
    generateRefreshToken: jest.fn().mockResolvedValue('mock-dev-refresh-token'),
    revokeToken: jest.fn().mockResolvedValue(undefined),
    revokeAllUserTokens: jest.fn().mockResolvedValue(undefined),
  };

  const mockGoogleOAuthService = {
    validateRedirectPath: jest.fn().mockReturnValue('/home'),
    buildAuthorizationUrl: jest
      .fn()
      .mockReturnValue('https://accounts.google.com/o/oauth2/v2/auth'),
    completeCallback: jest.fn().mockResolvedValue({
      ...mockOAuthLoginResponse,
      redirectPath: '/home',
    }),
    buildFrontendRedirectUrl: jest
      .fn()
      .mockReturnValue('http://localhost:4000/home'),
  };

  beforeEach(async () => {
    process.env.JWT_SECRET = 'test-jwt-secret';
    process.env.NODE_ENV = 'test';
    delete process.env.LOCAL_AUTH_BYPASS;
    delete process.env.LOCAL_AUTH_BYPASS_EMAIL;
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserController],
      providers: [
        {
          provide: UserService,
          useValue: mockUserService,
        },
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
        {
          provide: PersonalAccessTokenService,
          useValue: mockPersonalAccessTokenService,
        },
        {
          provide: GoogleOAuthService,
          useValue: mockGoogleOAuthService,
        },
      ],
    }).compile();

    controller = module.get<UserController>(UserController);
    service = module.get<UserService>(UserService);

    jest.clearAllMocks();
  });

  afterAll(() => {
    if (originalJwtSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = originalJwtSecret;
    }
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
    if (originalLocalAuthBypass === undefined) {
      delete process.env.LOCAL_AUTH_BYPASS;
    } else {
      process.env.LOCAL_AUTH_BYPASS = originalLocalAuthBypass;
    }
    if (originalLocalAuthBypassEmail === undefined) {
      delete process.env.LOCAL_AUTH_BYPASS_EMAIL;
    } else {
      process.env.LOCAL_AUTH_BYPASS_EMAIL = originalLocalAuthBypassEmail;
    }
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('oauthGoogleStart', () => {
    it('sets a state cookie and redirects to Google', () => {
      const res = mockResponse();

      controller.oauthGoogleStart('/home', res as any);

      expect(mockGoogleOAuthService.validateRedirectPath).toHaveBeenCalledWith(
        '/home',
      );
      expect(mockGoogleOAuthService.buildAuthorizationUrl).toHaveBeenCalledWith(
        expect.any(String) as string,
      );
      expect(res.cookie).toHaveBeenCalledWith(
        OAUTH_STATE_COOKIE,
        expect.any(String) as string,
        expect.objectContaining({ httpOnly: true, maxAge: 600000 }),
      );
      expect(res.redirect).toHaveBeenCalledWith(
        'https://accounts.google.com/o/oauth2/v2/auth',
      );
    });
  });

  describe('oauthGoogleCallback', () => {
    it('sets session cookies and redirects after a valid callback', async () => {
      const startRes = mockResponse();
      controller.oauthGoogleStart('/home', startRes as any);
      const stateCookie = startRes.cookie.mock.calls[0][1] as string;
      const state = mockGoogleOAuthService.buildAuthorizationUrl.mock
        .calls[0][0] as string;
      const req = mockRequest({ [OAUTH_STATE_COOKIE]: stateCookie });
      const res = mockResponse();

      await controller.oauthGoogleCallback(
        'google-code',
        state,
        req as any,
        res as any,
      );

      expect(mockGoogleOAuthService.completeCallback).toHaveBeenCalledWith(
        'google-code',
        '/home',
      );
      expect(res.cookie).toHaveBeenCalledWith(
        'splice_access_token',
        mockOAuthLoginResponse.accessToken,
        expect.objectContaining({ httpOnly: true }),
      );
      expect(res.cookie).toHaveBeenCalledWith(
        'splice_refresh_token',
        mockOAuthLoginResponse.refreshToken,
        expect.objectContaining({ httpOnly: true }),
      );
      expect(
        mockGoogleOAuthService.buildFrontendRedirectUrl,
      ).toHaveBeenCalledWith('/home');
      expect(res.redirect).toHaveBeenCalledWith('http://localhost:4000/home');
    });

    it('rejects a mismatched state', async () => {
      const req = mockRequest({ [OAUTH_STATE_COOKIE]: 'bad-cookie' });
      const res = mockResponse();

      await expect(
        controller.oauthGoogleCallback(
          'google-code',
          'state',
          req as any,
          res as any,
        ),
      ).rejects.toThrow('Invalid OAuth state');
      expect(mockGoogleOAuthService.completeCallback).not.toHaveBeenCalled();
    });

    it('rejects a tampered state cookie payload', async () => {
      const startRes = mockResponse();
      controller.oauthGoogleStart('/accounts', startRes as any);
      const stateCookie = startRes.cookie.mock.calls[0][1] as string;
      const [payload, signature] = stateCookie.split('.');
      const tamperedPayload = Buffer.from(
        JSON.stringify({ state: 'state', redirectPath: '/evil' }),
        'utf8',
      ).toString('base64url');
      const req = mockRequest({
        [OAUTH_STATE_COOKIE]: `${tamperedPayload}.${signature}`,
      });
      const res = mockResponse();

      await expect(
        controller.oauthGoogleCallback(
          'google-code',
          payload,
          req as any,
          res as any,
        ),
      ).rejects.toThrow('Invalid OAuth state');
      expect(mockGoogleOAuthService.completeCallback).not.toHaveBeenCalled();
    });
  });

  describe('devLogin', () => {
    beforeEach(() => {
      mockAuthService.generateAccessToken.mockReturnValue(
        'mock-dev-access-token',
      );
      mockAuthService.generateRefreshToken.mockResolvedValue(
        'mock-dev-refresh-token',
      );
    });

    it('rejects when the local auth bypass flag is disabled', async () => {
      const req = mockRequest();
      const res = mockResponse();

      await expect(
        controller.devLogin('/home', req as any, res as any),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(mockUserService.findByEmail).not.toHaveBeenCalled();
    });

    it('rejects in production even when the local auth bypass flag is enabled', async () => {
      process.env.LOCAL_AUTH_BYPASS = 'true';
      process.env.LOCAL_AUTH_BYPASS_EMAIL = 'dev@example.com';
      process.env.NODE_ENV = 'production';
      const req = mockRequest();
      const res = mockResponse();

      await expect(
        controller.devLogin('/home', req as any, res as any),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(mockUserService.findByEmail).not.toHaveBeenCalled();
    });

    it('rejects non-local hostnames', async () => {
      process.env.LOCAL_AUTH_BYPASS = 'true';
      process.env.LOCAL_AUTH_BYPASS_EMAIL = 'dev@example.com';
      const req = mockRequest({}, 'splice.example.com');
      const res = mockResponse();

      await expect(
        controller.devLogin('/home', req as any, res as any),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(mockUserService.findByEmail).not.toHaveBeenCalled();
    });

    it('rejects non-loopback remote addresses', async () => {
      process.env.LOCAL_AUTH_BYPASS = 'true';
      process.env.LOCAL_AUTH_BYPASS_EMAIL = 'dev@example.com';
      const req = mockRequest({}, 'localhost', '203.0.113.10');
      const res = mockResponse();

      await expect(
        controller.devLogin('/home', req as any, res as any),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(mockUserService.findByEmail).not.toHaveBeenCalled();
    });

    it('rejects when the local auth bypass email is missing', async () => {
      process.env.LOCAL_AUTH_BYPASS = 'true';
      const req = mockRequest();
      const res = mockResponse();

      await expect(
        controller.devLogin('/home', req as any, res as any),
      ).rejects.toBeInstanceOf(InternalServerErrorException);
      expect(mockUserService.findByEmail).not.toHaveBeenCalled();
    });

    it('rejects unsafe redirects through the existing redirect validation', async () => {
      process.env.LOCAL_AUTH_BYPASS = 'true';
      process.env.LOCAL_AUTH_BYPASS_EMAIL = 'dev@example.com';
      mockGoogleOAuthService.validateRedirectPath.mockImplementationOnce(() => {
        throw new Error('Invalid redirect target');
      });
      const req = mockRequest();
      const res = mockResponse();

      await expect(
        controller.devLogin('//evil.example', req as any, res as any),
      ).rejects.toThrow('Invalid redirect target');
      expect(mockGoogleOAuthService.validateRedirectPath).toHaveBeenCalledWith(
        '//evil.example',
      );
      expect(mockUserService.findByEmail).not.toHaveBeenCalled();
    });

    it('sets session cookies and redirects for an existing configured user', async () => {
      process.env.LOCAL_AUTH_BYPASS = 'true';
      process.env.LOCAL_AUTH_BYPASS_EMAIL = ' Dev@Example.COM ';
      mockUserService.findByEmail.mockResolvedValueOnce({
        ...mockUser,
        email: 'dev@example.com',
      });
      const req = mockRequest();
      const res = mockResponse();

      await controller.devLogin('/accounts', req as any, res as any);

      expect(mockGoogleOAuthService.validateRedirectPath).toHaveBeenCalledWith(
        '/accounts',
      );
      expect(mockUserService.findByEmail).toHaveBeenCalledWith(
        'dev@example.com',
      );
      expect(
        mockUserService.findOrCreateFromGoogleIdentity,
      ).not.toHaveBeenCalled();
      expect(mockAuthService.generateAccessToken).toHaveBeenCalledWith(
        'user-uuid-123',
        'dev@example.com',
      );
      expect(mockAuthService.generateRefreshToken).toHaveBeenCalledWith(
        'user-uuid-123',
      );
      expect(res.cookie).toHaveBeenCalledWith(
        'splice_access_token',
        'mock-dev-access-token',
        expect.objectContaining({ httpOnly: true }),
      );
      expect(res.cookie).toHaveBeenCalledWith(
        'splice_refresh_token',
        'mock-dev-refresh-token',
        expect.objectContaining({ httpOnly: true }),
      );
      expect(
        mockGoogleOAuthService.buildFrontendRedirectUrl,
      ).toHaveBeenCalledWith('/home');
      expect(res.redirect).toHaveBeenCalledWith('http://localhost:4000/home');
    });

    it('creates a stable local dev user when the configured email does not exist', async () => {
      process.env.LOCAL_AUTH_BYPASS = 'true';
      process.env.LOCAL_AUTH_BYPASS_EMAIL = 'new-dev@example.com';
      mockUserService.findByEmail.mockResolvedValueOnce(null);
      const req = mockRequest();
      const res = mockResponse();

      await controller.devLogin('/home', req as any, res as any);

      expect(
        mockUserService.findOrCreateFromGoogleIdentity,
      ).toHaveBeenCalledWith({
        googleSubject: 'local-dev:new-dev@example.com',
        email: 'new-dev@example.com',
        displayName: 'Local Dev',
        avatarUrl: null,
      });
      expect(mockAuthService.generateAccessToken).toHaveBeenCalledWith(
        'user-uuid-123',
        'test@example.com',
      );
      expect(res.redirect).toHaveBeenCalledWith('http://localhost:4000/home');
    });
  });

  describe('logout', () => {
    it('should revoke token from cookie and clear cookies', async () => {
      const refreshToken = 'test-refresh-token';
      const req = mockRequest({ splice_refresh_token: refreshToken });
      const res = mockResponse();

      await controller.logout({}, req as any, res as any);

      expect(mockAuthService.revokeToken).toHaveBeenCalledWith(refreshToken);
      expect(res.clearCookie).toHaveBeenCalledTimes(2);
    });

    it('should revoke token from body if no cookie (mobile)', async () => {
      const refreshToken = 'mobile-refresh-token';
      const req = mockRequest({});
      const res = mockResponse();

      await controller.logout({ refreshToken }, req as any, res as any);

      expect(mockAuthService.revokeToken).toHaveBeenCalledWith(refreshToken);
    });
  });

  describe('logoutAll', () => {
    it('should revoke all tokens and clear cookies', async () => {
      const res = mockResponse();
      const currentUser = { userId: 'user-123', email: 'test@example.com' };

      await controller.logoutAll(currentUser, res as any);

      expect(mockAuthService.revokeAllUserTokens).toHaveBeenCalledWith(
        currentUser.userId,
      );
      expect(res.clearCookie).toHaveBeenCalledTimes(2);
    });
  });

  describe('token management', () => {
    const currentUser = { userId: 'user-123', email: 'test@example.com' };

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('createToken returns the one-time token payload from the PAT service', async () => {
      const expiresAt = '2026-01-01T00:00:00.000Z';
      const tokenPayload = {
        id: '11111111-1111-4111-8111-111111111111',
        userId: currentUser.userId,
        name: 'codex-local',
        prefix: 'deadbeef',
        tokenPreview: 'splice_pat_deadbeef',
        lastUsedAt: null,
        expiresAt: new Date(expiresAt),
        revokedAt: null,
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-01T00:00:00Z'),
        token: 'splice_pat_abc123',
      };
      const expectedPayload = {
        id: '11111111-1111-4111-8111-111111111111',
        name: 'codex-local',
        token: 'splice_pat_abc123',
        tokenPreview: 'splice_pat_deadbeef',
        expiresAt: new Date(expiresAt),
        createdAt: new Date('2024-01-01T00:00:00Z'),
      };
      mockPersonalAccessTokenService.createToken.mockResolvedValue(
        tokenPayload,
      );

      const result = await controller.createToken(currentUser, {
        name: 'codex-local',
        expiresAt,
      });

      expect(result).toEqual(expectedPayload);
      expect(result).not.toHaveProperty('tokenHash');
      expect(result).not.toHaveProperty('userId');
      expect(result).not.toHaveProperty('prefix');
      expect(result).not.toHaveProperty('updatedAt');
      expect(mockPersonalAccessTokenService.createToken).toHaveBeenCalledWith(
        currentUser,
        {
          name: 'codex-local',
          expiresAt,
        },
      );
      expect(mockAuthService.revokeToken).not.toHaveBeenCalled();
      expect(mockAuthService.revokeAllUserTokens).not.toHaveBeenCalled();
    });

    it('listTokens returns sanitized token metadata from the PAT service', async () => {
      const tokens = [
        {
          id: '11111111-1111-4111-8111-111111111111',
          userId: currentUser.userId,
          name: 'codex-local',
          prefix: 'deadbeef',
          tokenPreview: 'splice_pat_deadbeef',
          lastUsedAt: null,
          expiresAt: null,
          revokedAt: null,
          createdAt: new Date('2024-01-01T00:00:00Z'),
          updatedAt: new Date('2024-01-01T00:00:00Z'),
        },
      ];
      const expectedTokens = [
        {
          id: '11111111-1111-4111-8111-111111111111',
          name: 'codex-local',
          tokenPreview: 'splice_pat_deadbeef',
          lastUsedAt: null,
          expiresAt: null,
          revokedAt: null,
          createdAt: new Date('2024-01-01T00:00:00Z'),
        },
      ];
      mockPersonalAccessTokenService.listTokens.mockResolvedValue(tokens);

      const result = await controller.listTokens(currentUser);

      expect(result).toEqual(expectedTokens);
      expect(result[0]).not.toHaveProperty('tokenHash');
      expect(result[0]).not.toHaveProperty('token');
      expect(result[0]).not.toHaveProperty('userId');
      expect(result[0]).not.toHaveProperty('prefix');
      expect(result[0]).not.toHaveProperty('updatedAt');
      expect(mockPersonalAccessTokenService.listTokens).toHaveBeenCalledWith(
        currentUser.userId,
      );
      expect(mockAuthService.revokeToken).not.toHaveBeenCalled();
      expect(mockAuthService.revokeAllUserTokens).not.toHaveBeenCalled();
    });

    it('revokeToken delegates to the PAT service and resolves void', async () => {
      mockPersonalAccessTokenService.revokeToken.mockResolvedValue('revoked');

      const result = await controller.revokeToken(
        currentUser,
        '11111111-1111-4111-8111-111111111111',
      );

      expect(result).toBeUndefined();
      expect(mockPersonalAccessTokenService.revokeToken).toHaveBeenCalledWith(
        currentUser.userId,
        '11111111-1111-4111-8111-111111111111',
      );
      expect(mockAuthService.revokeToken).not.toHaveBeenCalled();
      expect(mockAuthService.revokeAllUserTokens).not.toHaveBeenCalled();
    });

    it('revokeToken returns 404 when the PAT service cannot find the token', async () => {
      mockPersonalAccessTokenService.revokeToken.mockResolvedValue('not_found');

      await expect(
        controller.revokeToken(
          currentUser,
          '22222222-2222-4222-8222-222222222222',
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('revokeToken treats already revoked tokens as a no-op success', async () => {
      mockPersonalAccessTokenService.revokeToken.mockResolvedValue(
        'already_revoked',
      );

      const result = await controller.revokeToken(
        currentUser,
        '11111111-1111-4111-8111-111111111111',
      );

      expect(result).toBeUndefined();
      expect(mockPersonalAccessTokenService.revokeToken).toHaveBeenCalledWith(
        currentUser.userId,
        '11111111-1111-4111-8111-111111111111',
      );
    });

    it('revokeToken rejects malformed UUIDs before calling the PAT service', async () => {
      const routeArgs = Reflect.getMetadata(
        ROUTE_ARGS_METADATA,
        UserController,
        'revokeToken',
      ) as Record<string, { data?: string; pipes?: unknown[] }>;
      const binding = Object.values(routeArgs).find(
        (value) => value.data === 'id',
      );

      expect(binding).toBeDefined();
      expect(binding?.pipes).toEqual(
        expect.arrayContaining([expect.any(ParseUUIDPipe)]),
      );
    });
  });
});
