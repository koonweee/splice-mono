import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountEntity } from 'src/account/account.entity';
import { TatumService } from '../common/tatum.service';
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
    UserModule, // For accessing user provider details
  ],
  controllers: [BankLinkController],
  providers: [
    BankLinkService,
    BankLinkScheduledService, // Scheduled tasks for bank link operations
    ProviderRegistry,
    PlaidProvider, // Register Plaid provider
    CryptoProvider, // Register Crypto provider
    TatumService, // Blockchain API client for Crypto provider
  ],
  exports: [
    BankLinkService, // Export for use in other modules
    TatumService, // Export for exchange rate module
  ],
})
export class BankLinkModule {}
