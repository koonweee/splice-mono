import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { OwnedEntity } from '../common/owned.entity';
import type {
  BankLinkStatus,
  CreateBankLinkDto,
  SanitizedBankLink,
} from '../types/BankLink';

@Entity()
@Index('IDX_bank_link_user_active', ['userId', 'archivedAt'])
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

  @Column({ type: 'varchar', default: 'OK' })
  status: BankLinkStatus;

  @Column({ type: 'timestamp with time zone', default: () => 'NOW()' })
  statusDate: Date;

  @Column({ type: 'jsonb', nullable: true })
  statusBody: Record<string, any> | null;

  @Column({ type: 'timestamptz', nullable: true })
  archivedAt: Date | null;

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
    entity.status = 'OK';
    entity.statusDate = new Date();
    entity.statusBody = null;
    entity.archivedAt = null;
    return entity;
  }

  /**
   * Convert entity to domain object (sanitized - excludes authentication)
   * Internal code that needs authentication should access entity.authentication directly
   */
  toObject(): SanitizedBankLink {
    return {
      id: this.id,
      userId: this.userId,
      providerName: this.providerName,
      accountIds: this.accountIds,
      institutionId: this.institutionId,
      institutionName: this.institutionName,
      status: this.status,
      statusDate: this.statusDate,
      statusBody: this.statusBody,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
