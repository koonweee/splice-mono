import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as crypto from 'crypto';
import { Repository } from 'typeorm';
import { RefreshTokenEntity } from './refresh-token.entity';

const REFRESH_TOKEN_TTL_DAYS = 30;
const REFRESH_TOKEN_ROTATION_GRACE_MS = 10_000;
const ROTATED_REFRESH_TOKEN_PREFIX = 'splice_refresh_rotated_v1';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(RefreshTokenEntity)
    private refreshTokenRepository: Repository<RefreshTokenEntity>,
    private jwtService: JwtService,
  ) {}

  /**
   * Generate an access token (15 min expiry, configured in auth.module.ts)
   */
  generateAccessToken(userId: string, email: string): string {
    return this.jwtService.sign({ sub: userId, email });
  }

  /**
   * Generate and store a refresh token (30 day expiry)
   * Returns the raw token to send to the client
   */
  async generateRefreshToken(userId: string): Promise<string> {
    const rawToken = crypto.randomBytes(64).toString('hex');
    const hashedToken = this.hashToken(rawToken);

    const entity = new RefreshTokenEntity();
    entity.token = hashedToken;
    entity.userId = userId;
    entity.expiresAt = this.getRefreshTokenExpiresAt();
    entity.revoked = false;
    entity.revokedAt = null;
    entity.revocationReason = null;
    entity.rotationGraceExpiresAt = null;
    entity.replacedByTokenId = null;

    await this.refreshTokenRepository.save(entity);
    this.logger.log({ userId }, 'Generated refresh token for user');

    return rawToken;
  }

  /**
   * Rotate refresh token: validate old token, revoke it, create new one
   * Returns new refresh token and user ID
   */
  async rotateRefreshToken(
    oldRawToken: string,
  ): Promise<{ userId: string; newRefreshToken: string }> {
    const hashedOldToken = this.hashToken(oldRawToken);
    const result = await this.refreshTokenRepository.manager.transaction(
      async (manager) => {
        const refreshTokenRepository =
          manager.getRepository(RefreshTokenEntity);
        const now = new Date();

        const oldTokenEntity = await refreshTokenRepository.findOne({
          where: { token: hashedOldToken },
          lock: { mode: 'pessimistic_write' },
        });

        if (!oldTokenEntity) {
          this.logger.warn(
            { reason: 'not_found' },
            'Invalid refresh token rotation attempted',
          );
          throw new UnauthorizedException('Invalid refresh token');
        }

        if (oldTokenEntity.expiresAt <= now) {
          this.logger.warn(
            {
              userId: oldTokenEntity.userId,
              refreshTokenId: oldTokenEntity.id,
              reason: 'expired',
              expiresAt: oldTokenEntity.expiresAt.toISOString(),
            },
            'Expired refresh token rotation attempted',
          );
          throw new UnauthorizedException('Refresh token expired');
        }

        if (oldTokenEntity.revoked) {
          return this.handleRevokedRefreshTokenRotation(
            oldRawToken,
            oldTokenEntity,
            now,
            refreshTokenRepository,
          );
        }

        const revokedAt = now;
        const rotationGraceExpiresAt = new Date(
          now.getTime() + REFRESH_TOKEN_ROTATION_GRACE_MS,
        );
        const replacementTokenId = crypto.randomUUID();
        const newRefreshToken = this.deriveRotatedRefreshToken(
          oldRawToken,
          oldTokenEntity.id,
        );

        const newTokenEntity = new RefreshTokenEntity();
        newTokenEntity.id = replacementTokenId;
        newTokenEntity.token = this.hashToken(newRefreshToken);
        newTokenEntity.userId = oldTokenEntity.userId;
        newTokenEntity.expiresAt = this.getRefreshTokenExpiresAt(now);
        newTokenEntity.revoked = false;
        newTokenEntity.revokedAt = null;
        newTokenEntity.revocationReason = null;
        newTokenEntity.rotationGraceExpiresAt = null;
        newTokenEntity.replacedByTokenId = null;

        oldTokenEntity.revoked = true;
        oldTokenEntity.revokedAt = revokedAt;
        oldTokenEntity.revocationReason = 'rotated';
        oldTokenEntity.rotationGraceExpiresAt = rotationGraceExpiresAt;
        oldTokenEntity.replacedByTokenId = replacementTokenId;

        await refreshTokenRepository.save(newTokenEntity);
        await refreshTokenRepository.save(oldTokenEntity);

        return { userId: oldTokenEntity.userId, newRefreshToken };
      },
    );

    this.logger.log(
      { userId: result.userId },
      'Rotated refresh token for user',
    );
    return result;
  }

  /**
   * Revoke a specific refresh token (single device logout)
   */
  async revokeToken(rawToken: string): Promise<void> {
    const hashedToken = this.hashToken(rawToken);
    const revokedAt = new Date();
    await this.refreshTokenRepository.update(
      { token: hashedToken },
      {
        revoked: true,
        revokedAt,
        revocationReason: 'logout',
        rotationGraceExpiresAt: null,
        replacedByTokenId: null,
      },
    );
    this.logger.log({}, 'Revoked refresh token');
  }

  /**
   * Revoke all refresh tokens for a user (logout from all devices)
   */
  async revokeAllUserTokens(userId: string): Promise<void> {
    const revokedAt = new Date();
    await this.refreshTokenRepository.update(
      { userId, revoked: false },
      {
        revoked: true,
        revokedAt,
        revocationReason: 'logout_all',
        rotationGraceExpiresAt: null,
        replacedByTokenId: null,
      },
    );
    this.logger.log({ userId }, 'Revoked all refresh tokens for user');
  }

  private async handleRevokedRefreshTokenRotation(
    oldRawToken: string,
    oldTokenEntity: RefreshTokenEntity,
    now: Date,
    refreshTokenRepository: Repository<RefreshTokenEntity>,
  ): Promise<{ userId: string; newRefreshToken: string }> {
    const isRotatedToken = oldTokenEntity.revocationReason === 'rotated';
    const isWithinGrace =
      oldTokenEntity.rotationGraceExpiresAt !== null &&
      oldTokenEntity.rotationGraceExpiresAt >= now;
    let replacementRevoked: boolean | undefined;
    let replacementRevocationReason: string | null | undefined;

    if (isRotatedToken && isWithinGrace && oldTokenEntity.replacedByTokenId) {
      const replacementToken = await refreshTokenRepository.findOne({
        where: { id: oldTokenEntity.replacedByTokenId },
      });
      replacementRevoked = replacementToken?.revoked;
      replacementRevocationReason = replacementToken?.revocationReason;
      const newRefreshToken = this.deriveRotatedRefreshToken(
        oldRawToken,
        oldTokenEntity.id,
      );

      if (
        replacementToken &&
        replacementToken.userId === oldTokenEntity.userId &&
        replacementToken.token === this.hashToken(newRefreshToken) &&
        !replacementToken.revoked &&
        replacementToken.expiresAt > now
      ) {
        this.logger.log(
          {
            userId: oldTokenEntity.userId,
            refreshTokenId: oldTokenEntity.id,
            replacementTokenId: replacementToken.id,
            reason: 'duplicate_within_grace',
            graceExpiresAt:
              oldTokenEntity.rotationGraceExpiresAt?.toISOString(),
          },
          'Refresh token duplicate rotation returned existing replacement',
        );
        return { userId: oldTokenEntity.userId, newRefreshToken };
      }
    }

    const reason =
      isRotatedToken && !isWithinGrace ? 'duplicate_outside_grace' : 'revoked';
    this.logger.warn(
      {
        userId: oldTokenEntity.userId,
        refreshTokenId: oldTokenEntity.id,
        replacementTokenId: oldTokenEntity.replacedByTokenId,
        reason,
        revocationReason: oldTokenEntity.revocationReason,
        replacementRevoked,
        replacementRevocationReason,
        revokedAt: oldTokenEntity.revokedAt?.toISOString(),
        graceExpiresAt: oldTokenEntity.rotationGraceExpiresAt?.toISOString(),
      },
      'Revoked refresh token rotation attempted',
    );

    throw new UnauthorizedException('Invalid refresh token');
  }

  private getRefreshTokenExpiresAt(now = new Date()): Date {
    const expiresAt = new Date(now);
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_TTL_DAYS);
    return expiresAt;
  }

  private deriveRotatedRefreshToken(
    oldRawToken: string,
    tokenId: string,
  ): string {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET environment variable is not set');
    }

    // During the short grace window, a repeated old token can receive the
    // same replacement without storing the replacement raw token. The tradeoff
    // is that possession of the old token remains useful until grace expires.
    return crypto
      .createHmac('sha256', secret)
      .update(`${ROTATED_REFRESH_TOKEN_PREFIX}:${tokenId}:${oldRawToken}`)
      .digest('hex');
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
