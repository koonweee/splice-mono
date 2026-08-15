import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { getPostgresMutationAffectedCount } from '../common/postgres-mutation-result';
import { RefreshTokenEntity } from './refresh-token.entity';

export const REFRESH_TOKEN_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const REFRESH_TOKEN_CLEANUP_BATCH_SIZE = 100;
export const REFRESH_TOKEN_CLEANUP_MAX_BATCH_SIZE = 500;

@Injectable()
export class RefreshTokenCleanupService {
  private readonly logger = new Logger(RefreshTokenCleanupService.name);

  constructor(
    @InjectRepository(RefreshTokenEntity)
    private readonly repository: Repository<RefreshTokenEntity>,
  ) {}

  async cleanupInactiveTokens(
    now = new Date(),
    requestedBatchSize = REFRESH_TOKEN_CLEANUP_BATCH_SIZE,
  ): Promise<number> {
    const batchSize = Math.max(
      1,
      Math.min(requestedBatchSize, REFRESH_TOKEN_CLEANUP_MAX_BATCH_SIZE),
    );
    const cutoff = new Date(now.getTime() - REFRESH_TOKEN_RETENTION_MS);

    const deleted: unknown = await this.repository.query(
      `WITH candidates AS (
         SELECT token."id"
         FROM "refresh_token" token
         WHERE (
           token."revoked" = true
           AND COALESCE(token."revokedAt", token."updatedAt") < $1
         ) OR token."expiresAt" < $1
         ORDER BY LEAST(
           token."expiresAt",
           COALESCE(token."revokedAt", token."updatedAt")
         ) ASC, token."id" ASC
         FOR UPDATE SKIP LOCKED
         LIMIT $2
       )
       DELETE FROM "refresh_token" token
       USING candidates
       WHERE token."id" = candidates."id"
         AND (
           (
             token."revoked" = true
             AND COALESCE(token."revokedAt", token."updatedAt") < $1
           ) OR token."expiresAt" < $1
         )
       RETURNING token."id"`,
      [cutoff, batchSize],
    );

    const deletedCount = getPostgresMutationAffectedCount(deleted);
    this.logger.log(
      { cutoff, batchSize, deletedCount },
      'Inactive refresh token cleanup batch completed',
    );
    return deletedCount;
  }
}
