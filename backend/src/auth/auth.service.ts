import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as crypto from 'crypto';
import { Repository } from 'typeorm';
import { RefreshTokenEntity } from './refresh-token.entity';

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

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // 30 days

    const entity = new RefreshTokenEntity();
    entity.token = hashedToken;
    entity.userId = userId;
    entity.expiresAt = expiresAt;
    entity.revoked = false;

    await this.refreshTokenRepository.save(entity);
    this.logger.log(`Generated refresh token for user: ${userId}`);

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

    const oldTokenEntity = await this.refreshTokenRepository.findOne({
      where: { token: hashedOldToken, revoked: false },
    });

    if (!oldTokenEntity) {
      // Check if token exists but is revoked (indicates reuse attempt)
      const revokedToken = await this.refreshTokenRepository.findOne({
        where: { token: hashedOldToken },
      });
      if (revokedToken) {
        this.logger.warn(
          `Refresh token reuse detected for user: ${revokedToken.userId}. Token was revoked at: ${revokedToken.updatedAt.toISOString()}. This may indicate a race condition on the client or token theft.`,
        );
      } else {
        this.logger.warn(
          'Invalid refresh token rotation attempted - token not found in database',
        );
      }
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (oldTokenEntity.expiresAt < new Date()) {
      this.logger.warn(
        `Expired refresh token rotation for user: ${oldTokenEntity.userId}`,
      );
      throw new UnauthorizedException('Refresh token expired');
    }

    // Revoke old token
    oldTokenEntity.revoked = true;
    await this.refreshTokenRepository.save(oldTokenEntity);

    // Generate new token
    const newRefreshToken = await this.generateRefreshToken(
      oldTokenEntity.userId,
    );

    this.logger.log(`Rotated refresh token for user: ${oldTokenEntity.userId}`);
    return { userId: oldTokenEntity.userId, newRefreshToken };
  }

  /**
   * Revoke a specific refresh token (single device logout)
   */
  async revokeToken(rawToken: string): Promise<void> {
    const hashedToken = this.hashToken(rawToken);
    await this.refreshTokenRepository.update(
      { token: hashedToken },
      { revoked: true },
    );
    this.logger.log('Revoked refresh token');
  }

  /**
   * Revoke all refresh tokens for a user (logout from all devices)
   */
  async revokeAllUserTokens(userId: string): Promise<void> {
    await this.refreshTokenRepository.update(
      { userId, revoked: false },
      { revoked: true },
    );
    this.logger.log(`Revoked all refresh tokens for user: ${userId}`);
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
