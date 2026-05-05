import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  HttpCode,
  Get,
  NotFoundException,
  Patch,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import * as crypto from 'crypto';
import express from 'express';
import {
  clearOAuthStateCookie,
  clearSessionCookies,
  OAUTH_STATE_COOKIE,
  REFRESH_TOKEN_COOKIE,
  setOAuthStateCookie,
  setSessionCookies,
} from '../auth/auth-cookies';
import { AuthService } from '../auth/auth.service';
import {
  CurrentUser,
  type JwtUser,
} from '../auth/decorators/current-user.decorator';
import { SessionJwtOnly } from '../auth/decorators/session-jwt-only.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { GoogleOAuthService } from '../auth/google-oauth.service';
import { ZodApiBody, ZodApiResponse } from '../common/zod-api-response';
import { PersonalAccessTokenService } from '../auth/personal-access-token.service';
import type { RefreshTokenDto, TokenResponse, User } from '../types/User';
import {
  RefreshTokenDtoSchema,
  TokenResponseSchema,
  UserSchema,
} from '../types/User';
import type {
  CreatePersonalAccessTokenDto,
  CreatePersonalAccessTokenResponse,
  PersonalAccessToken,
} from '../types/PersonalAccessToken';
import {
  CreatePersonalAccessTokenDtoSchema,
  CreatePersonalAccessTokenResponseSchema,
  PersonalAccessTokenSchema,
} from '../types/PersonalAccessToken';
import type {
  UpdateUserSettingsDto,
  UserSettings,
} from '../types/UserSettings';
import {
  UpdateUserSettingsDtoSchema,
  UserSettingsSchema,
} from '../types/UserSettings';
import { ZodValidationPipe } from '../zod-validation/zod-validation.pipe';
import { UserService } from './user.service';

