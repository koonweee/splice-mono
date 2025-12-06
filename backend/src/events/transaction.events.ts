import type { Transaction } from '../types/Transaction';

/**
 * Event names for transaction events
 */
export const TransactionEvents = {
  CREATED: 'transaction.created',
  UPDATED: 'transaction.updated',
  DELETED: 'transaction.deleted',
} as const;

/**
 * Payload for transaction created event
 */
export class TransactionCreatedEvent {
  constructor(public readonly transaction: Transaction) {}
}

/**
 * Payload for transaction updated event
 * Includes both old and new transaction data to calculate the difference
 */
export class TransactionUpdatedEvent {
  constructor(
    public readonly oldTransaction: Transaction,
    public readonly newTransaction: Transaction,
  ) {}
}

/**
 * Payload for transaction deleted event
 */
export class TransactionDeletedEvent {
  constructor(public readonly transaction: Transaction) {}
}
