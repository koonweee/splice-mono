import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { OwnedEntity } from '../common/owned.entity';
import type {
  BankLink,
  BankLinkStatus,
  CreateBankLinkDto,
} from '../types/BankLink';

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

  @Column({ type: 'varchar', default: 'OK' })
  status: BankLinkStatus;

  @Column({ type: 'timestamp with time zone', default: () => 'NOW()' })
  statusDate: Date;

  @Column({ type: 'jsonb', nullable: true })
  statusBody: Record<string, any> | null;

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
      status: this.status,
      statusDate: this.statusDate,
      statusBody: this.statusBody,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
