import { BrowserSessionModule } from '../auth/browser-session.module';
import { TransactionQueryService } from '../transaction/transaction-query.service';
import { TransactionEntity } from '../transaction/transaction.entity';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserModule } from '../user/user.module';
import { NotificationPushDeliveryEntity } from './notification-push-delivery.entity';
import { NotificationPushProcessor } from './notification-push.processor';
import { NotificationController } from './notification.controller';
import { NotificationEntity } from './notification.entity';
import { NotificationListener } from './notification.listener';
import { NotificationService } from './notification.service';
import { PushSubscriptionEntity } from './push-subscription.entity';
import { WebPushAdapter } from './web-push.adapter';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      NotificationEntity,
      TransactionEntity,
      PushSubscriptionEntity,
      NotificationPushDeliveryEntity,
    ]),
    UserModule,
    BrowserSessionModule,
  ],
  controllers: [NotificationController],
  providers: [
    NotificationService,
    TransactionQueryService,
    NotificationListener,
    NotificationPushProcessor,
    WebPushAdapter,
  ],
  exports: [NotificationService],
})
export class NotificationModule {}
