import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Patch,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import express from 'express';
import { AuthService } from '../auth/auth.service';
import {
  CurrentUser,
  type JwtUser,
} from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { ZodApiBody, ZodApiResponse } from '../common/zod-api-response';
import type {
  CreateUserDto,
  LoginDto,
  LoginResponse,
  RefreshTokenDto,
  TokenResponse,
  User,
} from '../types/User';
import {
  CreateUserDtoSchema,
  LoginDtoSchema,
  LoginResponseSchema,
  RefreshTokenDtoSchema,
  TokenResponseSchema,
  UserSchema,
} from '../types/User';
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

// Cookie configuration
const isProduction = process.env.NODE_ENV === 'production';

/**
 * Extract parent domain from a URL for cross-subdomain cookie sharing.
 * e.g., "https://app.splice.com" -> ".splice.com"
 */
function getParentDomain(url: string): string | undefined {
  try {
    const hostname = new URL(url).hostname;
    const parts = hostname.split('.');
    // Need at least 2 parts (e.g., splice.com)
    if (parts.length < 2) return undefined;
    // Return last two parts with leading dot
    return '.' + parts.slice(-2).join('.');
  } catch {
    return undefined;
  }
}

const cookieDomain = process.env.FRONTEND_DOMAIN
  ? getParentDomain(process.env.FRONTEND_DOMAIN)
  : undefined;

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: isProduction,
  sameSite: 'lax' as const,
  path: '/',
  ...(cookieDomain && { domain: cookieDomain }),
};
const ACCESS_TOKEN_COOKIE = 'splice_access_token';
const REFRESH_TOKEN_COOKIE = 'splice_refresh_token';
// Access token: 15 minutes
const ACCESS_TOKEN_MAX_AGE = 15 * 60 * 1000;
// Refresh token: 30 days
const REFRESH_TOKEN_MAX_AGE = 30 * 24 * 60 * 60 * 1000;

@ApiTags('user')
@Controller('user')
export class UserController {
  constructor(
    private userService: UserService,
    private authService: AuthService,
  ) {}

  @Public()
  @Post('register')
  @ApiOperation({ description: 'Register a new user' })
  @ZodApiBody({ schema: CreateUserDtoSchema })
  @ZodApiResponse({
    status: 201,
    description: 'User registered successfully',
    schema: UserSchema,
  })
  @ApiResponse({ status: 409, description: 'User already exists' })
  async register(
    @Body(new ZodValidationPipe(CreateUserDtoSchema))
    createUserDto: CreateUserDto,
  ): Promise<User> {
    return this.userService.create(createUserDto);
  }

  @Public()
  @Post('login')
  @ApiOperation({ description: 'Login and get JWT token' })
  @ZodApiBody({ schema: LoginDtoSchema })
  @ZodApiResponse({
    status: 200,
    description: 'Login successful',
    schema: LoginResponseSchema,
  })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(
    @Body(new ZodValidationPipe(LoginDtoSchema))
    loginDto: LoginDto,
    @Res({ passthrough: true }) res: express.Response,
  ): Promise<LoginResponse> {
    const result = await this.userService.login(loginDto);

    // Set HTTP-only cookies for web clients
    res.cookie(ACCESS_TOKEN_COOKIE, result.accessToken, {
      ...COOKIE_OPTIONS,
      maxAge: ACCESS_TOKEN_MAX_AGE,
    });
    res.cookie(REFRESH_TOKEN_COOKIE, result.refreshToken, {
      ...COOKIE_OPTIONS,
      maxAge: REFRESH_TOKEN_MAX_AGE,
    });

    // Also return tokens in body for mobile clients
    return result;
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

    // Set HTTP-only cookies for web clients
    res.cookie(ACCESS_TOKEN_COOKIE, result.accessToken, {
      ...COOKIE_OPTIONS,
      maxAge: ACCESS_TOKEN_MAX_AGE,
    });
    res.cookie(REFRESH_TOKEN_COOKIE, result.refreshToken, {
      ...COOKIE_OPTIONS,
      maxAge: REFRESH_TOKEN_MAX_AGE,
    });

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

    // Clear cookies for web clients
    res.clearCookie(ACCESS_TOKEN_COOKIE, COOKIE_OPTIONS);
    res.clearCookie(REFRESH_TOKEN_COOKIE, COOKIE_OPTIONS);
  }

  @Post('logout-all')
  @ApiOperation({ description: 'Logout from all devices' })
  @ApiResponse({ status: 200, description: 'Logged out from all devices' })
  async logoutAll(
    @CurrentUser() currentUser: JwtUser,
    @Res({ passthrough: true }) res: express.Response,
  ): Promise<void> {
    await this.authService.revokeAllUserTokens(currentUser.userId);

    // Clear cookies for web clients
    res.clearCookie(ACCESS_TOKEN_COOKIE, COOKIE_OPTIONS);
    res.clearCookie(REFRESH_TOKEN_COOKIE, COOKIE_OPTIONS);
  }
}
