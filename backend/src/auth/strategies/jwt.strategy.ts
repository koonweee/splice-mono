import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';

export interface JwtPayload {
  sub: string; // user id
  email?: string;
  // Add other claims as needed
}

const ACCESS_TOKEN_COOKIE = 'splice_access_token';

/**
 * Extract JWT from cookie first, then fall back to Authorization header.
 * This allows both web clients (cookies) and mobile clients (header) to authenticate.
 */
function extractJwtFromCookieOrHeader(req: Request): string | null {
  // Try cookie first (for web clients)
  const cookieToken = req.cookies?.[ACCESS_TOKEN_COOKIE] as string | undefined;
  if (cookieToken) {
    return cookieToken;
  }

  // Fall back to Authorization header (for mobile clients)
  return ExtractJwt.fromAuthHeaderAsBearerToken()(req);
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET environment variable is not set');
    }

    super({
      jwtFromRequest: extractJwtFromCookieOrHeader,
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async validate(payload: JwtPayload) {
    if (!payload.sub) {
      throw new UnauthorizedException();
    }
    // Return user data to be attached to request.user
    return { userId: payload.sub, email: payload.email };
  }
}
