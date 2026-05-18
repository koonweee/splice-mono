import { ProjectionContextService } from '../../src/projection/projection-context.service';
import { MoneySign } from '../../src/types/MoneyWithSign';
import type { ProjectionScenario } from '../../src/types/Projection';

const userId = 'user-1';

function scenario(): ProjectionScenario {
  return {
    id: 'scenario-1',
    title: 'Investment projection',
    currency: 'USD',
    startDate: '2026-01-01',
    scope: { kind: 'accountGroups', accountGroupings: ['investment'] },
    horizonYears: 10,
    cadence: 'monthly',
    parameters: {
      annualContributions: [],
      expectedAnnualReturn: 0.07,
      inflationRate: 0.02,
      taxDragRate: 0,
      volatility: 0.15,
    },
    assumptions: [],
    controls: [],
    annotations: [],
  };
}

describe('ProjectionContextService', () => {
  const userService = {
    findOne: jest.fn(),
  };
  const accountsSurfaceService = {
    getAccountsSnapshot: jest.fn(),
  };
  const balanceHistorySurfaceService = {
    getBalanceHistorySummary: jest.fn(),
  };
  const transactionAnalysisService = {
    getAnalysis: jest.fn(),
  };
  let service: ProjectionContextService;

  beforeEach(() => {
    service = new ProjectionContextService(
      userService as never,
      accountsSurfaceService as never,
      balanceHistorySurfaceService as never,
      transactionAnalysisService as never,
    );
    userService.findOne.mockResolvedValue({
      id: userId,
      email: 'user@example.com',
      settings: { currency: 'USD', timezone: 'UTC' },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('does not fall back to all accounts when an account-group scope has no matches', async () => {
    balanceHistorySurfaceService.getBalanceHistorySummary.mockResolvedValue({
      netWorth: {
        money: { amount: 100000, currency: 'USD' },
        sign: MoneySign.POSITIVE,
      },
      chartData: [{ date: '2026-01-01', value: 1000 }],
      assets: [],
      liabilities: [],
    });

    const context = await service.getProjectionContext(userId, scenario());

    expect(context.startingValue).toBe(0);
    expect(context.historicalPoints).toEqual([]);
    expect(
      balanceHistorySurfaceService.getBalanceHistorySummary,
    ).toHaveBeenCalledTimes(1);
  });
});
