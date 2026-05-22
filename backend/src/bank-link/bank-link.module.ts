import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountEntity } from 'src/account/account.entity';
import { CryptoModule } from '../crypto/crypto.module';
import { InvestmentModule } from '../investment/investment.module';
import { TransactionModule } from '../transaction/transaction.module';
import { UserModule } from '../user/user.module';
import { WebhookEventModule } from '../webhook-event/webhook-event.module';
import { BankLinkController } from './bank-link.controller';
import { BankLinkEntity } from './bank-link.entity';
import { BankLinkScheduledService } from './bank-link.scheduled';
import { BankLinkService } from './bank-link.service';
import { CryptoProvider } from './providers/crypto/crypto.provider';
import { PlaidProvider } from './providers/plaid/plaid.provider';
import { ProviderRegistry } from './providers/provider.registry';

/**
 * Module for bank account linking functionality
 * Provides provider-agnostic interface for linking accounts to external services
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([BankLinkEntity, AccountEntity]),
    WebhookEventModule,
    InvestmentModule,
    UserModule, // For accessing user provider details
    TransactionModule, // For transaction sync processing
    CryptoModule.forRoot({
      alchemyApiKey: process.env.ALCHEMY_API_KEY ?? '',
    }), // Crypto balance service for wallet linking
  ],
  controllers: [BankLinkController],
  providers: [
    BankLinkService,
    BankLinkScheduledService, // Scheduled tasks for bank link operations
    ProviderRegistry,
    PlaidProvider, // Register Plaid provider
    CryptoProvider, // Register Crypto provider
  ],
  exports: [
    BankLinkService, // Export for use in other modules
  ],
})
export class BankLinkModule {}
