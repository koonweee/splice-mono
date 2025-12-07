import { AccountType } from 'plaid';
import { AccountEntity } from '../../../src/account/account.entity';
import { BalanceSnapshotEntity } from '../../../src/balance-snapshot/balance-snapshot.entity';
import { BalanceColumns } from '../../../src/common/balance.columns';
import { MoneySign } from '../../../src/types/MoneyWithSign';

/** Mock user ID for testing */
export const mockUserId = 'user-uuid-123';

/**
 * Create a mock AccountEntity with the given properties
 */
export function createMockAccountEntity(
  overrides: Partial<{
    id: string;
    userId: string;
    name: string;
    type: string;
    subType: string | null;
    currentBalanceAmount: number;
    currentBalanceSign: MoneySign;
    availableBalanceAmount: number;
    availableBalanceSign: MoneySign;
    currency: string;
  }> = {},
): AccountEntity {
  const entity = new AccountEntity();
  entity.id = overrides.id ?? 'account-1';
  entity.userId = overrides.userId ?? mockUserId;
  entity.name = overrides.name ?? 'Test Account';
  entity.type = overrides.type ?? AccountType.Depository;
  entity.subType = overrides.subType ?? null;
  entity.mask = null;
  entity.externalAccountId = null;
  entity.bankLinkId = null;
  entity.rawApiAccount = null;

  entity.currentBalance = new BalanceColumns();
  entity.currentBalance.amount = overrides.currentBalanceAmount ?? 100000; // $1,000.00 in cents
  entity.currentBalance.currency = overrides.currency ?? 'USD';
  entity.currentBalance.sign = overrides.currentBalanceSign ?? MoneySign.CREDIT;

  entity.availableBalance = new BalanceColumns();
  entity.availableBalance.amount = overrides.availableBalanceAmount ?? 100000;
  entity.availableBalance.currency = overrides.currency ?? 'USD';
  entity.availableBalance.sign =
    overrides.availableBalanceSign ?? MoneySign.CREDIT;

  return entity;
}

/**
 * Create a mock BalanceSnapshotEntity with the given properties
 */
export function createMockSnapshotEntity(
  overrides: Partial<{
    id: string;
    userId: string;
    accountId: string;
    snapshotDate: string;
    currentBalanceAmount: number;
    currentBalanceSign: MoneySign;
    availableBalanceAmount: number;
    availableBalanceSign: MoneySign;
    currency: string;
    snapshotType: string;
  }> = {},
): BalanceSnapshotEntity {
  const entity = new BalanceSnapshotEntity();
  entity.id = overrides.id ?? 'snapshot-1';
  entity.userId = overrides.userId ?? mockUserId;
  entity.accountId = overrides.accountId ?? 'account-1';
  entity.snapshotDate = overrides.snapshotDate ?? '2024-01-01';
  entity.snapshotType = overrides.snapshotType ?? 'SYNC';

  entity.currentBalance = new BalanceColumns();
  entity.currentBalance.amount = overrides.currentBalanceAmount ?? 100000;
  entity.currentBalance.currency = overrides.currency ?? 'USD';
  entity.currentBalance.sign = overrides.currentBalanceSign ?? MoneySign.CREDIT;

  entity.availableBalance = new BalanceColumns();
  entity.availableBalance.amount = overrides.availableBalanceAmount ?? 100000;
  entity.availableBalance.currency = overrides.currency ?? 'USD';
  entity.availableBalance.sign =
    overrides.availableBalanceSign ?? MoneySign.CREDIT;

  return entity;
}

/** Mock checking account (asset) with $1,000 balance */
export const mockCheckingAccount = createMockAccountEntity({
  id: 'checking-1',
  name: 'Checking Account',
  type: AccountType.Depository,
  currentBalanceAmount: 100000, // $1,000
});

/** Mock savings account (asset) with $5,000 balance */
export const mockSavingsAccount = createMockAccountEntity({
  id: 'savings-1',
  name: 'Savings Account',
  type: AccountType.Depository,
  currentBalanceAmount: 500000, // $5,000
});

/** Mock credit card account (liability) with $500 balance */
export const mockCreditCardAccount = createMockAccountEntity({
  id: 'credit-1',
  name: 'Credit Card',
  type: AccountType.Credit,
  currentBalanceAmount: 50000, // $500
});

/** Mock investment account (asset) with $10,000 balance */
export const mockInvestmentAccount = createMockAccountEntity({
  id: 'investment-1',
  name: 'Investment Account',
  type: AccountType.Investment,
  currentBalanceAmount: 1000000, // $10,000
});

