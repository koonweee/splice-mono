import type { BankLinkStatus } from '../types/BankLink';

export const BankLinkEvents = {
  NEEDS_ATTENTION: 'bank-link.needs-attention',
} as const;

export class BankLinkNeedsAttentionEvent {
  constructor(
    public readonly userId: string,
    public readonly bankLinkId: string,
    public readonly providerName: string,
    public readonly institutionName: string | null,
    public readonly status: Exclude<BankLinkStatus, 'OK'>,
    public readonly statusBody: Record<string, unknown> | null,
    public readonly occurredAt: string,
  ) {}
}
