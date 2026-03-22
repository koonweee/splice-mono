import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from '../../src/auth/guards/jwt-auth.guard';
import { IS_PUBLIC_KEY } from '../../src/auth/decorators/public.decorator';

const SESSION_JWT_ONLY_KEY = 'sessionJwtOnly';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let reflector: jest.Mocked<Reflector>;
  let patService: {
    isPersonalAccessToken: jest.Mock;
    validateToken: jest.Mock;
  };

  const parentProto = Object.getPrototypeOf(
    JwtAuthGuard.prototype,
  ) as { canActivate: jest.Mock };

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    } as unknown as jest.Mocked<Reflector>;

    patService = {
      isPersonalAccessToken: jest.fn(),
      validateToken: jest.fn(),
    };

    guard = new JwtAuthGuard(reflector, patService as never);
    jest.spyOn(parentProto, 'canActivate').mockResolvedValue(true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function createContext(request: Record<string, unknown>): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
      getClass: () => class TestController {},
      getHandler: () => function testHandler() {},
    } as unknown as ExecutionContext;
  }

  it('bypasses auth for public routes', async () => {
    reflector.getAllAndOverride.mockImplementation((key) => {
      if (key === IS_PUBLIC_KEY) {
        return true;
      }

      return false;
    });

    const request = {
      headers: {
        authorization: 'Bearer splice_pat_deadbeef',
      },
    };

    await expect(
      Promise.resolve(guard.canActivate(createContext(request))),
    ).resolves.toBe(true);

    expect(patService.isPersonalAccessToken).not.toHaveBeenCalled();
    expect(patService.validateToken).not.toHaveBeenCalled();
  });

  it('validates a personal access token and attaches the user to the request', async () => {
    reflector.getAllAndOverride.mockImplementation((key) => {
      if (key === IS_PUBLIC_KEY) {
        return false;
      }

      if (key === SESSION_JWT_ONLY_KEY) {
        return false;
      }

      return undefined;
    });

    patService.isPersonalAccessToken.mockReturnValue(true);
    patService.validateToken.mockResolvedValue({
      userId: 'user-123',
      email: 'user@example.com',
    });

    const request = {
      headers: {
        authorization: 'Bearer splice_pat_deadbeef',
      },
    };

    await expect(
      Promise.resolve(guard.canActivate(createContext(request))),
    ).resolves.toBe(true);

    expect(patService.validateToken).toHaveBeenCalledWith('splice_pat_deadbeef');
    expect(request.user).toEqual({
      userId: 'user-123',
      email: 'user@example.com',
    });
  });

  it('rejects PATs on routes marked SessionJwtOnly', async () => {
    reflector.getAllAndOverride.mockImplementation((key) => {
      if (key === IS_PUBLIC_KEY) {
        return false;
      }

      if (key === SESSION_JWT_ONLY_KEY) {
        return true;
      }

      return undefined;
    });

    patService.isPersonalAccessToken.mockReturnValue(true);

    const request = {
      headers: {
        authorization: 'Bearer splice_pat_deadbeef',
      },
    };

    await expect(
      Promise.resolve(guard.canActivate(createContext(request))),
    ).rejects.toThrow(UnauthorizedException);

    expect(patService.validateToken).not.toHaveBeenCalled();
  });

  it('falls back to the Passport JWT guard for non-PAT bearer tokens', async () => {
    reflector.getAllAndOverride.mockImplementation((key) => {
      if (key === IS_PUBLIC_KEY) {
        return false;
      }

      if (key === SESSION_JWT_ONLY_KEY) {
        return false;
      }

      return undefined;
    });

    patService.isPersonalAccessToken.mockReturnValue(false);

    const request = {
      headers: {
        authorization: 'Bearer session-jwt-token',
      },
    };

    await expect(
      Promise.resolve(guard.canActivate(createContext(request))),
    ).resolves.toBe(true);

    expect(patService.validateToken).not.toHaveBeenCalled();
    expect(parentProto.canActivate).toHaveBeenCalledWith(expect.any(Object));
  });
});
