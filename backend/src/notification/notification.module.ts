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
      PushSubscriptionEntity,
      NotificationPushDeliveryEntity,
    ]),
    UserModule,
  ],
  controllers: [NotificationController],
  providers: [
    NotificationService,
    NotificationListener,
    NotificationPushProcessor,
    WebPushAdapter,
  ],
  exports: [NotificationService],
})
export class NotificationModule {}
