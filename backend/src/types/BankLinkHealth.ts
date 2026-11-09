import { z } from 'zod';
import { registerSchema } from '../common/zod-api-response';

export const BankLinkHealthSchema = registerSchema(
  'BankLinkHealth',
  z.object({
    state: z.enum(['healthy', 'delayed', 'needs_attention', 'unknown']),
    reason: z
      .enum([
        'accounts_missing',
        'login_required',
        'consent_required',
        'provider_delayed',
        'import_delayed',
        'check_failed',
      ])
      .nullable(),
    message: z.string(),
    checkedAt: z.string().datetime(),
    lastImportedAt: z.string().datetime().nullable(),
    providerUpdates: z.array(
      z.object({
        product: z.enum(['investments', 'transactions']),
        lastSuccessfulUpdateAt: z.string().datetime().nullable(),
        lastFailedUpdateAt: z.string().datetime().nullable(),
      }),
    ),
  }),
);
export type BankLinkHealth = z.infer<typeof BankLinkHealthSchema>;
export type ConnectionIssue = {
  code: string;
  reason: 'accounts_missing' | 'login_required' | 'consent_required';
  message: string;
};
export type ProviderConnectionHealth = {
  externalAccountIds: string[];
  issue: ConnectionIssue | null;
  providerUpdates: BankLinkHealth['providerUpdates'];
};
export const ConnectionHealthCheckResultSchema = registerSchema(
  'ConnectionHealthCheckResult',
  z.object({ checked: z.number().int().nonnegative(), changed: z.boolean() }),
);