@ApiTags('user')
@Controller('user')
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly authService: AuthService,
    private readonly personalAccessTokenService: PersonalAccessTokenService,
    private readonly googleOAuthService: GoogleOAuthService,
  ) {}

  @Public()
  @Get('oauth/google/start')
  @ApiOperation({ description: 'Start Google OAuth login' })
  @ApiQuery({
    name: 'redirect',
    required: false,
    description: 'Relative frontend path to return to after login',
  })
  @ApiResponse({ status: 302, description: 'Redirects to Google OAuth' })
  @ApiResponse({ status: 400, description: 'Invalid redirect target' })
  oauthGoogleStart(
    @Query('redirect') redirect: string | undefined,
    @Res() res: express.Response,
  ): void {
    const redirectPath = this.googleOAuthService.validateRedirectPath(redirect);
    const state = crypto.randomBytes(32).toString('base64url');
    const cookieValue = this.encodeOAuthState({ state, redirectPath });
    const authorizationUrl =
      this.googleOAuthService.buildAuthorizationUrl(state);

    setOAuthStateCookie(res, cookieValue);
    res.redirect(authorizationUrl);
  }

  @Public()
  @Get('oauth/google/callback')
  @ApiOperation({ description: 'Complete Google OAuth login' })
  @ApiQuery({
    name: 'code',
    required: true,
    description: 'Google OAuth authorization code',
  })
  @ApiQuery({
    name: 'state',
    required: true,
    description: 'OAuth state value returned by Google',
  })
  @ApiResponse({
    status: 302,
    description: 'Sets session cookies and redirects',
  })
  @ApiResponse({ status: 401, description: 'Invalid Google OAuth callback' })
  async oauthGoogleCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Req() req: express.Request,
    @Res() res: express.Response,
  ): Promise<void> {
    if (!code || !state) {
      throw new BadRequestException('Missing OAuth callback parameters');
    }

    const storedState = this.decodeOAuthState(
      req.cookies?.[OAUTH_STATE_COOKIE] as string | undefined,
    );

    clearOAuthStateCookie(res);

    if (!storedState || storedState.state !== state) {
      throw new BadRequestException('Invalid OAuth state');
    }

    const result = await this.googleOAuthService.completeCallback(
      code,
      storedState.redirectPath,
    );

    setSessionCookies(res, result);
    res.redirect(
      this.googleOAuthService.buildFrontendRedirectUrl(result.redirectPath),
    );
  }

  @Get('me')
  @ApiOperation({ description: 'Get current user profile' })
  @ZodApiResponse({
    status: 200,
    description: 'Returns current user',
    schema: UserSchema,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async me(@CurrentUser() currentUser: JwtUser): Promise<User> {
    const user = await this.userService.findOne(currentUser.userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  @Patch('settings')
  @ApiOperation({ description: 'Update current user settings' })
  @ZodApiBody({ schema: UpdateUserSettingsDtoSchema })
  @ZodApiResponse({
    status: 200,
    description: 'Settings updated successfully',
    schema: UserSettingsSchema,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async updateSettings(
    @CurrentUser() currentUser: JwtUser,
    @Body(new ZodValidationPipe(UpdateUserSettingsDtoSchema))
    updateDto: UpdateUserSettingsDto,
  ): Promise<UserSettings> {
    const settings = await this.userService.updateSettings(
      currentUser.userId,
      updateDto,
    );
    if (!settings) {
      throw new NotFoundException('User not found');
    }
    return settings;
  }

  @Public()
  @Post('refresh')
  @ApiOperation({ description: 'Refresh access token using refresh token' })
  @ZodApiBody({ schema: RefreshTokenDtoSchema })
  @ZodApiResponse({
    status: 200,
    description: 'Tokens refreshed successfully',
    schema: TokenResponseSchema,
  })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
  async refresh(
    @Body(new ZodValidationPipe(RefreshTokenDtoSchema))
    dto: RefreshTokenDto,
    @Req() req: express.Request,
    @Res({ passthrough: true }) res: express.Response,
  ): Promise<TokenResponse> {
    // Try to get refresh token from cookie first, then fall back to body (for mobile)
    const refreshToken =
      (req.cookies?.[REFRESH_TOKEN_COOKIE] as string | undefined) ||
      dto.refreshToken;

    // Throw error if refresh token is not provided
    if (!refreshToken) {
      throw new BadRequestException('Refresh token is not provided');
    }

    const result = await this.userService.refreshTokens(refreshToken);

    setSessionCookies(res, result);

    // Also return tokens in body for mobile clients
    return result;
  }

  @Public()
  @Post('logout')
  @ApiOperation({ description: 'Logout and invalidate refresh token' })
  @ZodApiBody({ schema: RefreshTokenDtoSchema })
  @ApiResponse({ status: 200, description: 'Logged out successfully' })
  async logout(
    @Body(new ZodValidationPipe(RefreshTokenDtoSchema))
    dto: RefreshTokenDto,
    @Req() req: express.Request,
    @Res({ passthrough: true }) res: express.Response,
  ): Promise<void> {
    // Try to get refresh token from cookie first, then fall back to body (for mobile)
    const refreshToken =
      (req.cookies?.[REFRESH_TOKEN_COOKIE] as string | undefined) ||
      dto.refreshToken;

    if (refreshToken) {
      await this.authService.revokeToken(refreshToken);
    }

    clearSessionCookies(res);
  }

  @Post('logout-all')
  @ApiOperation({ description: 'Logout from all devices' })
  @ApiResponse({ status: 200, description: 'Logged out from all devices' })
  async logoutAll(
    @CurrentUser() currentUser: JwtUser,
    @Res({ passthrough: true }) res: express.Response,
  ): Promise<void> {
    await this.authService.revokeAllUserTokens(currentUser.userId);

    clearSessionCookies(res);
  }

  @Post('tokens')
  @SessionJwtOnly()
  @ApiOperation({ description: 'Create a personal access token' })
  @ZodApiBody({ schema: CreatePersonalAccessTokenDtoSchema })
  @ZodApiResponse({
    status: 201,
    description: 'Personal access token created successfully',
    schema: CreatePersonalAccessTokenResponseSchema,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async createToken(
    @CurrentUser() currentUser: JwtUser,
    @Body(new ZodValidationPipe(CreatePersonalAccessTokenDtoSchema))
    dto: CreatePersonalAccessTokenDto,
  ): Promise<CreatePersonalAccessTokenResponse> {
    const token = await this.personalAccessTokenService.createToken(
      currentUser,
      dto,
    );

    return {
      id: token.id,
      name: token.name,
      token: token.token,
      tokenPreview: token.tokenPreview,
      expiresAt: token.expiresAt,
      createdAt: token.createdAt,
    };
  }

  @Get('tokens')
  @SessionJwtOnly()
  @ApiOperation({ description: 'List personal access tokens' })
  @ZodApiResponse({
    status: 200,
    description: 'List personal access tokens',
    schema: PersonalAccessTokenSchema,
    isArray: true,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async listTokens(
    @CurrentUser() currentUser: JwtUser,
  ): Promise<PersonalAccessToken[]> {
    const tokens = await this.personalAccessTokenService.listTokens(
      currentUser.userId,
    );

    return tokens.map(
      ({
        id,
        name,
        tokenPreview,
        lastUsedAt,
        expiresAt,
        revokedAt,
        createdAt,
      }) => ({
        id,
        name,
        tokenPreview,
        lastUsedAt,
        expiresAt,
        revokedAt,
        createdAt,
      }),
    );
  }

  @Delete('tokens/:id')
  @SessionJwtOnly()
  @HttpCode(204)
  @ApiOperation({ description: 'Revoke a personal access token' })
  @ApiResponse({ status: 204, description: 'Token revoked successfully' })
  @ApiResponse({ status: 400, description: 'Invalid token ID' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Token not found' })
  async revokeToken(
    @CurrentUser() currentUser: JwtUser,
    @Param('id', new ParseUUIDPipe()) tokenId: string,
  ): Promise<void> {
    const result = await this.personalAccessTokenService.revokeToken(
      currentUser.userId,
      tokenId,
    );

    if (result === 'not_found') {
      throw new NotFoundException('Token not found');
    }
  }

  private encodeOAuthState(value: {
    state: string;
    redirectPath: string;
  }): string {
    const payload = Buffer.from(JSON.stringify(value), 'utf8').toString(
      'base64url',
    );
    return `${payload}.${this.signOAuthState(payload)}`;
  }

  private decodeOAuthState(
    value: string | undefined,
  ): { state: string; redirectPath: string } | null {
    if (!value) {
      return null;
    }

    try {
      const [payload, signature] = value.split('.');
      if (
        !payload ||
        !signature ||
        !this.isValidOAuthStateSignature(payload, signature)
      ) {
        return null;
      }

      const parsed: unknown = JSON.parse(
        Buffer.from(payload, 'base64url').toString('utf8'),
      );

      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        'state' in parsed &&
        'redirectPath' in parsed &&
        typeof parsed.state === 'string' &&
        typeof parsed.redirectPath === 'string'
      ) {
        return {
          state: parsed.state,
          redirectPath: parsed.redirectPath,
        };
      }
    } catch {
      return null;
    }

    return null;
  }

  private signOAuthState(payload: string): string {
    return crypto
      .createHmac('sha256', this.getStateSigningSecret())
      .update(payload)
      .digest('base64url');
  }

  private isValidOAuthStateSignature(
    payload: string,
    signature: string,
  ): boolean {
    const expectedSignature = this.signOAuthState(payload);
    const actualBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);

    return (
      actualBuffer.length === expectedBuffer.length &&
      crypto.timingSafeEqual(actualBuffer, expectedBuffer)
    );
  }

  private getStateSigningSecret(): string {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET environment variable is not set');
    }
    return secret;
  }
}
