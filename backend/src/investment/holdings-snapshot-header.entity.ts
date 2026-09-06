import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { AccountEntity } from '../account/account.entity';
import { OwnedEntity } from '../common/owned.entity';
import type { InvestmentHoldingProvider } from '../types/Investment';
import type { MoneySign } from '../types/MoneyWithSign';

/** A completed header with no positions is a factual empty portfolio. */
@Entity()
@Unique('UQ_holdings_header_account_provider_date', [
  'accountId',
  'provider',
  'snapshotDate',
])
@Index('IDX_holdings_header_user_account_date', [
  'userId',
  'accountId',
  'snapshotDate',
])
@Check('CHK_holdings_header_provider', `provider IN ('plaid', 'manual')`)
@Check(
  'CHK_holdings_header_value',
  `"accountValueAmount" IS NULL OR "accountValueAmount" >= 0`,
)
export class HoldingsSnapshotHeaderEntity extends OwnedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  accountId: string;

  @ManyToOne(() => AccountEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'accountId' })
  account: AccountEntity;

  @Column({ type: 'varchar' })
  provider: InvestmentHoldingProvider;

  @Column({ type: 'date' })
  snapshotDate: string;

  @Column({ type: 'integer', default: 1 })
  revision: number;

  @Column({ type: 'timestamptz' })
  completedAt: Date;

  @Column({ type: 'varchar', nullable: true })
  accountCurrency: string | null;

  @Column({ type: 'numeric', precision: 78, scale: 0, nullable: true })
  accountValueAmount: string | null;

  @Column({ type: 'varchar', nullable: true })
  accountValueSign: MoneySign | null;
}
