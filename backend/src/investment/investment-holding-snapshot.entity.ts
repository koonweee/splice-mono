import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { AccountEntity } from '../account/account.entity';
import { OwnedEntity } from '../common/owned.entity';
import type {
  InvestmentHoldingSnapshot,
  InvestmentHoldingProvider,
  ProviderInvestmentHolding,
} from '../types/Investment';
import { InvestmentSecurityEntity } from './investment-security.entity';

@Entity()
@Unique(['accountId', 'snapshotDate', 'securityId'])
export class InvestmentHoldingSnapshotEntity extends OwnedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  accountId: string;

  @ManyToOne(() => AccountEntity, { nullable: false })
  @JoinColumn({ name: 'accountId' })
  account: AccountEntity;

  @Column({ type: 'uuid' })
  securityId: string;

  @ManyToOne(() => InvestmentSecurityEntity, { nullable: false, eager: true })
  @JoinColumn({ name: 'securityId' })
  security: InvestmentSecurityEntity;

  @Column({ type: 'varchar' })
  provider: InvestmentHoldingProvider;

  @Column({ type: 'date' })
  snapshotDate: string;

  @Column({ type: 'numeric', precision: 30, scale: 12, nullable: true })
  quantity: string | null;

  @Column({ type: 'numeric', precision: 30, scale: 12, nullable: true })
  costBasis: string | null;

  @Column({ type: 'numeric', precision: 30, scale: 12, nullable: true })
  institutionPrice: string | null;

  @Column({ type: 'date', nullable: true })
  institutionPriceAsOf: string | null;

  @Column({ type: 'varchar', nullable: true })
  institutionPriceDatetime: string | null;

  @Column({ type: 'numeric', precision: 30, scale: 12, nullable: true })
  institutionValue: string | null;

  @Column({ type: 'varchar', nullable: true })
  isoCurrencyCode: string | null;

  @Column({ type: 'varchar', nullable: true })
  unofficialCurrencyCode: string | null;

  @Column({ type: 'varchar', nullable: true })
  accountCurrency: string | null;

  @Column({ type: 'numeric', precision: 30, scale: 12, nullable: true })
  exchangeRateToAccountCurrency: string | null;

  @Column({ type: 'numeric', precision: 30, scale: 12, nullable: true })
  accountValue: string | null;

  @Column({ type: 'numeric', precision: 30, scale: 12, nullable: true })
  vestedQuantity: string | null;

  @Column({ type: 'numeric', precision: 30, scale: 12, nullable: true })
  vestedValue: string | null;

  static fromProvider(
    providerHolding: ProviderInvestmentHolding,
    userId: string,
    accountId: string,
    securityId: string,
    snapshotDate: string,
    provider: InvestmentHoldingProvider = 'plaid',
  ): InvestmentHoldingSnapshotEntity {
    const entity = new InvestmentHoldingSnapshotEntity();
    entity.userId = userId;
    entity.accountId = accountId;
    entity.securityId = securityId;
    entity.provider = provider;
    entity.snapshotDate = snapshotDate;
    entity.accountCurrency = null;
    entity.exchangeRateToAccountCurrency = null;
    entity.accountValue = null;
    entity.applyProviderHolding(providerHolding);
    return entity;
  }

  applyProviderHolding(providerHolding: ProviderInvestmentHolding): void {
    this.quantity = providerHolding.quantity;
    this.costBasis = providerHolding.costBasis;
    this.institutionPrice = providerHolding.institutionPrice;
    this.institutionPriceAsOf = providerHolding.institutionPriceAsOf;
    this.institutionPriceDatetime = providerHolding.institutionPriceDatetime;
    this.institutionValue = providerHolding.institutionValue;
    this.isoCurrencyCode = providerHolding.isoCurrencyCode;
    this.unofficialCurrencyCode = providerHolding.unofficialCurrencyCode;
    this.vestedQuantity = providerHolding.vestedQuantity;
    this.vestedValue = providerHolding.vestedValue;
  }

  toObject(): InvestmentHoldingSnapshot {
    return {
      id: this.id,
      userId: this.userId,
      accountId: this.accountId,
      securityId: this.securityId,
      provider: this.provider,
      snapshotDate: this.snapshotDate,
      quantity: this.quantity,
      costBasis: this.costBasis,
      institutionPrice: this.institutionPrice,
      institutionPriceAsOf: this.institutionPriceAsOf,
      institutionPriceDatetime: this.institutionPriceDatetime,
      institutionValue: this.institutionValue,
      isoCurrencyCode: this.isoCurrencyCode,
      unofficialCurrencyCode: this.unofficialCurrencyCode,
      accountCurrency: this.accountCurrency ?? null,
      exchangeRateToAccountCurrency: this.exchangeRateToAccountCurrency ?? null,
      accountValue: this.accountValue ?? null,
      vestedQuantity: this.vestedQuantity,
      vestedValue: this.vestedValue,
      security: this.security.toObject(),
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
