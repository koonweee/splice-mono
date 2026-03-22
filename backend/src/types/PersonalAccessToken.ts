import { z } from 'zod';
import { registerSchema } from '../common/zod-api-response';
import { TimestampsSchema } from './Timestamps';

export const CreatePersonalAccessTokenDtoSchema = registerSchema(
  'CreatePersonalAccessTokenDto',
  z.object({
    name: z.string().min(1).max(100),
    expiresAt: z.string().datetime().optional(),
  }),
);

export type CreatePersonalAccessTokenDto = z.infer<
  typeof CreatePersonalAccessTokenDtoSchema
>;

export const PersonalAccessTokenSchema = registerSchema(
  'PersonalAccessToken',
  z.object({
    id: z.string().uuid(),
    name: z.string().min(1).max(100),
    tokenPreview: z.string().min(1),
    lastUsedAt: z.date().nullable(),
    expiresAt: z.date().nullable(),
    revokedAt: z.date().nullable(),
    createdAt: TimestampsSchema.shape.createdAt,
  }),
);

export type PersonalAccessToken = z.infer<typeof PersonalAccessTokenSchema>;

export const CreatePersonalAccessTokenResponseSchema = registerSchema(
  'CreatePersonalAccessTokenResponse',
  z.object({
    id: z.string().uuid(),
    name: z.string().min(1).max(100),
    token: z.string().min(1),
    tokenPreview: z.string().min(1),
    expiresAt: z.date().nullable(),
    createdAt: TimestampsSchema.shape.createdAt,
  }),
);

export type CreatePersonalAccessTokenResponse = z.infer<
  typeof CreatePersonalAccessTokenResponseSchema
>;
