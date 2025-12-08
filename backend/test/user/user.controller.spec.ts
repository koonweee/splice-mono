import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from '../../src/auth/auth.service';
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
});
