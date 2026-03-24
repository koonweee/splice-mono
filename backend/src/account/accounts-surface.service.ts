import { Injectable } from '@nestjs/common';
import { AccountService } from './account.service';
import type { Account } from '../types/Account';
import type { SerializedMoneyWithSign } from '../types/MoneyWithSign';

export type AccountGrouping = 'cash' | 'credit' | 'investment' | 'liability';

export interface AccountsSurfaceAccount {
  id: string;
  name: string | null;
  displayName: string;
  type: string;
  typeLabel: string;
  subType: string | null;
  subTypeLabel: string | null;
  grouping: AccountGrouping;
  groupingLabel: string;
  institutionName: string | null;
  balance: SerializedMoneyWithSign;
}

export interface AccountsSurfaceSnapshot {
  matchedCount: number;
  truncated: boolean;
  accounts: AccountsSurfaceAccount[];
}

function formatLabel(value: string | null | undefined): string {
  if (!value) return '';

  return value
    .split(/[\s_]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function getGrouping(type: string): AccountGrouping {
  switch (type.toLowerCase()) {
    case 'credit':
      return 'credit';
    case 'investment':
    case 'brokerage':
    case 'crypto_wallet':
      return 'investment';
    case 'loan':
    case 'other':
      return 'liability';
    default:
      return 'cash';
  }
}

@Injectable()
export class AccountsSurfaceService {
  constructor(private readonly accountService: AccountService) {}

  async findAll(userId: string): Promise<Account[]> {
    return this.accountService.findAll(userId);
  }

  async findOne(id: string, userId: string): Promise<Account | null> {
    return this.accountService.findOne(id, userId);
  }

  async getAccountsSnapshot(userId: string): Promise<AccountsSurfaceSnapshot> {
    const accounts = await this.findAll(userId);

    return {
      matchedCount: accounts.length,
      truncated: false,
      accounts: accounts.map((account) => this.toSurfaceAccount(account)),
    };
  }

  private toSurfaceAccount(account: Account): AccountsSurfaceAccount {
    const grouping = getGrouping(String(account.type));
    const balance = account.currentBalance;

    return {
      id: account.id,
      name: account.name,
      displayName: account.customName ?? account.name ?? 'Account',
      type: String(account.type),
      typeLabel: formatLabel(String(account.type)),
      subType: account.subType ?? null,
      subTypeLabel: account.subType ? formatLabel(String(account.subType)) : null,
      grouping,
      groupingLabel: formatLabel(grouping),
      institutionName: account.bankLink?.institutionName ?? null,
      balance,
    };
  }
}
