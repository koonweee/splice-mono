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
import { PERSONAL_ACCESS_TOKEN_ONLY_KEY } from '../decorators/personal-access-token-only.decorator';
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
    const rawBearer = ExtractJwt.fromAuthHeaderAsBearerToken()(request);
    const hasSessionCookie = Boolean(
      request.cookies?.[JwtAuthGuard.SESSION_COOKIE_KEY],
    );
    const sessionJwtOnly = this.reflector.getAllAndOverride<boolean>(
      SESSION_JWT_ONLY_KEY,
      [context.getHandler(), context.getClass()],
    );
    const personalAccessTokenOnly = this.reflector.getAllAndOverride<boolean>(
      PERSONAL_ACCESS_TOKEN_ONLY_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (rawBearer && this.patService.isPersonalAccessToken(rawBearer)) {
      if (sessionJwtOnly && hasSessionCookie) {
        return super.canActivate(context);
      }

      return this.handlePersonalAccessToken(context, rawBearer);
    }

    if (personalAccessTokenOnly) {
      throw new UnauthorizedException();
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
