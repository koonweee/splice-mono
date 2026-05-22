import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AccountEntity } from '../account/account.entity';
import { BalanceColumns } from '../common/balance.columns';
import { OwnedEntity } from '../common/owned.entity';
import type {
  AccountActivity,
  AccountActivityKind,
  AccountActivityProvider,
} from '../types/AccountActivity';
import type { SerializedMoneyWithSign } from '../types/MoneyWithSign';

@Entity()
@Index('IDX_account_activity_user_date_id', ['userId', 'activityDate', 'id'])
@Index('IDX_account_activity_account_date', ['accountId', 'activityDate'])
@Index('IDX_account_activity_provider_identity', [
  'userId',
  'accountId',
  'provider',
  'activityKind',
  'externalActivityId',
])
@Index(
  'UQ_account_activity_provider_external',
  ['userId', 'accountId', 'provider', 'activityKind', 'externalActivityId'],
  {
    unique: true,
    where: '"externalActivityId" IS NOT NULL',
  },
)
export class AccountActivityEntity extends OwnedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  accountId: string;

  @ManyToOne(() => AccountEntity, { nullable: false })
  @JoinColumn({ name: 'accountId' })
  account: AccountEntity;

  @Column({ type: 'varchar' })
  provider: AccountActivityProvider;

  @Column({ type: 'varchar', nullable: true })
  externalActivityId: string | null;

  @Column({ type: 'varchar' })
  activityKind: AccountActivityKind;

  @Column({ type: 'date' })
  activityDate: string;

  @Column({ type: 'date' })
  providerDate: string;

  @Column({ type: 'timestamptz', nullable: true })
  providerDatetime: string | null;

  @Column(() => BalanceColumns)
  amount: BalanceColumns;

  static create(input: {
    userId: string;
    accountId: string;
    provider: AccountActivityProvider;
    externalActivityId?: string | null;
    activityKind: AccountActivityKind;
    activityDate: string;
    providerDate: string;
    providerDatetime?: string | null;
    amount: SerializedMoneyWithSign;
  }): AccountActivityEntity {
    const entity = new AccountActivityEntity();
    entity.userId = input.userId;
    entity.accountId = input.accountId;
    entity.provider = input.provider;
    entity.externalActivityId = input.externalActivityId ?? null;
    entity.activityKind = input.activityKind;
    entity.activityDate = input.activityDate;
    entity.providerDate = input.providerDate;
    entity.providerDatetime = input.providerDatetime ?? null;
    entity.amount = BalanceColumns.fromMoneyWithSign(input.amount);
    return entity;
  }

  apply(input: {
    accountId: string;
    provider: AccountActivityProvider;
    externalActivityId?: string | null;
    activityKind: AccountActivityKind;
    activityDate: string;
    providerDate: string;
    providerDatetime?: string | null;
    amount: SerializedMoneyWithSign;
  }): void {
    this.accountId = input.accountId;
    this.provider = input.provider;
    this.externalActivityId = input.externalActivityId ?? null;
    this.activityKind = input.activityKind;
    this.activityDate = input.activityDate;
    this.providerDate = input.providerDate;
    this.providerDatetime = input.providerDatetime ?? null;
    this.amount = BalanceColumns.fromMoneyWithSign(input.amount);
  }

  toObject(): AccountActivity {
    return {
      id: this.id,
      userId: this.userId,
      accountId: this.accountId,
      provider: this.provider,
      externalActivityId: this.externalActivityId,
      activityKind: this.activityKind,
      activityDate: this.activityDate,
      providerDate: this.providerDate,
      providerDatetime: this.providerDatetime,
      amount: this.amount.toMoneyWithSign(),
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
