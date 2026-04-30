import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from '../../src/auth/guards/jwt-auth.guard';
import { PERSONAL_ACCESS_TOKEN_ONLY_KEY } from '../../src/auth/decorators/personal-access-token-only.decorator';
import { IS_PUBLIC_KEY } from '../../src/auth/decorators/public.decorator';

const SESSION_JWT_ONLY_KEY = 'sessionJwtOnly';

interface MockRequest {
  headers: {
    authorization?: string;
  };
  cookies?: {
    splice_access_token?: string;
  };
  user?: {
    userId: string;
    email: string;
  };
}

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let reflector: jest.Mocked<Reflector>;
  let patService: {
    isPersonalAccessToken: jest.Mock;
    validateToken: jest.Mock;
  };

  const parentProto = Object.getPrototypeOf(JwtAuthGuard.prototype) as {
    canActivate: jest.Mock;
  };

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

  function createContext(request: MockRequest): ExecutionContext {
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

    const request: MockRequest = {
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

    const request: MockRequest = {
      headers: {
        authorization: 'Bearer splice_pat_deadbeef',
      },
    };

    await expect(
      Promise.resolve(guard.canActivate(createContext(request))),
    ).resolves.toBe(true);

    expect(patService.validateToken).toHaveBeenCalledWith(
      'splice_pat_deadbeef',
    );
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

    const request: MockRequest = {
      headers: {
        authorization: 'Bearer splice_pat_deadbeef',
      },
    };

    await expect(
      Promise.resolve(guard.canActivate(createContext(request))),
    ).rejects.toThrow(UnauthorizedException);

    expect(patService.validateToken).not.toHaveBeenCalled();
  });

  it('prefers a PAT bearer token over the session cookie on ordinary routes', async () => {
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

    const request: MockRequest = {
      headers: {
        authorization: 'Bearer splice_pat_deadbeef',
      },
      cookies: {
        splice_access_token: 'session-cookie-token',
      },
    };

    await expect(
      Promise.resolve(guard.canActivate(createContext(request))),
    ).resolves.toBe(true);

    expect(patService.validateToken).toHaveBeenCalledWith(
      'splice_pat_deadbeef',
    );
    expect(parentProto.canActivate).not.toHaveBeenCalled();
    expect(request.user).toEqual({
      userId: 'user-123',
      email: 'user@example.com',
    });
  });

  it('prefers the session cookie over a PAT bearer token on SessionJwtOnly routes', async () => {
    reflector.getAllAndOverride.mockImplementation((key) => {
      if (key === IS_PUBLIC_KEY) {
        return false;
      }

      if (key === SESSION_JWT_ONLY_KEY) {
        return true;
      }

      return undefined;
    });

    const request: MockRequest = {
      headers: {
        authorization: 'Bearer splice_pat_deadbeef',
      },
      cookies: {
        splice_access_token: 'session-cookie-token',
      },
    };

    await expect(
      Promise.resolve(guard.canActivate(createContext(request))),
    ).resolves.toBe(true);

    expect(patService.isPersonalAccessToken).toHaveBeenCalledWith(
      'splice_pat_deadbeef',
    );
    expect(patService.validateToken).not.toHaveBeenCalled();
    expect(parentProto.canActivate).toHaveBeenCalledWith(expect.any(Object));
  });

  it('rejects invalid PATs on ordinary routes even when a session cookie is present', async () => {
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
    patService.validateToken.mockResolvedValue(null);

    const request: MockRequest = {
      headers: {
        authorization: 'Bearer splice_pat_deadbeef',
      },
      cookies: {
        splice_access_token: 'session-cookie-token',
      },
    };

    await expect(
      Promise.resolve(guard.canActivate(createContext(request))),
    ).rejects.toThrow(UnauthorizedException);

    expect(parentProto.canActivate).not.toHaveBeenCalled();
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

    const request: MockRequest = {
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

  it('rejects cookie-only requests on PersonalAccessTokenOnly routes', async () => {
    reflector.getAllAndOverride.mockImplementation((key) => {
      if (key === IS_PUBLIC_KEY) {
        return false;
      }

      if (key === PERSONAL_ACCESS_TOKEN_ONLY_KEY) {
        return true;
      }

      return undefined;
    });

    const request: MockRequest = {
      headers: {},
      cookies: {
        splice_access_token: 'session-cookie-token',
      },
    };

    expect(() => guard.canActivate(createContext(request))).toThrow(
      UnauthorizedException,
    );

    expect(parentProto.canActivate).not.toHaveBeenCalled();
  });

  it('rejects non-PAT bearer tokens on PersonalAccessTokenOnly routes', async () => {
    reflector.getAllAndOverride.mockImplementation((key) => {
      if (key === IS_PUBLIC_KEY) {
        return false;
      }

      if (key === PERSONAL_ACCESS_TOKEN_ONLY_KEY) {
        return true;
      }

      return undefined;
    });
    patService.isPersonalAccessToken.mockReturnValue(false);

    const request: MockRequest = {
      headers: {
        authorization: 'Bearer session-jwt-token',
      },
    };

    expect(() => guard.canActivate(createContext(request))).toThrow(
      UnauthorizedException,
    );

    expect(parentProto.canActivate).not.toHaveBeenCalled();
    expect(patService.validateToken).not.toHaveBeenCalled();
  });
});
