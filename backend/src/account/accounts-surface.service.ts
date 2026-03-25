import { Injectable } from '@nestjs/common';
import {
  formatAccountLabel,
  getAccountGrouping,
  getAccountGroupingLabel,
  type AccountGrouping,
} from './account-labels';
import { AccountService } from './account.service';
import type { Account } from '../types/Account';
import type { SerializedMoneyWithSign } from '../types/MoneyWithSign';

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
    const grouping = getAccountGrouping(String(account.type));
    const balance = account.currentBalance;

    return {
      id: account.id,
      name: account.name,
      displayName: account.customName ?? account.name ?? 'Account',
      type: String(account.type),
      typeLabel: formatAccountLabel(String(account.type)),
      subType: account.subType ?? null,
      subTypeLabel: account.subType
        ? formatAccountLabel(String(account.subType))
        : null,
      grouping,
      groupingLabel: getAccountGroupingLabel(grouping),
      institutionName: account.bankLink?.institutionName ?? null,
      balance,
    };
  }
}
