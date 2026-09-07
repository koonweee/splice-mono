import { ExactDecimal, parseMoneyDraft } from '../src/lib/money'
import { getDecimalPlaces } from '../src/lib/currency-scales.generated'
import { FIXTURE_NOW, fixtureAccounts, money } from './fixtures'
import { activity, holding, securities } from './investment-fixtures'
import type { AxiosRequestConfig } from 'axios'
import type {
  Account,
  CreateManualBrokerageAccountDto,
  InvestmentHoldingSnapshot,
  InvestmentHoldingsResponse,
  ManualBrokeragePortfolioResponse,
  ManualBrokeragePositionInput,
  MoneyWithSign,
  ReplaceManualBrokerageHoldingsDto,
} from '../src/api/models'

type Handler = (config: AxiosRequestConfig) => unknown
/** Fixed inspection quotes only. This never loads prices or calls a provider. */
export function createInvestmentStore(
  accounts: Array<Account>,
  manualHoldings = false,
) {
  const reads: Partial<Record<string, Handler>> = {}
  const writes: Record<string, Handler> = {}
  const snapshots = new Map<string, InvestmentHoldingsResponse>()
  let sequence = 1
  const rates: Record<string, string> = {
    USD: '1',
    EUR: '1.1',
    SGD: '0.75',
    GBP: '1.25',
    JPY: '0.007',
  }
  function valuePositions(
    account: Account,
    positions: Array<ManualBrokeragePositionInput>,
  ): InvestmentHoldingsResponse & { accountValue: MoneyWithSign } {
    const currency = account.currentBalance.money.currency
    const rate = rates[currency]
    if (!rate)
      throw new Error('Portfolio fixtures support USD, EUR, SGD, GBP and JPY')
    const seen = new Set<string>()
    const holdings = positions.map((position): InvestmentHoldingSnapshot => {
      const quote = securities.find((item) => item.symbol === position.symbol)
      if (
        !quote ||
        seen.has(position.symbol) ||
        !/^(?:0|[1-9]\d{0,17})(?:\.\d{1,12})?$/.test(position.quantity)
      )
        throw new Error('Choose unique fixture securities and valid quantities')
      seen.add(position.symbol)
      const price = position.symbol === 'ZERO' ? '0' : '42.1234'
      const sourceCurrency = quote.currency
      const exchange = new ExactDecimal(rates[sourceCurrency]).div(rate)
      const value = new ExactDecimal(position.quantity).mul(price)
      const securityId = `fixture-security-${position.symbol}`
      return {
        ...holding,
        id: `${account.id}-${position.symbol}`,
        accountId: account.id,
        securityId,
        provider: 'manual',
        quantity: position.quantity,
        costBasis: null,
        institutionPrice: price,
        institutionValue: value.toFixed(),
        isoCurrencyCode: sourceCurrency,
        accountCurrency: currency,
        exchangeRateToAccountCurrency: exchange.toFixed(),
        accountValue: value.mul(exchange).toFixed(),
        security: {
          ...holding.security,
          id: securityId,
          provider: 'yahoo',
          externalSecurityId: quote.symbol,
          name: quote.name,
          tickerSymbol: quote.symbol,
          closePrice: price,
          isoCurrencyCode: sourceCurrency,
        },
      }
    })
    const total = holdings.reduce(
      (sum, item) => sum.add(item.accountValue ?? '0'),
      new ExactDecimal(0),
    )
    return {
      accountId: account.id,
      snapshotDate: FIXTURE_NOW.slice(0, 10),
      accountCurrency: currency,
      accountValue: parseMoneyDraft(
        total.toFixed(getDecimalPlaces(currency)),
        currency,
      ),
      holdings,
    }
  }
  function save(
    account: Account,
    positions: Array<ManualBrokeragePositionInput>,
  ): ManualBrokeragePortfolioResponse {
    if (account.valuationMode !== 'holdings' || account.archivedAt)
      throw new Error('Choose an active manual holdings account')
    const snapshot = valuePositions(account, positions)
    snapshots.set(account.id, snapshot)
    account.currentBalance = snapshot.accountValue
    account.availableBalance = snapshot.accountValue
    account.updatedAt = FIXTURE_NOW
    return { account, snapshot, staleSymbols: [] }
  }
  function register(account: Account, initial = false) {
    reads[`/account/${account.id}`] = () => account
    reads[`/investment/account/${account.id}/holdings/latest`] = () =>
      snapshots.get(account.id) ?? {
        accountId: account.id,
        snapshotDate: initial ? FIXTURE_NOW.slice(0, 10) : null,
        accountCurrency: account.currentBalance.money.currency,
        accountValue: initial
          ? money('5720426')
          : money('0', 'positive', account.currentBalance.money.currency),
        holdings: initial ? [{ ...holding, accountId: account.id }] : [],
      }
    reads[`/investment/account/${account.id}/activity`] = () => ({
      data: initial ? [{ ...activity, accountId: account.id }] : [],
      total: initial ? 1 : 0,
      pageIndex: 0,
      pageSize: 10,
    })
    writes[`PUT /investment/account/${account.id}/manual-holdings`] = (
      config,
    ) =>
      save(
        account,
        (config.data as ReplaceManualBrokerageHoldingsDto).positions,
      )
    writes[`POST /investment/account/${account.id}/refresh-prices`] = () =>
      save(
        account,
        (snapshots.get(account.id)?.holdings ?? []).map((item) => ({
          symbol: item.security.tickerSymbol ?? '',
          quantity: item.quantity ?? '0',
        })),
      )
  }
  accounts.forEach((account) => {
    const investment = account.type === 'investment'
    register(account, investment && !manualHoldings)
    if (investment && manualHoldings) {
      account.valuationMode = 'holdings'
      save(account, [{ symbol: 'EXM', quantity: '2' }])
    }
  })
  writes['POST /investment/manual-account'] = (config) => {
    const draft = config.data as CreateManualBrokerageAccountDto
    if (!draft.positions.length)
      throw new Error('Add at least one fixture position')
    const account: Account = {
      ...fixtureAccounts[1],
      id: `created-portfolio-${sequence++}`,
      name: draft.name,
      customName: draft.customName,
      notes: draft.notes,
      type: 'investment',
      subType: 'brokerage',
      valuationMode: 'holdings',
      currentBalance: money('0', 'positive', draft.accountCurrency),
      availableBalance: money('0', 'positive', draft.accountCurrency),
    }
    const result = save(account, draft.positions)
    accounts.push(account)
    register(account)
    return result
  }
  return { reads, writes, register }
}
