import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Req,
  HttpCode,
  Post,
  Query,
} from '@nestjs/common';
import type { Request } from 'express';
import { REFRESH_TOKEN_COOKIE } from '../auth/auth-cookies';
import { SessionJwtOnly } from '../auth/decorators/session-jwt-only.decorator';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  type JwtUser,
} from '../auth/decorators/current-user.decorator';
import { ZodApiBody, ZodApiResponse } from '../common/zod-api-response';
import type {
  NotificationInboxPage,
  NotificationInboxQuery,
  NotificationSummary,
  PushConfigResponse,
  PushEnrollmentEligibility,
  PushSubscriptionEndpointDto,
  PushSubscriptionResponse,
  PushSubscriptionStatusResponse,
  RegisterPushSubscriptionDto,
  TestNotificationResponse,
} from '../types/Notification';
import {
  NotificationInboxPageSchema,
  NotificationInboxQuerySchema,
  NotificationSummarySchema,
  PushConfigResponseSchema,
  PushEnrollmentEligibilitySchema,
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

  @Get('push/enrollment/:enrollmentId')
  @SessionJwtOnly()
  @Header('Cache-Control', 'private, no-store')
  @ZodApiResponse({
    status: 200,
    description:
      'Whether this browser session may display this push enrollment',
    schema: PushEnrollmentEligibilitySchema,
  })
  getEnrollmentEligibility(
    @CurrentUser() user: JwtUser,
    @Param('enrollmentId', ParseUUIDPipe) enrollmentId: string,
    @Req() request: Request,
  ): Promise<PushEnrollmentEligibility> {
    return this.notificationService.getEnrollmentEligibility(
      user.userId,
      enrollmentId,
      request.cookies?.[REFRESH_TOKEN_COOKIE] as string | undefined,
    );
  }

  @Get('summary')
  @Header('Cache-Control', 'private, no-store')
  @ZodApiResponse({
    status: 200,
    description: 'Independent current transaction and inbox counts',
    schema: NotificationSummarySchema,
  })
  getSummary(@CurrentUser() user: JwtUser): Promise<NotificationSummary> {
    return this.notificationService.getSummary(user.userId);
  }

  @Get('inbox')
  @Header('Cache-Control', 'private, no-store')
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  @ZodApiResponse({
    status: 200,
    description: 'Current user notification inbox',
    schema: NotificationInboxPageSchema,
  })
  getInbox(
    @CurrentUser() user: JwtUser,
    @Query(new ZodValidationPipe(NotificationInboxQuerySchema))
    query: NotificationInboxQuery,
  ): Promise<NotificationInboxPage> {
    return this.notificationService.getInbox(user.userId, query);
  }

  @Patch(':id/read')
  @HttpCode(204)
  @Header('Cache-Control', 'private, no-store')
  @ApiResponse({ status: 204, description: 'Notification marked read' })
  markRead(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.notificationService.markRead(user.userId, id);
  }

  @Patch('archive-all')
  @HttpCode(204)
  @Header('Cache-Control', 'private, no-store')
  @ApiResponse({ status: 204, description: 'All notifications dismissed' })
  archiveAll(@CurrentUser() user: JwtUser): Promise<void> {
    return this.notificationService.archiveAll(user.userId);
  }

  @Patch(':id/archive')
  @HttpCode(204)
  @Header('Cache-Control', 'private, no-store')
  @ApiResponse({ status: 204, description: 'Notification dismissed' })
  archive(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.notificationService.archive(user.userId, id);
  }

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
  @SessionJwtOnly()
  @Header('Cache-Control', 'private, no-store')
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
    @Req() request?: Request,
  ): Promise<PushSubscriptionStatusResponse> {
    return this.notificationService.getCurrentSubscriptionStatus(
      user.userId,
      endpoint,
      request?.cookies?.[REFRESH_TOKEN_COOKIE] as string | undefined,
    );
  }

  @Post('push/subscriptions')
  @SessionJwtOnly()
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
    @Req() request?: Request,
  ): Promise<PushSubscriptionResponse> {
    return this.notificationService.registerPushSubscription(
      user.userId,
      dto,
      request?.cookies?.[REFRESH_TOKEN_COOKIE] as string | undefined,
    );
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
