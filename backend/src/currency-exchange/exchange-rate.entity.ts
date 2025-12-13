import { Column, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { TimestampedEntity } from '../common/base.entity';
import type {
  CreateExchangeRateDto,
  ExchangeRate,
} from '../types/ExchangeRate';

@Entity()
@Unique(['baseCurrency', 'targetCurrency', 'rateDate'])
@Index(['baseCurrency', 'targetCurrency'])
@Index(['rateDate'])
export class ExchangeRateEntity extends TimestampedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** The source currency (ISO 4217 code, e.g., 'EUR') */
  @Column({ type: 'varchar' })
  baseCurrency: string;

  /** The target currency (ISO 4217 code, e.g., 'USD') */
  @Column({ type: 'varchar' })
  targetCurrency: string;

  /** Exchange rate: 1 baseCurrency = rate targetCurrency */
  @Column({ type: 'decimal', precision: 20, scale: 10 })
  rate: number;

  /** Date for which this rate applies (YYYY-MM-DD) */
  @Column({ type: 'date' })
  rateDate: string;

  /**
   * Create entity from DTO
   */
  static fromDto(dto: CreateExchangeRateDto): ExchangeRateEntity {
    const entity = new ExchangeRateEntity();
    entity.baseCurrency = dto.baseCurrency;
    entity.targetCurrency = dto.targetCurrency;
    entity.rate = dto.rate;
    entity.rateDate = dto.rateDate;
    return entity;
  }

  /**
   * Convert entity to domain object
   */
  toObject(): ExchangeRate {
    return {
      id: this.id,
      baseCurrency: this.baseCurrency,
      targetCurrency: this.targetCurrency,
      rate: typeof this.rate === 'string' ? parseFloat(this.rate) : this.rate,
      rateDate: this.rateDate,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
