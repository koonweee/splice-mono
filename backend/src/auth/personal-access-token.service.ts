import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as crypto from 'crypto';
import { IsNull, Repository } from 'typeorm';
import { JwtUser } from './decorators/current-user.decorator';
import {
  PersonalAccessTokenEntity,
  type PersonalAccessTokenView,
} from './personal-access-token.entity';
import { UserEntity } from '../user/user.entity';

export interface CreatePersonalAccessTokenDto {
  name: string;
  expiresAt?: Date | string | null;
}

export interface PersonalAccessTokenCreated extends PersonalAccessTokenView {
  token: string;
}

const TOKEN_PREFIX = 'splice_pat';

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
    const token = this.generateRawToken();
    const tokenHash = this.hashToken(token);
    const expiresAt = this.normalizeExpiresAt(dto.expiresAt);

    const entity = new PersonalAccessTokenEntity();
    entity.userId = user.userId;
    entity.name = dto.name;
    entity.tokenHash = tokenHash;
    entity.prefix = TOKEN_PREFIX;
    entity.lastUsedAt = null;
    entity.expiresAt = expiresAt;
    entity.revokedAt = null;

    const savedEntity = await this.personalAccessTokenRepository.save(entity);

    return {
      ...savedEntity.toObject(),
      token,
    };
  }

  async listTokens(userId: string): Promise<PersonalAccessTokenView[]> {
    const entities = await this.personalAccessTokenRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });

    return entities.map((entity) => entity.toObject());
  }

  async revokeToken(userId: string, tokenId: string): Promise<void> {
    await this.personalAccessTokenRepository.update(
      { id: tokenId, userId },
      { revokedAt: new Date() },
    );
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

    const user = await this.userRepository.findOne({
      where: { id: entity.userId },
    });

    if (!user) {
      return null;
    }

    entity.lastUsedAt = new Date();
    await this.personalAccessTokenRepository.save(entity);

    return {
      userId: user.id,
      email: user.email,
    };
  }

  private generateRawToken(): string {
    return `${TOKEN_PREFIX}_${crypto.randomBytes(32).toString('hex')}`;
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
