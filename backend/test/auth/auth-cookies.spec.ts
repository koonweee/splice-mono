import {
  clearSessionCookies,
  getAuthCookieOptions,
  getOAuthStateClearCookieOptions,
  getOAuthStateCookieOptions,
  getParentDomain,
  setOAuthStateCookie,
  setSessionCookies,
} from '../../src/auth/auth-cookies';

describe('auth cookie helpers', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, NODE_ENV: 'development' };
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  it('derives a parent domain for production subdomains', () => {
    expect(getParentDomain('https://app.splice.example')).toBe(
      '.splice.example',
    );
  });

  it('does not set a cookie domain for localhost', () => {
    process.env.FRONTEND_DOMAIN = 'http://localhost:4000';

    expect(getAuthCookieOptions()).toEqual(
      expect.objectContaining({
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        path: '/',
      }),
    );
    expect(getAuthCookieOptions()).not.toHaveProperty('domain');
  });

  it('sets and clears session cookies with HTTP-only options', () => {
    const res = {
      cookie: jest.fn(),
      clearCookie: jest.fn(),
    };

    setSessionCookies(res as any, {
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });
    clearSessionCookies(res as any);

    expect(res.cookie).toHaveBeenCalledWith(
      'splice_access_token',
      'access-token',
      expect.objectContaining({ httpOnly: true, maxAge: 900000 }),
    );
    expect(res.cookie).toHaveBeenCalledWith(
      'splice_refresh_token',
      'refresh-token',
      expect.objectContaining({ httpOnly: true, maxAge: 2592000000 }),
    );
    expect(res.clearCookie).toHaveBeenCalledTimes(2);
  });

  it('sets a short-lived OAuth state cookie', () => {
    const res = {
      cookie: jest.fn(),
    };

    setOAuthStateCookie(res as any, 'state-payload');

    expect(res.cookie).toHaveBeenCalledWith(
      'splice_oauth_state',
      'state-payload',
      expect.objectContaining({
        httpOnly: true,
        maxAge: 600000,
        path: '/user/oauth/google/callback',
      }),
    );
  });

  it('scopes OAuth state cookies to the callback path', () => {
    expect(getOAuthStateCookieOptions()).toEqual(
      expect.objectContaining({
        path: '/user/oauth/google/callback',
        maxAge: 600000,
      }),
    );
    expect(getOAuthStateClearCookieOptions()).toEqual(
      expect.objectContaining({
        path: '/user/oauth/google/callback',
      }),
    );
    expect(getOAuthStateClearCookieOptions()).not.toHaveProperty('maxAge');
  });
});
