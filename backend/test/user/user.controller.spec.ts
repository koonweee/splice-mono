import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from '../../src/auth/auth.service';
import { PersonalAccessTokenService } from '../../src/auth/personal-access-token.service';
import { UserController } from '../../src/user/user.controller';
import { UserService } from '../../src/user/user.service';
import { mockUserService } from '../mocks/user/user-service.mock';
import {
  mockCreateUserDto,
  mockLoginDto,
  mockLoginResponse,
  mockUser,
} from '../mocks/user/user.mock';

// Mock Express Response object
const mockResponse = () => ({
  cookie: jest.fn().mockReturnThis(),
  clearCookie: jest.fn().mockReturnThis(),
});

// Mock Express Request object
const mockRequest = (cookies: Record<string, string> = {}) => ({
  cookies,
});

describe('UserController', () => {
  let controller: UserController;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let service: UserService;

  const mockPersonalAccessTokenService = {
    createToken: jest.fn(),
    listTokens: jest.fn(),
    revokeToken: jest.fn(),
  };

  const mockAuthService = {
    revokeToken: jest.fn().mockResolvedValue(undefined),
    revokeAllUserTokens: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
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
      ],
    }).compile();

    controller = module.get<UserController>(UserController);
    service = module.get<UserService>(UserService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('register', () => {
    it('should create and return a new user', async () => {
      const result = await controller.register(mockCreateUserDto);

      expect(result).toEqual(mockUser);
      expect(mockUserService.create).toHaveBeenCalledWith(mockCreateUserDto);
    });

    it('should call userService.create with correct data', async () => {
      await controller.register(mockCreateUserDto);

      expect(mockUserService.create).toHaveBeenCalledTimes(1);
      expect(mockUserService.create).toHaveBeenCalledWith(mockCreateUserDto);
    });
  });

  describe('login', () => {
    it('should return access token and user on successful login', async () => {
      const res = mockResponse();
      const result = await controller.login(mockLoginDto, res as any);

      expect(result).toEqual(mockLoginResponse);
      expect(mockUserService.login).toHaveBeenCalledWith(mockLoginDto);
    });

    it('should set HTTP-only cookies on successful login', async () => {
      const res = mockResponse();
      await controller.login(mockLoginDto, res as any);

      expect(res.cookie).toHaveBeenCalledTimes(2);
      expect(res.cookie).toHaveBeenCalledWith(
        'splice_access_token',
        mockLoginResponse.accessToken,
        expect.objectContaining({ httpOnly: true }),
      );
      expect(res.cookie).toHaveBeenCalledWith(
        'splice_refresh_token',
        mockLoginResponse.refreshToken,
        expect.objectContaining({ httpOnly: true }),
      );
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
        id: 'pat-123',
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
        id: 'pat-123',
        name: 'codex-local',
        token: 'splice_pat_abc123',
        tokenPreview: 'splice_pat_deadbeef',
        expiresAt: new Date(expiresAt),
        createdAt: new Date('2024-01-01T00:00:00Z'),
      };
      mockPersonalAccessTokenService.createToken.mockResolvedValue(tokenPayload);

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
          id: 'pat-123',
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
          id: 'pat-123',
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

      const result = await controller.revokeToken(currentUser, 'pat-123');

      expect(result).toBeUndefined();
      expect(mockPersonalAccessTokenService.revokeToken).toHaveBeenCalledWith(
        currentUser.userId,
        'pat-123',
      );
      expect(mockAuthService.revokeToken).not.toHaveBeenCalled();
      expect(mockAuthService.revokeAllUserTokens).not.toHaveBeenCalled();
    });

    it('revokeToken returns 404 when the PAT service cannot find the token', async () => {
      mockPersonalAccessTokenService.revokeToken.mockResolvedValue('not_found');

      await expect(controller.revokeToken(currentUser, 'pat-missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('revokeToken treats already revoked tokens as a no-op success', async () => {
      mockPersonalAccessTokenService.revokeToken.mockResolvedValue('already_revoked');

      const result = await controller.revokeToken(currentUser, 'pat-123');

      expect(result).toBeUndefined();
      expect(mockPersonalAccessTokenService.revokeToken).toHaveBeenCalledWith(
        currentUser.userId,
        'pat-123',
      );
    });
  });
});
