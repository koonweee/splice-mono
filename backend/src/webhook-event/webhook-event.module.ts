import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WebhookEventEntity } from './webhook-event.entity';
import { WebhookEventService } from './webhook-event.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([WebhookEventEntity]), // Register entity for TypeORM
  ],
  providers: [WebhookEventService],
  exports: [WebhookEventService], // Export service for use in other modules (e.g., BankLinkModule)
})
export class WebhookEventModule {}
