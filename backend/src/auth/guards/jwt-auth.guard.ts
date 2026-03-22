import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { ExtractJwt } from 'passport-jwt';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { SESSION_JWT_ONLY_KEY } from '../decorators/session-jwt-only.decorator';
import { PersonalAccessTokenService } from '../personal-access-token.service';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private reflector: Reflector,
    private readonly patService: PersonalAccessTokenService,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const rawBearer = ExtractJwt.fromAuthHeaderAsBearerToken()(request);

    if (rawBearer && this.patService.isPersonalAccessToken(rawBearer)) {
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

      request.user = user;
      return true;
    }

    return super.canActivate(context);
  }
}
