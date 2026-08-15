import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WebhookEventCleanupScheduledService } from './webhook-event-cleanup.scheduled';
import { WebhookEventCleanupService } from './webhook-event-cleanup.service';
import { WebhookEventEntity } from './webhook-event.entity';
import { WebhookEventService } from './webhook-event.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([WebhookEventEntity]), // Register entity for TypeORM
  ],
  providers: [
    WebhookEventService,
    WebhookEventCleanupService,
    WebhookEventCleanupScheduledService,
  ],
  exports: [WebhookEventService], // Export service for use in other modules (e.g., BankLinkModule)
})
export class WebhookEventModule {}
