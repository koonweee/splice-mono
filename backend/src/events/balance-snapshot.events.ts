import type { BalanceSnapshot } from '../types/BalanceSnapshot';

/**
 * Event names for balance snapshot events
 */
export const BalanceSnapshotEvents = {
  CREATED: 'balance-snapshot.created',
  UPDATED: 'balance-snapshot.updated',
} as const;

/**
 * Payload for balance snapshot created event
 */
export class BalanceSnapshotCreatedEvent {
  constructor(public readonly snapshot: BalanceSnapshot) {}
}

/**
 * Payload for balance snapshot updated event
 */
export class BalanceSnapshotUpdatedEvent {
  constructor(public readonly snapshot: BalanceSnapshot) {}
}
