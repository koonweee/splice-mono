import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { AuthService } from './auth.service';
import { UserService } from '../user/user.service';
import type { TokenResponse, User } from '../types/User';

interface GoogleTokenResponse {
  id_token: string;
}

interface GoogleOAuthErrorResponse {
  error?: string;
  error_description?: string;
}

interface ParsedGoogleTokenBody {
  body: unknown;
  contentType: string;
  rawBodyPreview?: string;
}

interface VerifiedGoogleIdentity {
  subject: string;
  email: string;
  displayName?: string;
  avatarUrl?: string;
}

export interface GoogleOAuthSession {
  redirectPath: string;
  accessToken: string;
  refreshToken: string;
  user: User;
}

const GOOGLE_AUTHORIZATION_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_JWKS_URL = new URL('https://www.googleapis.com/oauth2/v3/certs');
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

const googleJwks = createRemoteJWKSet(GOOGLE_JWKS_URL);

@Injectable()
export class GoogleOAuthService {
  private readonly logger = new Logger(GoogleOAuthService.name);

  constructor(
    private readonly userService: UserService,
    private readonly authService: AuthService,
  ) {}

  buildAuthorizationUrl(state: string): string {
    const clientId = this.requireEnv('GOOGLE_OAUTH_CLIENT_ID');
    const callbackUrl = this.requireEnv('GOOGLE_OAUTH_CALLBACK_URL');
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: callbackUrl,
      response_type: 'code',
      scope: 'openid email profile',
      state,
    });

    this.logger.log({}, 'Starting Google OAuth flow');
    return `${GOOGLE_AUTHORIZATION_URL}?${params.toString()}`;
  }

  async completeCallback(
    code: string,
    redirectPath: string,
  ): Promise<GoogleOAuthSession> {
    const tokenResponse = await this.exchangeCode(code);
    const identity = await this.verifyIdToken(tokenResponse.id_token);
    this.enforceAllowedEmail(identity.email);

    const user = await this.userService.findOrCreateFromGoogleIdentity({
      googleSubject: identity.subject,
      email: identity.email,
      displayName: identity.displayName,
      avatarUrl: identity.avatarUrl,
    });
    const tokens = await this.createSession(user);

    this.logger.log({ userId: user.id }, 'Google OAuth callback succeeded');
    return {
      redirectPath,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user,
    };
  }

  validateRedirectPath(redirect: string | undefined): string {
    if (!redirect) {
      return '/home';
    }

    if (
      !redirect.startsWith('/') ||
      redirect.startsWith('//') ||
      redirect.includes('\\')
    ) {
      throw new BadRequestException('Invalid redirect target');
    }

    try {
      const parsed = new URL(redirect, 'http://splice.local');
      if (parsed.origin !== 'http://splice.local') {
        throw new BadRequestException('Invalid redirect target');
      }
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Invalid redirect target');
    }
  }

  buildFrontendRedirectUrl(redirectPath: string): string {
    const safeRedirectPath = this.validateRedirectPath(redirectPath);
    const frontendDomain = this.requireEnv('FRONTEND_DOMAIN');

    try {
      const frontendOrigin = new URL(frontendDomain).origin;
      return new URL(safeRedirectPath, `${frontendOrigin}/`).toString();
    } catch {
      this.logger.error(
        { frontendDomain },
        'Invalid frontend domain configuration',
      );
      throw new InternalServerErrorException(
        'Frontend redirect is not configured',
      );
    }
  }

  private async exchangeCode(code: string): Promise<GoogleTokenResponse> {
    const clientId = this.requireEnv('GOOGLE_OAUTH_CLIENT_ID');
    const clientSecret = this.requireEnv('GOOGLE_OAUTH_CLIENT_SECRET');
    const callbackUrl = this.requireEnv('GOOGLE_OAUTH_CALLBACK_URL');

    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: callbackUrl,
        grant_type: 'authorization_code',
      }),
    });

    const parsedBody = await this.parseGoogleTokenBody(response);
    const body = parsedBody.body;
    if (!response.ok || !this.isGoogleTokenResponse(body)) {
      const googleError = this.extractGoogleError(body);
      this.logger.warn(
        {
          status: response.status,
          googleError: googleError.error,
          googleErrorDescription: googleError.errorDescription,
          googleResponseContentType: parsedBody.contentType,
          googleResponseBodyPreview:
            googleError.error || googleError.errorDescription
              ? undefined
              : parsedBody.rawBodyPreview,
          callbackUrl,
        },
        'Google OAuth token exchange rejected',
      );
      throw new UnauthorizedException('Google OAuth token exchange failed');
    }

    return body;
  }

  private async verifyIdToken(
    idToken: string,
  ): Promise<VerifiedGoogleIdentity> {
    const clientId = this.requireEnv('GOOGLE_OAUTH_CLIENT_ID');

    try {
      const { payload } = await jwtVerify(idToken, googleJwks, {
        audience: clientId,
        issuer: GOOGLE_ISSUERS,
      });

      if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
        throw new UnauthorizedException('Google identity is missing subject');
      }
      if (typeof payload.email !== 'string' || payload.email.length === 0) {
        throw new UnauthorizedException('Google identity is missing email');
      }
      if (payload.email_verified !== true) {
        throw new UnauthorizedException('Google email is not verified');
      }

      return {
        subject: payload.sub,
        email: this.normalizeEmail(payload.email),
        displayName:
          typeof payload.name === 'string' ? payload.name : undefined,
        avatarUrl:
          typeof payload.picture === 'string' ? payload.picture : undefined,
      };
    } catch (error) {
      this.logger.warn(
        {
          reason:
            error instanceof Error ? error.constructor.name : 'unknown_error',
        },
        'Google OAuth ID token rejected',
      );
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid Google identity token');
    }
  }

  private enforceAllowedEmail(email: string): void {
    const allowedEmails = this.allowedEmails();
    if (!allowedEmails.has(email)) {
      this.logger.warn({ email }, 'Google OAuth email rejected by allowlist');
      throw new ForbiddenException('Google account is not allowed');
    }
  }

  private async createSession(user: User): Promise<TokenResponse> {
    const accessToken = this.authService.generateAccessToken(
      user.id,
      user.email,
    );
    const refreshToken = await this.authService.generateRefreshToken(user.id);
    return { accessToken, refreshToken };
  }

  private allowedEmails(): Set<string> {
    const raw = this.requireEnv('GOOGLE_ALLOWED_EMAILS');
    return new Set(
      raw
        .split(',')
        .map((email) => this.normalizeEmail(email))
        .filter((email) => email.length > 0),
    );
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private requireEnv(name: string): string {
    const value = process.env[name];
    if (!value) {
      this.logger.error({ name }, 'Missing Google OAuth configuration');
      throw new InternalServerErrorException('Google OAuth is not configured');
    }
    return value;
  }

  private isGoogleTokenResponse(body: unknown): body is GoogleTokenResponse {
    return (
      typeof body === 'object' &&
      body !== null &&
      'id_token' in body &&
      typeof body.id_token === 'string'
    );
  }

  private async parseGoogleTokenBody(
    response: Response,
  ): Promise<ParsedGoogleTokenBody> {
    const contentType = response.headers.get('content-type') ?? '';
    const rawBody = await response.text().catch(() => '');

    if (!rawBody) {
      return { body: {}, contentType };
    }

    try {
      return {
        body: JSON.parse(rawBody) as unknown,
        contentType,
        rawBodyPreview: this.previewResponseBody(rawBody),
      };
    } catch {
      return {
        body: {},
        contentType,
        rawBodyPreview: this.previewResponseBody(rawBody),
      };
    }
  }

  private extractGoogleError(body: unknown): {
    error?: string;
    errorDescription?: string;
  } {
    if (typeof body !== 'object' || body === null) {
      return {};
    }

    const errorBody = body as GoogleOAuthErrorResponse;
    return {
      error: typeof errorBody.error === 'string' ? errorBody.error : undefined,
      errorDescription:
        typeof errorBody.error_description === 'string'
          ? errorBody.error_description
          : undefined,
    };
  }

  private previewResponseBody(body: string): string {
    return body.replace(/\s+/g, ' ').trim().slice(0, 300);
  }
}
