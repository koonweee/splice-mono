import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { OwnedEntity } from '../common/owned.entity';
import { BankLink, CreateBankLinkDto } from '../types/BankLink';

@Entity()
export class BankLinkEntity extends OwnedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  providerName: string;

  @Column({ type: 'jsonb' })
  authentication: Record<string, any>;

  @Column({ type: 'simple-array' })
  accountIds: string[];

  @Column({ type: 'varchar', nullable: true })
  institutionId: string | null;

  @Column({ type: 'varchar', nullable: true })
  institutionName: string | null;

  /**
   * Create entity from DTO
   */
  static fromDto(dto: CreateBankLinkDto, userId: string): BankLinkEntity {
    const entity = new BankLinkEntity();
    entity.userId = userId;
    entity.providerName = dto.providerName;
    entity.authentication = dto.authentication;
    entity.accountIds = dto.accountIds;
    entity.institutionId = dto.institutionId ?? null;
    entity.institutionName = dto.institutionName ?? null;
    return entity;
  }

  /**
   * Convert entity to domain object
   */
  toObject(): BankLink {
    return {
      id: this.id,
      userId: this.userId,
      providerName: this.providerName,
      authentication: this.authentication,
      accountIds: this.accountIds,
      institutionId: this.institutionId,
      institutionName: this.institutionName,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
