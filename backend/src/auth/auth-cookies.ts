import type { CookieOptions, Response } from 'express';

const isProduction = process.env.NODE_ENV === 'production';

export const ACCESS_TOKEN_COOKIE = 'splice_access_token';
export const REFRESH_TOKEN_COOKIE = 'splice_refresh_token';
export const OAUTH_STATE_COOKIE = 'splice_oauth_state';

export const ACCESS_TOKEN_MAX_AGE = 15 * 60 * 1000;
export const REFRESH_TOKEN_MAX_AGE = 30 * 24 * 60 * 60 * 1000;
export const OAUTH_STATE_MAX_AGE = 10 * 60 * 1000;

/**
 * Extract parent domain from a URL for cross-subdomain cookie sharing.
 * e.g., "https://app.splice.com" -> ".splice.com"
 */
export function getParentDomain(url: string): string | undefined {
  try {
    const hostname = new URL(url).hostname;
    const parts = hostname.split('.');
    if (parts.length < 2 || hostname === 'localhost') return undefined;
    return '.' + parts.slice(-2).join('.');
  } catch {
    return undefined;
  }
}

export function getAuthCookieOptions(): CookieOptions {
  const cookieDomain = process.env.FRONTEND_DOMAIN
    ? getParentDomain(process.env.FRONTEND_DOMAIN)
    : undefined;

  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    ...(cookieDomain && { domain: cookieDomain }),
  };
}

export function getOAuthStateCookieOptions(): CookieOptions {
  return {
    ...getOAuthStateClearCookieOptions(),
    maxAge: OAUTH_STATE_MAX_AGE,
  };
}

export function getOAuthStateClearCookieOptions(): CookieOptions {
  return {
    ...getAuthCookieOptions(),
    path: '/user/oauth/google/callback',
  };
}

export function setSessionCookies(
  res: Response,
  tokens: { accessToken: string; refreshToken: string },
): void {
  const cookieOptions = getAuthCookieOptions();

  res.cookie(ACCESS_TOKEN_COOKIE, tokens.accessToken, {
    ...cookieOptions,
    maxAge: ACCESS_TOKEN_MAX_AGE,
  });
  res.cookie(REFRESH_TOKEN_COOKIE, tokens.refreshToken, {
    ...cookieOptions,
    maxAge: REFRESH_TOKEN_MAX_AGE,
  });
}

export function clearSessionCookies(res: Response): void {
  const cookieOptions = getAuthCookieOptions();

  res.clearCookie(ACCESS_TOKEN_COOKIE, cookieOptions);
  res.clearCookie(REFRESH_TOKEN_COOKIE, cookieOptions);
}

export function setOAuthStateCookie(res: Response, value: string): void {
  res.cookie(OAUTH_STATE_COOKIE, value, getOAuthStateCookieOptions());
}

export function clearOAuthStateCookie(res: Response): void {
  res.clearCookie(OAUTH_STATE_COOKIE, getOAuthStateClearCookieOptions());
}
