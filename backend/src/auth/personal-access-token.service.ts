import { Injectable } from '@nestjs/common';
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

    const tokenHash = this.hashToken(rawToken);
    const entity = await this.personalAccessTokenRepository.findOne({
      where: {
        tokenHash,
        revokedAt: IsNull(),
      },
    });

    if (!entity) {
      return null;
    }

    if (entity.revokedAt) {
      return null;
    }

    if (entity.expiresAt && entity.expiresAt.getTime() <= Date.now()) {
      return null;
    }

    const user = await this.userRepository.findOne({ where: { id: entity.userId } });

    if (!user) {
      return null;
    }

    const updateResult = await this.personalAccessTokenRepository.update(
      {
        id: entity.id,
        revokedAt: IsNull(),
      },
      { lastUsedAt: new Date() },
    );

    if (!updateResult.affected) {
      return null;
    }

    return {
      userId: user.id,
      email: user.email,
    };
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

  private normalizeExpiresAt(
    expiresAt?: Date | string | null,
  ): Date | null {
    if (!expiresAt) {
      return null;
    }

    return expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  }
}
