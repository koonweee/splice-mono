import { CurrencyConversionService } from '../currency-exchange/currency-conversion.service';
import { fxRequestKey } from '../currency-exchange/currency-exchange.service';
import { buildBalanceWithConversion } from '../balance-query/balance-projection';
import type { RateWithSource } from '../types/ExchangeRate';
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
  reportingBalance: SerializedMoneyWithSign | null;
  exchangeRate: RateWithSource | null;
  reportingCoverage: 'available' | 'missing_fx';
}

export interface AccountsSurfaceSnapshot {
  matchedCount: number;
  truncated: boolean;
  accounts: AccountsSurfaceAccount[];
  reportingCurrency: string;
  fxReferenceDate: string;
  dateBasis: 'current_account_record_with_UTC_date_FX';
}

@Injectable()
export class AccountsSurfaceService {
  constructor(
    private readonly accountService: AccountService,
    private readonly conversion: CurrencyConversionService,
  ) {}

  async findAll(userId: string): Promise<Account[]> {
    return this.accountService.findAll(userId);
  }

  async findOne(id: string, userId: string): Promise<Account | null> {
    return this.accountService.findOne(id, userId);
  }

  async getAccountsSnapshot(userId: string): Promise<AccountsSurfaceSnapshot> {
    const accounts = await this.findAll(userId);

    const reportingCurrency =
      await this.conversion.getPreferredCurrency(userId);
    const fxReferenceDate = new Date().toISOString().slice(0, 10);
    const requests = accounts
      .filter(
        (account) =>
          account.currentBalance.money.currency !== reportingCurrency &&
          account.currentBalance.money.amount !== '0',
      )
      .map((account) => ({
        baseCurrency: account.currentBalance.money.currency,
        targetCurrency: reportingCurrency,
        requestedDate: fxReferenceDate,
      }));
    const resolved = await this.conversion.getResolvedRates(
      requests,
      undefined,
      { allowMissing: true },
    );
    return {
      reportingCurrency,
      fxReferenceDate,
      dateBasis: 'current_account_record_with_UTC_date_FX',
      matchedCount: accounts.length,
      truncated: false,
      accounts: accounts.map((account) => {
        const rate = resolved.get(
          fxRequestKey({
            baseCurrency: account.currentBalance.money.currency,
            targetCurrency: reportingCurrency,
            requestedDate: fxReferenceDate,
          }),
        );
        const missing =
          account.currentBalance.money.currency !== reportingCurrency &&
          account.currentBalance.money.amount !== '0' &&
          !rate;
        const converted = missing
          ? null
          : buildBalanceWithConversion(
              account.currentBalance,
              reportingCurrency,
              rate
                ? new Map([
                    [`${rate.baseCurrency}:${rate.targetCurrency}`, rate],
                  ])
                : undefined,
              fxReferenceDate,
            );
        return {
          ...this.toSurfaceAccount(account),
          reportingBalance: converted?.reportingBalance ?? null,
          exchangeRate: converted?.exchangeRate ?? null,
          reportingCoverage: missing
            ? ('missing_fx' as const)
            : ('available' as const),
        };
      }),
    };
  }

  private toSurfaceAccount(
    account: Account,
  ): Omit<
    AccountsSurfaceAccount,
    'reportingBalance' | 'exchangeRate' | 'reportingCoverage'
  > {
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
