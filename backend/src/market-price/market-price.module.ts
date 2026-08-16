import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InvestmentSecurityEntity } from '../investment/investment-security.entity';
import { MARKET_PRICE_PROVIDER } from './market-price-provider.interface';
import { MarketPriceService } from './market-price.service';
import { YahooFinanceMarketPriceProvider } from './yahoo-finance-market-price.provider';

@Module({
  imports: [TypeOrmModule.forFeature([InvestmentSecurityEntity])],
  providers: [
    YahooFinanceMarketPriceProvider,
    {
      provide: MARKET_PRICE_PROVIDER,
      useExisting: YahooFinanceMarketPriceProvider,
    },
    MarketPriceService,
  ],
  exports: [MarketPriceService],
})
export class MarketPriceModule {}
