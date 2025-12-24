import { z } from 'zod';

export const ScraperAuthenticationSchema = z
  .object({
    bankId: z.string().min(1),
    username: z.string().min(1),
    password: z.string().min(1),
  })
  .passthrough();

export type ScraperAuthentication = z.infer<typeof ScraperAuthenticationSchema>;

export type ScrapedAccountType = 'savings_or_checking' | 'credit_card';

export interface ScrapedAccountData {
  transactions: unknown[];
  totalBalance: number;
  type: ScrapedAccountType;
}

export type ScrapedData = Record<string, ScrapedAccountData>;
