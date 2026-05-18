import { Injectable, NotFoundException } from '@nestjs/common';
import dayjs from 'dayjs';
import { AccountsSurfaceService } from '../account/accounts-surface.service';
import { BalanceHistorySurfaceService } from '../balance-query/balance-history-surface.service';
import { TransactionAnalysisService } from '../transaction-analysis/transaction-analysis.service';
import { getDecimalPlaces, MoneySign } from '../types/MoneyWithSign';
import { ProjectionScenario, ProjectionScope } from '../types/Projection';
import { UserService } from '../user/user.service';
import type { BalanceHistorySurfaceSummary } from '../balance-query/balance-history-surface.service';

export interface ProjectionContext {
  user: {
    id: string;
    email: string;
    currency: string;
    timezone: string;
    today: string;
  };
  scope: ProjectionScope;
  history: BalanceHistorySurfaceSummary;
  startingValue: number;
  historicalPoints: Array<{ date: string; value: number }>;
}

function getTodayForTimezone(timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const year = parts.find((part) => part.type === 'year')?.value;
    const month = parts.find((part) => part.type === 'month')?.value;
    const day = parts.find((part) => part.type === 'day')?.value;

    if (year && month && day) {
      return `${year}-${month}-${day}`;
    }
  } catch {
    // Fall back to UTC if the stored timezone is invalid.
  }

  return new Date().toISOString().slice(0, 10);
}

function signedMajorAmount(input: {
  money: { amount: number; currency: string };
  sign: MoneySign;
}): number {
  const decimals = getDecimalPlaces(input.money.currency);
  const major = input.money.amount / Math.pow(10, decimals);
  return input.sign === MoneySign.NEGATIVE ? -major : major;
}

@Injectable()
export class ProjectionContextService {
  constructor(
    private readonly userService: UserService,
    private readonly accountsSurfaceService: AccountsSurfaceService,
    private readonly balanceHistorySurfaceService: BalanceHistorySurfaceService,
    private readonly transactionAnalysisService: TransactionAnalysisService,
  ) {}

  async getUserContext(userId: string): Promise<ProjectionContext['user']> {
    const user = await this.userService.findOne(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      id: user.id,
      email: user.email,
      currency: user.settings.currency,
      timezone: user.settings.timezone,
      today: getTodayForTimezone(user.settings.timezone),
    };
  }

  async getAccountsSnapshot(userId: string) {
    return this.accountsSurfaceService.getAccountsSnapshot(userId);
  }

  async getBalanceHistory(
    userId: string,
    input: {
      startDate: string;
      endDate: string;
      accountIds?: string[];
    },
  ): Promise<BalanceHistorySurfaceSummary> {
    return this.balanceHistorySurfaceService.getBalanceHistorySummary(
      userId,
      input,
    );
  }

  async getCashflowAnalysis(
    userId: string,
    input: { startDate: string; endDate: string },
  ) {
    return this.transactionAnalysisService.getAnalysis(
      input.startDate,
      input.endDate,
      userId,
    );
  }

  async getPlanningContext(
    userId: string,
    historyWindowYears: number,
  ): Promise<{
    user: ProjectionContext['user'];
    accounts: Awaited<
      ReturnType<AccountsSurfaceService['getAccountsSnapshot']>
    >;
    history: BalanceHistorySurfaceSummary;
  }> {
    const user = await this.getUserContext(userId);
    const startDate = dayjs(user.today)
      .subtract(historyWindowYears, 'year')
      .format('YYYY-MM-DD');
    const [accounts, history] = await Promise.all([
      this.getAccountsSnapshot(userId),
      this.getBalanceHistory(userId, {
        startDate,
        endDate: user.today,
      }),
    ]);

    return { user, accounts, history };
  }

  async getProjectionContext(
    userId: string,
    scenario: ProjectionScenario,
    historyWindowYears = 5,
  ): Promise<ProjectionContext> {
    const user = await this.getUserContext(userId);
    const endDate = scenario.startDate || user.today;
    const startDate = dayjs(endDate)
      .subtract(historyWindowYears, 'year')
      .format('YYYY-MM-DD');
    const accountIds = await this.resolveScopeAccountIds(
      userId,
      scenario.scope,
      {
        startDate,
        endDate,
      },
    );
    if (accountIds && accountIds.length === 0) {
      const history = this.emptyHistory(user.currency);

      return {
        user,
        scope: scenario.scope,
        history,
        startingValue: scenario.parameters.currentValue ?? 0,
        historicalPoints: [],
      };
    }

    const history = await this.getBalanceHistory(userId, {
      startDate,
      endDate,
      accountIds,
    });
    const startingValue =
      scenario.parameters.currentValue ?? signedMajorAmount(history.netWorth);

    return {
      user,
      scope: scenario.scope,
      history,
      startingValue,
      historicalPoints: history.chartData.map((point) => ({
        date: point.date,
        value: point.value,
      })),
    };
  }

  private async resolveScopeAccountIds(
    userId: string,
    scope: ProjectionScope,
    input: { startDate: string; endDate: string },
  ): Promise<string[] | undefined> {
    if (scope.kind === 'netWorth') {
      return undefined;
    }

    if (scope.kind === 'accounts') {
      return scope.accountIds;
    }

    const history = await this.getBalanceHistory(userId, input);
    const summaries = [...history.assets, ...history.liabilities];
    return summaries
      .filter((account) => scope.accountGroupings.includes(account.grouping))
      .map((account) => account.id);
  }

  private emptyHistory(currency: string): BalanceHistorySurfaceSummary {
    return {
      netWorth: {
        money: { amount: 0, currency },
        sign: MoneySign.POSITIVE,
      },
      changePercent: undefined,
      chartData: [],
      assets: [],
      liabilities: [],
    };
  }
}
