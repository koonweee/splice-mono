import type { Account } from '../types/Account';

/**
 * Event names for linked account events (accounts created/updated via BankLinkService)
 */
export const LinkedAccountEvents = {
  CREATED: 'linked-account.created',
  UPDATED: 'linked-account.updated',
} as const;

/**
 * Payload for linked account created event
 */
export class LinkedAccountCreatedEvent {
  constructor(public readonly account: Account) {}
}

/**
 * Payload for linked account updated event
 */
export class LinkedAccountUpdatedEvent {
  constructor(public readonly account: Account) {}
}

/**
 * Event names for manual account events
 */
export const ManualAccountEvents = {
  CREATED: 'manual-account.created',
  BALANCE_UPDATED: 'manual-account.balance-updated',
} as const;

/**
 * Payload for manual account created event
 */
export class ManualAccountCreatedEvent {
  constructor(public readonly account: Account) {}
}

/**
 * Payload for manual account balance updated event
 */
export class ManualAccountBalanceUpdatedEvent {
  constructor(public readonly account: Account) {}
}
