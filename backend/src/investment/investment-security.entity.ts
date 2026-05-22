import { Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { OwnedEntity } from '../common/owned.entity';
import type {
  InvestmentProvider,
  InvestmentSecurity,
  ProviderInvestmentSecurity,
} from '../types/Investment';

@Entity()
@Unique(['userId', 'provider', 'externalSecurityId'])
export class InvestmentSecurityEntity extends OwnedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  provider: InvestmentProvider;

  @Column({ type: 'varchar' })
  externalSecurityId: string;

  @Column({ type: 'varchar', nullable: true })
  institutionId: string | null;

  @Column({ type: 'varchar', nullable: true })
  institutionSecurityId: string | null;

  @Column({ type: 'varchar', nullable: true })
  name: string | null;

  @Column({ type: 'varchar', nullable: true })
  tickerSymbol: string | null;

  @Column({ type: 'varchar', nullable: true })
  isin: string | null;

  @Column({ type: 'varchar', nullable: true })
  cusip: string | null;

  @Column({ type: 'varchar', nullable: true })
  sedol: string | null;

  @Column({ type: 'varchar', nullable: true })
  type: string | null;

  @Column({ type: 'varchar', nullable: true })
  subtype: string | null;

  @Column({ type: 'boolean', nullable: true })
  isCashEquivalent: boolean | null;

  @Column({ type: 'numeric', precision: 30, scale: 12, nullable: true })
  closePrice: string | null;

  @Column({ type: 'date', nullable: true })
  closePriceAsOf: string | null;

  @Column({ type: 'varchar', nullable: true })
  updateDatetime: string | null;

  @Column({ type: 'varchar', nullable: true })
  isoCurrencyCode: string | null;

  @Column({ type: 'varchar', nullable: true })
  unofficialCurrencyCode: string | null;

  @Column({ type: 'varchar', nullable: true })
  marketIdentifierCode: string | null;

  @Column({ type: 'varchar', nullable: true })
  sector: string | null;

  @Column({ type: 'varchar', nullable: true })
  industry: string | null;

  static fromProvider(
    providerSecurity: ProviderInvestmentSecurity,
    userId: string,
    provider: InvestmentProvider = 'plaid',
  ): InvestmentSecurityEntity {
    const entity = new InvestmentSecurityEntity();
    entity.userId = userId;
    entity.provider = provider;
    entity.applyProviderSecurity(providerSecurity);
    return entity;
  }

  applyProviderSecurity(providerSecurity: ProviderInvestmentSecurity): void {
    this.externalSecurityId = providerSecurity.externalSecurityId;
    this.institutionId = providerSecurity.institutionId;
    this.institutionSecurityId = providerSecurity.institutionSecurityId;
    this.name = providerSecurity.name;
    this.tickerSymbol = providerSecurity.tickerSymbol;
    this.isin = providerSecurity.isin;
    this.cusip = providerSecurity.cusip;
    this.sedol = providerSecurity.sedol;
    this.type = providerSecurity.type;
    this.subtype = providerSecurity.subtype;
    this.isCashEquivalent = providerSecurity.isCashEquivalent;
    this.closePrice = providerSecurity.closePrice;
    this.closePriceAsOf = providerSecurity.closePriceAsOf;
    this.updateDatetime = providerSecurity.updateDatetime;
    this.isoCurrencyCode = providerSecurity.isoCurrencyCode;
    this.unofficialCurrencyCode = providerSecurity.unofficialCurrencyCode;
    this.marketIdentifierCode = providerSecurity.marketIdentifierCode;
    this.sector = providerSecurity.sector;
    this.industry = providerSecurity.industry;
  }

  toObject(): InvestmentSecurity {
    return {
      id: this.id,
      userId: this.userId,
      provider: this.provider,
      externalSecurityId: this.externalSecurityId,
      institutionId: this.institutionId,
      institutionSecurityId: this.institutionSecurityId,
      name: this.name,
      tickerSymbol: this.tickerSymbol,
      isin: this.isin,
      cusip: this.cusip,
      sedol: this.sedol,
      type: this.type,
      subtype: this.subtype,
      isCashEquivalent: this.isCashEquivalent,
      closePrice: this.closePrice,
      closePriceAsOf: this.closePriceAsOf,
      updateDatetime: this.updateDatetime,
      isoCurrencyCode: this.isoCurrencyCode,
      unofficialCurrencyCode: this.unofficialCurrencyCode,
      marketIdentifierCode: this.marketIdentifierCode,
      sector: this.sector,
      industry: this.industry,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
