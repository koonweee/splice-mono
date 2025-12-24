import { z } from 'zod';

export const ScraperAuthenticationSchema = z
  .object({
    bankId: z.string().min(1),
    username: z.string().min(1),
    password: z.string().min(1),
  })
  .passthrough();

export type ScraperAuthentication = z.infer<typeof ScraperAuthenticationSchema>;
