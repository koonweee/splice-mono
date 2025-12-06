import { z } from 'zod';
import { OwnedSchema } from './Timestamps';

/** Status of webhook event processing */
export enum WebhookEventStatus {
  /** Created at initiation, waiting for webhook callback */
  PENDING = 'pending',
  /** Webhook received and processed successfully */
  COMPLETED = 'completed',
  /** Webhook processing failed */
  FAILED = 'failed',
  /** Pending webhook expired without callback */
  EXPIRED = 'expired',
}

export const WebhookEventSchema = z
  .object({
    id: z.string(),
    webhookId: z.string(), // Unique identifier from webhook provider (e.g., link_token)
    webhookContent: z.record(z.string(), z.any()).nullable(), // Full webhook payload (null when pending)
    status: z.nativeEnum(WebhookEventStatus),
    providerName: z.string(), // Provider that will send/sent the webhook
    expiresAt: z.date().nullable(), // When this pending webhook expires
    completedAt: z.date().nullable(), // When the webhook was processed
    errorMessage: z.string().nullable(), // Error message if failed
  })
  .merge(OwnedSchema);

export type WebhookEvent = z.infer<typeof WebhookEventSchema>;

/** WebhookEventService arguments */

export const CreateWebhookEventDtoSchema = z.object({
  webhookId: z.string(),
  webhookContent: z.record(z.string(), z.any()).nullable().optional(),
  status: z.nativeEnum(WebhookEventStatus).optional(),
  providerName: z.string(),
  expiresAt: z.date().nullable().optional(),
});

export type CreateWebhookEventDto = z.infer<typeof CreateWebhookEventDtoSchema>;

export const UpdateWebhookEventDtoSchema =
  CreateWebhookEventDtoSchema.partial();

export type UpdateWebhookEventDto = z.infer<typeof UpdateWebhookEventDtoSchema>;
