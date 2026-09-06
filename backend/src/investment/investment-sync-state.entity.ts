import {
  Check,
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { BankLinkEntity } from '../bank-link/bank-link.entity';
import { OwnedEntity } from '../common/owned.entity';

export type InvestmentSyncKind = 'holdings' | 'transactions';
export type InvestmentSyncToken = {
  bankLinkId: string;
  kind: InvestmentSyncKind;
  generation: string;
};

/** Allocated before remote I/O; applied under the same bank-link lifecycle lock. */
@Entity()
@Unique('UQ_investment_sync_link_kind', ['bankLinkId', 'kind'])
@Check('CHK_investment_sync_kind', `kind IN ('holdings', 'transactions')`)
export class InvestmentSyncStateEntity extends OwnedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  bankLinkId: string;

  @ManyToOne(() => BankLinkEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'bankLinkId' })
  bankLink: BankLinkEntity;

  @Column({ type: 'varchar' })
  kind: InvestmentSyncKind;

  @Column({ type: 'bigint', default: 0 })
  requestedGeneration: string;

  @Column({ type: 'bigint', default: 0 })
  completedGeneration: string;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date | null;
}
