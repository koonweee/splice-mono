import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

export interface JwtUser {
  userId: string;
  email: string;
}

/**
 * Parameter decorator that extracts the current user from the JWT token.
 * Returns { userId, email } - no database call.
 *
 * @example
 * ```typescript
 * @Get()
 * async findAll(@CurrentUser() user: JwtUser) {
 *   return this.service.findAllForUser(user.userId);
 * }
 * ```
 */
export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): JwtUser => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return request.user as JwtUser;
  },
);
