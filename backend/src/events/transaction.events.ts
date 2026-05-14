export const TransactionEvents = {
  PROVIDER_TRANSACTIONS_SYNCED: 'transactions.provider-transactions-synced',
} as const;

export class ProviderTransactionsSyncedEvent {
  constructor(
    public readonly userId: string,
    public readonly transactionIds: string[],
    public readonly accountIds: string[],
    public readonly count: number,
    public readonly occurredAt: string,
  ) {}
}
