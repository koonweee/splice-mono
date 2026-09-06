import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AccountActivityEntity } from '../account-activity/account-activity.entity';
import { OwnedEntity } from '../common/owned.entity';
import type {
  InvestmentTransaction,
  ProviderInvestmentTransaction,
} from '../types/Investment';
import { InvestmentSecurityEntity } from './investment-security.entity';

@Entity()
@Index('UQ_investment_transaction_activity', ['activityId'], { unique: true })
export class InvestmentTransactionEntity extends OwnedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  activityId: string;

  @OneToOne(() => AccountActivityEntity, { nullable: false, eager: true })
  @JoinColumn({ name: 'activityId' })
  activity: AccountActivityEntity;

  @Column({ type: 'uuid', nullable: true })
  securityId: string | null;

  @ManyToOne(() => InvestmentSecurityEntity, { nullable: true, eager: true })
  @JoinColumn({ name: 'securityId' })
  security: InvestmentSecurityEntity | null;

  @Column({ type: 'varchar', nullable: true })
  externalSecurityId: string | null;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'numeric', precision: 30, scale: 12 })
  quantity: string;

  @Column({ type: 'numeric', precision: 30, scale: 12 })
  price: string;

  @Column({ type: 'numeric', precision: 30, scale: 12, nullable: true })
  fees: string | null;

  @Column({ type: 'varchar' })
  investmentType: string;

  @Column({ type: 'varchar' })
  investmentSubtype: string;

  @Column({ type: 'varchar', nullable: true })
  cancelExternalActivityId: string | null;

  @Column({ type: 'jsonb', nullable: true, select: false })
  providerPayload: Record<string, unknown> | null;

  static fromProvider(
    providerTransaction: ProviderInvestmentTransaction,
    userId: string,
    activityId: string,
    securityId: string | null,
  ): InvestmentTransactionEntity {
    const entity = new InvestmentTransactionEntity();
    entity.userId = userId;
    entity.activityId = activityId;
    entity.securityId = securityId;
    entity.applyProviderTransaction(providerTransaction, securityId);
    return entity;
  }

  applyProviderTransaction(
    providerTransaction: ProviderInvestmentTransaction,
    securityId: string | null,
  ): void {
    this.securityId = securityId;
    this.externalSecurityId = providerTransaction.externalSecurityId;
    this.name = providerTransaction.name;
    this.quantity = providerTransaction.quantity;
    this.price = providerTransaction.price;
    this.fees = providerTransaction.fees;
    this.investmentType = providerTransaction.investmentType;
    this.investmentSubtype = providerTransaction.investmentSubtype;
    this.cancelExternalActivityId =
      providerTransaction.cancelExternalActivityId;
    this.providerPayload = providerTransaction.providerPayload;
  }

  toObject(): InvestmentTransaction {
    return {
      id: this.id,
      userId: this.userId,
      activityId: this.activityId,
      securityId: this.securityId,
      externalSecurityId: this.externalSecurityId,
      name: this.name,
      quantity: this.quantity,
      price: this.price,
      fees: this.fees,
      investmentType: this.investmentType,
      investmentSubtype: this.investmentSubtype,
      cancelExternalActivityId: this.cancelExternalActivityId,
      providerPayload: this.providerPayload ?? null,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
