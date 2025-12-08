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
      const result = await controller.login(mockLoginDto);

      expect(result).toEqual(mockLoginResponse);
      expect(mockUserService.login).toHaveBeenCalledWith(mockLoginDto);
    });

    it('should call userService.login with correct data', async () => {
      await controller.login(mockLoginDto);

      expect(mockUserService.login).toHaveBeenCalledTimes(1);
      expect(mockUserService.login).toHaveBeenCalledWith(mockLoginDto);
    });
  });
});
