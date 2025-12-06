import { z } from 'zod';
import { registerSchema } from '../common/zod-api-response';
import { ProviderUserDetailsSchema } from './ProviderUserDetails';
import { TimestampsSchema } from './Timestamps';

export const UserSchema = registerSchema(
  'User',
  z
    .object({
      id: z.string().uuid(),
      email: z.string().email(),
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
    user: UserSchema,
  }),
);

export type LoginResponse = z.infer<typeof LoginResponseSchema>;
