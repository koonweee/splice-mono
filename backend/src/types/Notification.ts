import { z } from 'zod';
import { registerSchema } from '../common/zod-api-response';
import { OwnedSchema } from './Timestamps';

export const NotificationTypeSchema = registerSchema(
  'NotificationType',
  z.enum(['transactions.new_synced', 'system.test']),
);

export type NotificationType = z.infer<typeof NotificationTypeSchema>;

export const NotificationStatusSchema = registerSchema(
  'NotificationStatus',
  z.enum(['active', 'archived']),
);

export type NotificationStatus = z.infer<typeof NotificationStatusSchema>;

export const NotificationPushDeliveryStatusSchema = registerSchema(
  'NotificationPushDeliveryStatus',
  z.enum(['pending', 'processing', 'sent', 'failed', 'skipped']),
);

export type NotificationPushDeliveryStatus = z.infer<
  typeof NotificationPushDeliveryStatusSchema
>;

export const NewSyncedTransactionsNotificationPayloadSchema = z.object({
  count: z.number().int().positive(),
  transactionIds: z.array(z.string().uuid()).min(1),
  accountIds: z.array(z.string().uuid()).min(1),
  occurredAt: z.string().datetime(),
});

export type NewSyncedTransactionsNotificationPayload = z.infer<
  typeof NewSyncedTransactionsNotificationPayloadSchema
>;

export const TestNotificationPayloadSchema = z.object({
  occurredAt: z.string().datetime(),
});

export type TestNotificationPayload = z.infer<
  typeof TestNotificationPayloadSchema
>;

export const NotificationPayloadSchema = registerSchema(
  'NotificationPayload',
  z.union([
    NewSyncedTransactionsNotificationPayloadSchema,
    TestNotificationPayloadSchema,
  ]),
);

export type NotificationPayload = z.infer<typeof NotificationPayloadSchema>;

export const NotificationSchema = registerSchema(
  'Notification',
  z
    .object({
      id: z.string().uuid(),
      type: NotificationTypeSchema,
      dedupeKey: z.string(),
      payload: NotificationPayloadSchema,
      status: NotificationStatusSchema,
      readAt: z.coerce.date().nullable(),
      archivedAt: z.coerce.date().nullable(),
    })
    .merge(OwnedSchema),
);

export type Notification = z.infer<typeof NotificationSchema>;

export const PushSubscriptionKeysSchema = z.object({
  p256dh: z.string().min(1),
  auth: z.string().min(1),
});

export const RegisterPushSubscriptionDtoSchema = registerSchema(
  'RegisterPushSubscriptionDto',
  z.object({
    endpoint: z.string().url(),
    expirationTime: z.number().nullable().optional(),
    keys: PushSubscriptionKeysSchema,
    userAgent: z.string().nullable().optional(),
  }),
);

export type RegisterPushSubscriptionDto = z.infer<
  typeof RegisterPushSubscriptionDtoSchema
>;

export const PushSubscriptionEndpointDtoSchema = registerSchema(
  'PushSubscriptionEndpointDto',
  z.object({
    endpoint: z.string().url(),
  }),
);

export type PushSubscriptionEndpointDto = z.infer<
  typeof PushSubscriptionEndpointDtoSchema
>;

export const PushConfigResponseSchema = registerSchema(
  'PushConfigResponse',
  z.object({
    configured: z.boolean(),
    vapidPublicKey: z.string().nullable(),
  }),
);

export type PushConfigResponse = z.infer<typeof PushConfigResponseSchema>;

export const PushSubscriptionStatusResponseSchema = registerSchema(
  'PushSubscriptionStatusResponse',
  z.object({
    configured: z.boolean(),
    subscribed: z.boolean(),
  }),
);

export type PushSubscriptionStatusResponse = z.infer<
  typeof PushSubscriptionStatusResponseSchema
>;

export const PushSubscriptionResponseSchema = registerSchema(
  'PushSubscriptionResponse',
  z.object({
    id: z.string().uuid(),
    endpoint: z.string().url(),
    revokedAt: z.coerce.date().nullable(),
  }),
);

export type PushSubscriptionResponse = z.infer<
  typeof PushSubscriptionResponseSchema
>;

export const TestNotificationResponseSchema = registerSchema(
  'TestNotificationResponse',
  z.object({
    notification: NotificationSchema,
    deliveryCount: z.number().int().min(0),
    pushConfigured: z.boolean(),
  }),
);

export type TestNotificationResponse = z.infer<
  typeof TestNotificationResponseSchema
>;
