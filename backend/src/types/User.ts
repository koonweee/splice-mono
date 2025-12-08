import { z } from 'zod';
import { registerSchema } from '../common/zod-api-response';
import { ProviderUserDetailsSchema } from './ProviderUserDetails';
import { TimestampsSchema } from './Timestamps';
import { UserSettingsSchema } from './UserSettings';

export const UserSchema = registerSchema(
  'User',
  z
    .object({
      id: z.string().uuid(),
      email: z.string().email(),
      /** User settings (currency, preferences, etc.) */
      settings: UserSettingsSchema,
      /** Provider-specific user details keyed by provider name */
      providerDetails: ProviderUserDetailsSchema.optional(),
    })
    .merge(TimestampsSchema),
);

export type User = z.infer<typeof UserSchema>;

/** User with hashed password (internal use only) */
export const UserWithPasswordSchema = UserSchema.extend({
  hashedPassword: z.string(),
});

export type UserWithPassword = z.infer<typeof UserWithPasswordSchema>;

/** Service arguments */

export const CreateUserDtoSchema = registerSchema(
  'CreateUserDto',
  z.object({
    email: z.string().email(),
    password: z.string().min(8),
    /** Initial user settings (optional, defaults will be applied) */
    settings: UserSettingsSchema.partial().optional(),
  }),
);

export type CreateUserDto = z.infer<typeof CreateUserDtoSchema>;

export const LoginDtoSchema = registerSchema(
  'LoginDto',
  z.object({
    email: z.string().email(),
    password: z.string(),
  }),
);

export type LoginDto = z.infer<typeof LoginDtoSchema>;

export const LoginResponseSchema = registerSchema(
  'LoginResponse',
  z.object({
    accessToken: z.string(),
    refreshToken: z.string(),
    user: UserSchema,
  }),
);

export type LoginResponse = z.infer<typeof LoginResponseSchema>;

export const RefreshTokenDtoSchema = registerSchema(
  'RefreshTokenDto',
  z.object({
    // Optional for web clients (token is read from HTTP-only cookie)
    // Required for mobile clients (token is passed in body)
    refreshToken: z.string().optional(),
  }),
);

export type RefreshTokenDto = z.infer<typeof RefreshTokenDtoSchema>;

export const TokenResponseSchema = registerSchema(
  'TokenResponse',
  z.object({
    accessToken: z.string(),
    refreshToken: z.string(),
  }),
);

export type TokenResponse = z.infer<typeof TokenResponseSchema>;
