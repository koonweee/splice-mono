import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { jwtVerify } from 'jose';
import { GoogleOAuthService } from '../../src/auth/google-oauth.service';
import { mockUser } from '../mocks/user/user.mock';

jest.mock('jose', () => ({
  createRemoteJWKSet: jest.fn(() => 'mock-jwks'),
  jwtVerify: jest.fn(),
}));

describe('GoogleOAuthService', () => {
  const originalEnv = process.env;
  const fetchMock = jest.fn();
  const userService = {
    findOrCreateFromGoogleIdentity: jest.fn(),
  };
  const authService = {
    generateAccessToken: jest.fn(),
    generateRefreshToken: jest.fn(),
  };

  let service: GoogleOAuthService;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      GOOGLE_OAUTH_CLIENT_ID: 'google-client-id',
      GOOGLE_OAUTH_CLIENT_SECRET: 'google-client-secret',
      GOOGLE_OAUTH_CALLBACK_URL:
        'http://localhost:3000/user/oauth/google/callback',
      GOOGLE_ALLOWED_EMAILS: 'allowed@example.com',
      FRONTEND_DOMAIN: 'http://localhost:4000',
    };
    global.fetch = fetchMock;
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: jest
        .fn()
        .mockResolvedValue(JSON.stringify({ id_token: 'google-id-token' })),
    });
    jest.mocked(jwtVerify).mockResolvedValue({
      payload: {
        sub: 'google-subject',
        email: 'Allowed@Example.com',
        email_verified: true,
        name: 'Allowed User',
        picture: 'https://example.com/avatar.png',
      },
      protectedHeader: { alg: 'RS256' },
      key: new Uint8Array(),
    } as any);
    userService.findOrCreateFromGoogleIdentity.mockResolvedValue(mockUser);
    authService.generateAccessToken.mockReturnValue('access-token');
    authService.generateRefreshToken.mockResolvedValue('refresh-token');
    service = new GoogleOAuthService(userService as any, authService as any);
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  it('builds a Google authorization URL with required params', () => {
    const url = new URL(service.buildAuthorizationUrl('state-value'));

    expect(url.origin + url.pathname).toBe(
      'https://accounts.google.com/o/oauth2/v2/auth',
    );
    expect(url.searchParams.get('client_id')).toBe('google-client-id');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'http://localhost:3000/user/oauth/google/callback',
    );
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('scope')).toBe('openid email profile');
    expect(url.searchParams.get('state')).toBe('state-value');
  });

  it('accepts only safe relative redirect paths', () => {
    expect(service.validateRedirectPath('/accounts?tab=active')).toBe(
      '/accounts?tab=active',
    );
    expect(() => service.validateRedirectPath('https://evil.example')).toThrow(
      'Invalid redirect target',
    );
    expect(() => service.validateRedirectPath('//evil.example')).toThrow(
      'Invalid redirect target',
    );
    expect(() => service.validateRedirectPath('/\\evil.example')).toThrow(
      'Invalid redirect target',
    );
  });

  it('builds frontend redirect URLs from safe relative paths', () => {
    expect(
      service.buildFrontendRedirectUrl('/accounts?tab=active#linked'),
    ).toBe('http://localhost:4000/accounts?tab=active#linked');
  });

  it('exchanges code, verifies the ID token, creates a Splice session', async () => {
    const result = await service.completeCallback('google-code', '/home');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://oauth2.googleapis.com/token',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(jwtVerify).toHaveBeenCalledWith(
      'google-id-token',
      'mock-jwks',
      expect.objectContaining({
        audience: 'google-client-id',
      }),
    );
    expect(userService.findOrCreateFromGoogleIdentity).toHaveBeenCalledWith({
      googleSubject: 'google-subject',
      email: 'allowed@example.com',
      displayName: 'Allowed User',
      avatarUrl: 'https://example.com/avatar.png',
    });
    expect(result).toEqual({
      redirectPath: '/home',
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      user: mockUser,
    });
  });

  it('rejects unverified Google email claims', async () => {
    jest.mocked(jwtVerify).mockResolvedValueOnce({
      payload: {
        sub: 'google-subject',
        email: 'allowed@example.com',
        email_verified: false,
      },
      protectedHeader: { alg: 'RS256' },
      key: new Uint8Array(),
    } as any);

    await expect(
      service.completeCallback('google-code', '/home'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects verified emails outside the allowlist', async () => {
    jest.mocked(jwtVerify).mockResolvedValueOnce({
      payload: {
        sub: 'google-subject',
        email: 'other@example.com',
        email_verified: true,
      },
      protectedHeader: { alg: 'RS256' },
      key: new Uint8Array(),
    } as any);

    await expect(
      service.completeCallback('google-code', '/home'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(userService.findOrCreateFromGoogleIdentity).not.toHaveBeenCalled();
  });

  it('logs sanitized Google token exchange errors', async () => {
    const warnSpy = jest
      .spyOn((service as any).logger, 'warn')
      .mockImplementation();

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: jest.fn().mockResolvedValue(
        JSON.stringify({
          error: 'invalid_client',
          error_description: 'Unauthorized',
        }),
      ),
    });

    await expect(
      service.completeCallback('google-code', '/home'),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(warnSpy).toHaveBeenCalledWith(
      {
        status: 401,
        googleError: 'invalid_client',
        googleErrorDescription: 'Unauthorized',
        googleResponseContentType: 'application/json',
        googleResponseBodyPreview: undefined,
        callbackUrl: 'http://localhost:3000/user/oauth/google/callback',
      },
      'Google OAuth token exchange rejected',
    );
  });

  it('logs an unstructured Google token exchange response preview', async () => {
    const warnSpy = jest
      .spyOn((service as any).logger, 'warn')
      .mockImplementation();

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      headers: new Headers({ 'content-type': 'text/plain' }),
      text: jest.fn().mockResolvedValue('Unauthorized'),
    });

    await expect(
      service.completeCallback('google-code', '/home'),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(warnSpy).toHaveBeenCalledWith(
      {
        status: 401,
        googleError: undefined,
        googleErrorDescription: undefined,
        googleResponseContentType: 'text/plain',
        googleResponseBodyPreview: 'Unauthorized',
        callbackUrl: 'http://localhost:3000/user/oauth/google/callback',
      },
      'Google OAuth token exchange rejected',
    );
  });
});
