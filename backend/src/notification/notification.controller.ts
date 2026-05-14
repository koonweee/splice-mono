import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  type JwtUser,
} from '../auth/decorators/current-user.decorator';
import { ZodApiBody, ZodApiResponse } from '../common/zod-api-response';
import type {
  PushConfigResponse,
  PushSubscriptionEndpointDto,
  PushSubscriptionResponse,
  PushSubscriptionStatusResponse,
  RegisterPushSubscriptionDto,
  TestNotificationResponse,
} from '../types/Notification';
import {
  PushConfigResponseSchema,
  PushSubscriptionEndpointDtoSchema,
  PushSubscriptionResponseSchema,
  PushSubscriptionStatusResponseSchema,
  RegisterPushSubscriptionDtoSchema,
  TestNotificationResponseSchema,
} from '../types/Notification';
import { ZodValidationPipe } from '../zod-validation/zod-validation.pipe';
import { NotificationService } from './notification.service';

@ApiTags('notification')
@Controller('notification')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get('push/config')
  @ApiOperation({ description: 'Get browser push notification configuration' })
  @ZodApiResponse({
    status: 200,
    description: 'Returns push configuration',
    schema: PushConfigResponseSchema,
  })
  getPushConfig(): PushConfigResponse {
    return this.notificationService.getPushConfig();
  }

  @Get('push/subscription/current')
  @ApiOperation({
    description: 'Get current browser push subscription status by endpoint',
  })
  @ZodApiResponse({
    status: 200,
    description: 'Returns current push subscription status',
    schema: PushSubscriptionStatusResponseSchema,
  })
  getCurrentSubscriptionStatus(
    @CurrentUser() user: JwtUser,
    @Query('endpoint') endpoint?: string,
  ): Promise<PushSubscriptionStatusResponse> {
    return this.notificationService.getCurrentSubscriptionStatus(
      user.userId,
      endpoint,
    );
  }

  @Post('push/subscriptions')
  @ApiOperation({
    description: 'Register or refresh current push subscription',
  })
  @ZodApiBody({ schema: RegisterPushSubscriptionDtoSchema })
  @ZodApiResponse({
    status: 201,
    description: 'Push subscription registered',
    schema: PushSubscriptionResponseSchema,
  })
  registerPushSubscription(
    @CurrentUser() user: JwtUser,
    @Body(new ZodValidationPipe(RegisterPushSubscriptionDtoSchema))
    dto: RegisterPushSubscriptionDto,
  ): Promise<PushSubscriptionResponse> {
    return this.notificationService.registerPushSubscription(user.userId, dto);
  }

  @Post('test')
  @ApiOperation({
    description:
      'Create a test notification and enqueue push deliveries for active subscriptions',
  })
  @ZodApiResponse({
    status: 201,
    description: 'Test notification queued',
    schema: TestNotificationResponseSchema,
  })
  sendTestNotification(
    @CurrentUser() user: JwtUser,
  ): Promise<TestNotificationResponse> {
    return this.notificationService.createTestNotification(user.userId);
  }

  @Delete('push/subscriptions/current')
  @HttpCode(204)
  @ApiOperation({ description: 'Revoke current browser push subscription' })
  @ZodApiBody({ schema: PushSubscriptionEndpointDtoSchema })
  @ApiResponse({ status: 204, description: 'Current subscription revoked' })
  async revokeCurrentPushSubscription(
    @CurrentUser() user: JwtUser,
    @Body(new ZodValidationPipe(PushSubscriptionEndpointDtoSchema))
    dto: PushSubscriptionEndpointDto,
  ): Promise<void> {
    await this.notificationService.revokeCurrentPushSubscription(
      user.userId,
      dto.endpoint,
    );
  }

  @Delete('push/subscriptions')
  @HttpCode(204)
  @ApiOperation({
    description: 'Revoke all push subscriptions for current user',
  })
  @ApiResponse({ status: 204, description: 'All subscriptions revoked' })
  async revokeAllPushSubscriptions(
    @CurrentUser() user: JwtUser,
  ): Promise<void> {
    await this.notificationService.revokeAllPushSubscriptions(user.userId);
  }
}
