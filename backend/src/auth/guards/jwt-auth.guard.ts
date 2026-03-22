import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { ExtractJwt } from 'passport-jwt';
import type { JwtUser } from '../decorators/current-user.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { SESSION_JWT_ONLY_KEY } from '../decorators/session-jwt-only.decorator';
import { PersonalAccessTokenService } from '../personal-access-token.service';

type AuthenticatedRequest = Request & { user?: JwtUser };

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private static readonly SESSION_COOKIE_KEY = 'splice_access_token';

  constructor(
    private reflector: Reflector,
    private readonly patService: PersonalAccessTokenService,
  ) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const hasSessionCookie = Boolean(
      request.cookies?.[JwtAuthGuard.SESSION_COOKIE_KEY],
    );

    if (hasSessionCookie) {
      return super.canActivate(context);
    }

    const rawBearer = ExtractJwt.fromAuthHeaderAsBearerToken()(request);

    if (rawBearer && this.patService.isPersonalAccessToken(rawBearer)) {
      return this.handlePersonalAccessToken(context, rawBearer);
    }

    return super.canActivate(context);
  }

  private async handlePersonalAccessToken(
    context: ExecutionContext,
    rawBearer: string,
  ): Promise<boolean> {
    const sessionJwtOnly = this.reflector.getAllAndOverride<boolean>(
      SESSION_JWT_ONLY_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (sessionJwtOnly) {
      throw new UnauthorizedException();
    }

    const user = await this.patService.validateToken(rawBearer);

    if (!user) {
      throw new UnauthorizedException();
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    request.user = user;
    return true;
  }
}
