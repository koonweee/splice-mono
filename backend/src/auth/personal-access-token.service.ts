import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as crypto from 'crypto';
import { IsNull, Repository } from 'typeorm';
import { JwtUser } from './decorators/current-user.decorator';
import {
  PersonalAccessTokenEntity,
  type PersonalAccessTokenCreated,
  type PersonalAccessTokenListItem,
} from './personal-access-token.entity';
import { UserEntity } from '../user/user.entity';

export interface CreatePersonalAccessTokenDto {
  name: string;
  expiresAt?: Date | string | null;
}

export type RevokeTokenResult = 'revoked' | 'not_found' | 'already_revoked';

const TOKEN_PREFIX = 'splice_pat';
const TOKEN_PREVIEW_LENGTH = 8;

@Injectable()
export class PersonalAccessTokenService {
  constructor(
    @InjectRepository(PersonalAccessTokenEntity)
    private readonly personalAccessTokenRepository: Repository<PersonalAccessTokenEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
  ) {}

  async createToken(
    user: JwtUser,
    dto: CreatePersonalAccessTokenDto,
  ): Promise<PersonalAccessTokenCreated> {
    const { token, prefix } = this.generateRawToken();
    const tokenHash = this.hashToken(token);
    const expiresAt = this.normalizeExpiresAt(dto.expiresAt);

    const entity = new PersonalAccessTokenEntity();
    entity.userId = user.userId;
    entity.name = dto.name;
    entity.tokenHash = tokenHash;
    entity.prefix = prefix;
    entity.lastUsedAt = null;
    entity.expiresAt = expiresAt;
    entity.revokedAt = null;

    const savedEntity = await this.personalAccessTokenRepository.save(entity);

    return {
      ...savedEntity.toObject(),
      token,
    };
  }

  async listTokens(userId: string): Promise<PersonalAccessTokenListItem[]> {
    const entities = await this.personalAccessTokenRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });

    return entities.map((entity) => entity.toObject());
  }

  async revokeToken(
    userId: string,
    tokenId: string,
  ): Promise<RevokeTokenResult> {
    const entity = await this.personalAccessTokenRepository.findOne({
      where: { id: tokenId, userId },
    });

    if (!entity) {
      return 'not_found';
    }

    if (entity.revokedAt) {
      return 'already_revoked';
    }

    const result = await this.personalAccessTokenRepository.update(
      {
        id: tokenId,
        userId,
        revokedAt: IsNull(),
      },
      { revokedAt: new Date() },
    );

    if (!result.affected) {
      return 'already_revoked';
    }

    return 'revoked';
  }

  isPersonalAccessToken(rawToken: string): boolean {
    return rawToken.startsWith(`${TOKEN_PREFIX}_`);
  }

  async validateToken(rawToken: string): Promise<JwtUser | null> {
    if (!this.isPersonalAccessToken(rawToken)) {
      return null;
    }

    const escape = (path: string) =>
      path
        .split('.')
        .map((part) =>
          this.personalAccessTokenRepository.manager.connection.driver.escape(
            part,
          ),
        )
        .join('.');
    const tokens = escape(
      this.personalAccessTokenRepository.metadata.tablePath,
    );
    const users = escape(this.userRepository.metadata.tablePath);
    // The row lock lasts only for this statement. Revocation and user deletion
    // (which cascades to this row) cannot pass validation while waiting on a
    // coalesced usage write. A valid row remains valid when no usage write is due.
    const rows: JwtUser[] = await this.personalAccessTokenRepository.query(
      `WITH valid_token AS MATERIALIZED (
        SELECT token.id, token."userId", token."lastUsedAt", token."expiresAt", account.email
        FROM ${tokens} token
        INNER JOIN ${users} account ON account.id = token."userId"
        WHERE token."tokenHash" = $1 AND token."revokedAt" IS NULL
          AND (token."expiresAt" IS NULL OR token."expiresAt" > clock_timestamp())
        FOR UPDATE OF token
      ), usage AS (
        UPDATE ${tokens} token
        SET "lastUsedAt" = clock_timestamp(), "updatedAt" = clock_timestamp()
        FROM valid_token valid
        WHERE token.id = valid.id
          AND (valid."expiresAt" IS NULL OR valid."expiresAt" > clock_timestamp())
          AND (valid."lastUsedAt" IS NULL OR valid."lastUsedAt" <= clock_timestamp() - interval '60 seconds')
        RETURNING token.id
      )
      SELECT "userId", email FROM valid_token
      WHERE "expiresAt" IS NULL OR "expiresAt" > clock_timestamp()`,
      [this.hashToken(rawToken)],
    );
    return rows[0] ?? null;
  }

  private generateRawToken(): { token: string; prefix: string } {
    const secret = crypto.randomBytes(32).toString('hex');
    return {
      token: `${TOKEN_PREFIX}_${secret}`,
      prefix: secret.slice(0, TOKEN_PREVIEW_LENGTH),
    };
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private normalizeExpiresAt(expiresAt?: Date | string | null): Date | null {
    if (expiresAt === null || expiresAt === undefined) {
      return null;
    }

    const parsedDate =
      expiresAt instanceof Date
        ? expiresAt
        : this.parseExpiresAtString(expiresAt);

    if (Number.isNaN(parsedDate.getTime())) {
      throw new BadRequestException('Invalid expiresAt');
    }

    return parsedDate;
  }

  private parseExpiresAtString(expiresAt: string): Date {
    if (expiresAt.trim() === '') {
      throw new BadRequestException('Invalid expiresAt');
    }

    return new Date(expiresAt);
  }
}
