import { AxiosError, AxiosHeaders, CanceledError } from 'axios'
import { OfflineMutationError } from '../src/lib/offline-mutation'
import { resolveAppearance } from '../src/lib/design-system/appearance'
import { waitForRead } from './loading-gates'
import { appearanceFromSearch } from './preferences'
import { createNotificationStore } from './notification-store'
import { createCategoryStore } from './category-store'
import { createSettingsStore } from './settings-store'
import { createTransactionBulkStore } from './transaction-bulk-store'
import { createRuleStore } from './rule-store'
import { createInvestmentStore } from './investment-store'
import { FIXTURE_NOW, fixtureAccounts, fixtureUser } from './fixtures'
import {
  fixtureAnalysis,
  fixtureCategories,
  fixtureDashboard,
  fixtureTransactions,
} from './page-fixtures'
import { securities } from './investment-fixtures'
import type { AxiosRequestConfig } from 'axios'
import type {
  BalanceQueryPerDateResult,
  BulkCustomCategoryActionDto,
  BulkTransactionCategoryUpdateDto,
  BulkTransactionCategoryUpdateUndoDto,
  CreateCustomCategoryDto,
  CreateManualAccountDto,
  CreateManualTransactionDto,
  DashboardPeriod,
  TransactionControllerFindAllParams,
  UpdateAccountMetadataDto,
  UpdateBalanceBody,
  UpdateCustomCategoryDto,
  UpdateManualTransactionDto,
  UpdateTransactionCategoryDto,
  UpdateTransactionReportingDateDto,
  UpdateUserSettingsDto,
  UserSettings,
} from '../src/api/models'

export type FixtureOptions = {
  sankey?: boolean
  beforeRead?: (path: string) => Promise<void>
  longContent?: boolean
  empty?: boolean
  manualHoldings?: boolean
  appearance?: unknown
  latency?: number
  failure?: 'none' | 'reads' | 'writes'
  manualSaveFailure?: 'offline' | 'lost-response' | 'reconcile-error'
  shouldFailRead?: (path: string) => boolean
}

/** Each document gets a new in-memory store. No fetch, XHR, cookies or storage. */
export function createFixtureApi(options: FixtureOptions = {}) {
  let manualResponseLost = false
  const accounts = structuredClone(options.empty ? [] : fixtureAccounts)
  if (options.longContent && accounts.length) {
    for (const [index, status] of (
      ['OK', 'PENDING_REAUTH'] as const
    ).entries()) {
      const id = `density-linked-${index}`
      accounts.push({
        ...structuredClone(accounts[1]),
        id,
        name: 'International everyday account with a long provider name',
        customName: index
          ? 'Emergency savings at the overseas institution'
          : null,
        bankLinkId: id,
        syncedAt: FIXTURE_NOW,
        bankLink: {
          id,
          providerName: 'plaid',
          institutionName: 'Example connected institution',
          accountIds: [id],
          status,
          statusDate: FIXTURE_NOW,
          statusBody: index
            ? { reason: 'The connection needs renewed consent.' }
            : undefined,
          createdAt: FIXTURE_NOW,
          updatedAt: FIXTURE_NOW,
          userId: fixtureUser.id,
        },
      })
    }
  }
  const investmentStore = createInvestmentStore(
    accounts,
    options.manualHoldings,
  )
  const user = structuredClone(fixtureUser)
  if (options.sankey !== undefined)
    user.settings.analysisSankeyEnabled = options.sankey
  user.settings.appearance = resolveAppearance(
    options.appearance ?? user.settings.appearance,
  ).preference
  const categories = structuredClone(options.empty ? [] : fixtureCategories)
  if (options.longContent && categories.length)
    categories[0].detailed =
      'Groceries and household essentials from neighborhood markets'
  const transactions = structuredClone(options.empty ? [] : fixtureTransactions)
  const notificationStore = createNotificationStore(
    options.empty,
    () => transactions.filter((item) => !item.categoryId).length,
  )
  const categoryStore = createCategoryStore(categories, transactions)
  const ruleStore = createRuleStore(
    categories,
    transactions,
    options.empty,
    options.longContent,
  )
  const transactionBulkStore = createTransactionBulkStore(
    transactions,
    categories,
  )
  const settingsStore = createSettingsStore({
    longContent: options.longContent,
    empty: options.empty,
    accounts,
    categories,
  })
  const analysis = structuredClone(fixtureAnalysis)
  if (options.longContent) {
    const scale = (value: string) => (BigInt(value) * 100000n).toString()
    analysis.inflows.forEach((item) => {
      item.totalAmount = scale(item.totalAmount)
    })
    analysis.outflows.forEach((item) => {
      item.totalAmount = scale(item.totalAmount)
    })
    analysis.totalInflow = scale(analysis.totalInflow)
    analysis.totalOutflow = scale(analysis.totalOutflow)
    analysis.netFlow = scale(analysis.netFlow)
  }
  const reads: Record<string, (config: AxiosRequestConfig) => unknown> = {
    '/user/me': () => user,
    '/account': () => accounts,
    '/category': () => categoryStore.list(),
    '/category/custom': (config) =>
      categoryStore.list(config.params?.archived === true),
    '/category/search': (config) =>
      categoryStore
        .list()
        .filter((item) =>
          `${item.primary} ${item.detailed}`
            .toLowerCase()
            .includes(String(config.params?.q ?? '').toLowerCase()),
        ),
    '/category/filter-options': () => categories,
    '/category/manage': (config) =>
      categoryStore.list(config.params?.archived === true).map((category) => ({
        ...category,
        transactionCount: transactions.filter(
          (item) => item.categoryId === category.id,
        ).length,
        lastUsedAt: FIXTURE_NOW,
      })),
    '/transaction': (config) => {
      const filter = (config.params ?? {}) as TransactionControllerFindAllParams
      const data = transactions.filter(
        (transaction) =>
          (!filter.accountId || transaction.accountId === filter.accountId) &&
          (!filter.categoryId ||
            (filter.categoryId === 'UNCATEGORIZED'
              ? transaction.categoryId == null
              : transaction.categoryId === filter.categoryId)) &&
          (!filter.categoryPrimary ||
            (filter.categoryPrimary === 'UNCATEGORIZED'
              ? transaction.categoryId == null
              : transaction.category?.primary === filter.categoryPrimary)) &&
          (!filter.amountSign ||
            transaction.amount.sign === filter.amountSign) &&
          (!filter.startDate || transaction.activityDate >= filter.startDate) &&
          (!filter.endDate || transaction.activityDate <= filter.endDate),
      )
      return {
        data,
        total: data.length,
        pageIndex: 0,
        nextCursor: null,
        hasMore: false,
        pageSize: 50,
      }
    },
    '/transaction-analysis/transactions': () => transactions,
    '/investment/securities/search': () => securities,
    '/balance-snapshot/template': () =>
      new Blob(
        ['accountId,date,balance,currency\ncash,2026-09-06,1240.50,USD\n'],
        { type: 'text/csv' },
      ),
    '/balance-query/balances': (): Array<BalanceQueryPerDateResult> =>
      ['2026-08-06', '2026-08-20', '2026-09-06'].map((date) => ({
        date,
        balances: Object.fromEntries(
          accounts.map((account) => [
            account.id,
            {
              account,
              availableBalance: { balance: account.availableBalance },
              currentBalance: { balance: account.currentBalance },
              effectiveBalance: { balance: account.currentBalance },
            },
          ]),
        ),
      })),
    '/transaction-analysis': () =>
      options.empty
        ? {
            ...fixtureAnalysis,
            inflows: [],
            outflows: [],
            totalInflow: '0',
            totalOutflow: '0',
            netFlow: '0',
          }
        : analysis,
    '/transaction-analysis/audit': () => ({
      startDate: fixtureAnalysis.startDate,
      endDate: fixtureAnalysis.endDate,
      neutralizationLookaroundDays: 7,
      rows: options.empty
        ? []
        : [
            {
              id: 'excluded-fixture',
              type: 'excluded',
              groupKey: 'travel',
              groupLabel: 'Travel exclusions',
              ruleId: 'analysis-rule',
              ruleName: 'Exclude travel from everyday spending',
              transaction: {
                id: 'travel-transaction',
                activityDate: '2026-09-04',
                merchantName: 'Example accommodation',
                originalDescription: null,
                accountName: 'Everyday account',
                categoryPrimary: 'TRAVEL',
                categoryDetailed: 'Travel',
                amount: { amount: '105025', currency: 'USD', sign: 'negative' },
              },
            },
          ],
    }),
    ...ruleStore.reads,
    ...settingsStore.reads,
    ...notificationStore.reads,
    '/balance-query/dashboard-summary': (config) =>
      fixtureDashboard(
        (config.params?.period ?? 'month') as DashboardPeriod,
        options.empty ?? false,
      ).summary,
    '/balance-query/dashboard-series': (config) =>
      fixtureDashboard(
        (config.params?.period ?? 'month') as DashboardPeriod,
        options.empty ?? false,
      ).series,
  }
  let nextId = 1
  const writes: Record<string, (config: AxiosRequestConfig) => unknown> = {
    ...notificationStore.writes,
    'POST /transaction/category/bulk': (config) =>
      transactionBulkStore.update(
        config.data as BulkTransactionCategoryUpdateDto,
      ),
    'POST /transaction/category/bulk/undo': (config) =>
      transactionBulkStore.undo(
        (config.data as BulkTransactionCategoryUpdateUndoDto).undo,
      ),
    'POST /category/custom': (config) =>
      categoryStore.create(config.data as CreateCustomCategoryDto),
    'PATCH /category/custom/bulk': (config) =>
      categoryStore.bulk(config.data as BulkCustomCategoryActionDto),
    'PATCH /user/settings': (config) => {
      const patch = config.data as UpdateUserSettingsDto
      Object.assign(user.settings, patch)
      return user.settings satisfies UserSettings
    },
    'POST /account': (config) => {
      const created = {
        ...fixtureAccounts[1],
        ...(config.data as CreateManualAccountDto),
        id: `created-account-${nextId++}`,
      }
      accounts.push(created)
      investmentStore.register(created)
      return created
    },
    'POST /transaction/manual': (config) => {
      const draft = config.data as CreateManualTransactionDto
      const created = {
        ...fixtureTransactions[0],
        ...draft,
        activityDate: draft.providerDate,
        category:
          categories.find((category) => category.id === draft.categoryId) ??
          null,
        accountName:
          accounts.find((account) => account.id === draft.accountId)?.name ??
          null,
        source: 'manual' as const,
        categoryAssignmentSource: 'manual' as const,
        id: `created-transaction-${nextId++}`,
      }
      transactions.unshift(created)
      return created
    },
    'POST /balance-snapshot/import': () => ({ imported: 1 }),
  }
  return async function request<T>(config: AxiosRequestConfig): Promise<T> {
    const method = (config.method ?? 'GET').toUpperCase()
    const url = config.url ?? ''
    const path = url.split('?')[0]
    const match = /^\/account\/([^/]+)(?:\/(balance|archive))?$/.exec(path)
    const account = match && accounts.find((item) => item.id === match[1])
    const categoryMatch = /^\/category\/custom\/([^/]+)$/.exec(path)
    const category = categoryMatch && categoryStore.find(categoryMatch[1])
    const transactionMatch =
      /^\/transaction\/([^/]+)(?:\/(category|manual))?$/.exec(path)
    const transaction =
      transactionMatch &&
      transactions.find((item) => item.id === transactionMatch[1])
    const transactionOperation =
      Boolean(transaction) &&
      ((method === 'GET' && !transactionMatch?.[2]) ||
        (method === 'PATCH' && transactionMatch?.[2] !== 'manual') ||
        (transaction?.source === 'manual' &&
          transactionMatch?.[2] === 'manual' &&
          ['PATCH', 'DELETE'].includes(method)))
    const recognized =
      (Boolean(category) && method === 'PATCH') ||
      transactionOperation ||
      (method === 'GET' &&
        (Object.hasOwn(reads, path) ||
          Object.hasOwn(ruleStore.reads, path) ||
          Object.hasOwn(investmentStore.reads, path))) ||
      Object.hasOwn(writes, `${method} ${path}`) ||
      Object.hasOwn(settingsStore.writes, `${method} ${path}`) ||
      Object.hasOwn(ruleStore.writes, `${method} ${path}`) ||
      Object.hasOwn(investmentStore.writes, `${method} ${path}`) ||
      (Boolean(account) &&
        ((method === 'PATCH' && !match?.[2]) ||
          (method === 'POST' &&
            ['balance', 'archive'].includes(match?.[2] ?? ''))))
    if (!recognized) {
      const message = `Unmocked workbench request: ${method} ${url}`
      if (typeof window !== 'undefined')
        window.dispatchEvent(
          new CustomEvent('workbench:request-blocked', { detail: message }),
        )
      throw new Error(message)
    }
    const isManualWrite =
      method !== 'GET' &&
      path.startsWith('/transaction/') &&
      path.endsWith('/manual')
    if (isManualWrite && options.manualSaveFailure === 'offline')
      throw new OfflineMutationError()
    if (method === 'GET') await options.beforeRead?.(path)
    if (config.signal?.aborted) throw new CanceledError()
    if (options.latency)
      await new Promise<void>((resolve, reject) => {
        const abort = () => {
          clearTimeout(timer)
          reject(new CanceledError())
        }
        const timer = setTimeout(() => {
          config.signal?.removeEventListener?.('abort', abort)
          resolve()
        }, options.latency)
        config.signal?.addEventListener?.('abort', abort, { once: true })
      })
    if (
      (options.manualSaveFailure === 'reconcile-error' &&
        manualResponseLost &&
        method === 'GET' &&
        path.startsWith('/transaction')) ||
      (options.failure === 'reads' &&
        method === 'GET' &&
        path !== '/user/me') ||
      (method === 'GET' && options.shouldFailRead?.(path)) ||
      (options.failure === 'writes' && method !== 'GET')
    ) {
      throw new AxiosError(
        'Deliberate workbench failure. Change the failure control to retry.',
        'ERR_BAD_RESPONSE',
        undefined,
        undefined,
        {
          status: 503,
          statusText: 'Fixture unavailable',
          headers: {},
          config: { headers: new AxiosHeaders() },
          data: {
            message:
              'Deliberate workbench failure. Change the failure control to retry.',
          },
        },
      )
    }
    let result: unknown
    if (category && method === 'PATCH')
      result = categoryStore.update(
        category,
        config.data as UpdateCustomCategoryDto,
      )
    else if (transaction && transactionOperation) {
      if (method === 'DELETE') {
        transactions.splice(transactions.indexOf(transaction), 1)
      } else if (method === 'PATCH') {
        if (transactionMatch[2] === 'manual') {
          const draft = config.data as UpdateManualTransactionDto
          Object.assign(transaction, draft, {
            reportingDateOverride: null,
            activityDate: draft.providerDate,
            accountName:
              accounts.find((item) => item.id === draft.accountId)?.name ??
              null,
            category:
              categories.find((item) => item.id === draft.categoryId) ?? null,
            categoryAssignmentSource: 'manual',
          })
        } else if (transactionMatch[2] === 'category') {
          const { categoryId } = config.data as UpdateTransactionCategoryDto
          Object.assign(transaction, {
            categoryId,
            category: categories.find((item) => item.id === categoryId) ?? null,
            categoryAssignmentSource: 'manual',
            categoryAssignmentRuleId: null,
            categoryUpdatedAt: FIXTURE_NOW,
          })
        } else {
          const { reportingDateOverride } =
            config.data as UpdateTransactionReportingDateDto
          transaction.reportingDateOverride = reportingDateOverride
          transaction.activityDate =
            reportingDateOverride ?? transaction.providerDate
        }
        transaction.updatedAt = FIXTURE_NOW
        result = transaction
      } else result = transaction
    } else if (method === 'GET')
      result = (
        investmentStore.reads[path] ??
        (Object.hasOwn(ruleStore.reads, path)
          ? ruleStore.reads[path]
          : reads[path])
      )(config)
    else if (Object.hasOwn(investmentStore.writes, `${method} ${path}`))
      result = investmentStore.writes[`${method} ${path}`](config)
    else if (Object.hasOwn(settingsStore.writes, `${method} ${path}`))
      result = settingsStore.writes[`${method} ${path}`](config)
    else if (Object.hasOwn(ruleStore.writes, `${method} ${path}`))
      result = ruleStore.writes[`${method} ${path}`](config)
    else if (Object.hasOwn(writes, `${method} ${path}`))
      result = writes[`${method} ${path}`](config)
    else if (account && method === 'PATCH') {
      const patch = config.data as UpdateAccountMetadataDto
      Object.assign(account, patch, { updatedAt: FIXTURE_NOW })
      result = account
    } else if (account && match[2] === 'balance') {
      const { balance } = config.data as UpdateBalanceBody
      account.currentBalance = balance
      result = account
    } else if (account) {
      account.archivedAt = FIXTURE_NOW
      result = account
    }
    if (
      isManualWrite &&
      !manualResponseLost &&
      ['lost-response', 'reconcile-error'].includes(
        options.manualSaveFailure ?? '',
      )
    ) {
      manualResponseLost = true
      throw new AxiosError('Fixture response lost after saving.', 'ERR_NETWORK')
    }
    // The generated hook owns the response type; cloning models HTTP response isolation.
    return structuredClone(result) as T
  }
}
const params = new URLSearchParams(
  typeof location === 'undefined' ? '' : location.search,
)
const failure = params.get('failure')
let transactionRefreshFailure = false
export function setTransactionRefreshFailure(failing: boolean) {
  transactionRefreshFailure = failing
}
export const axios = createFixtureApi({
  beforeRead: waitForRead,
  sankey: params.has('sankey') ? params.get('sankey') !== 'false' : undefined,
  empty: params.get('state') === 'empty',
  longContent: params.get('state') === 'long-content',
  manualHoldings:
    params.get('example') === 'account-dialogs' &&
    params.get('state') === 'holdings',
  manualSaveFailure:
    params.get('example') === 'manual-save' &&
    ['offline', 'lost-response', 'reconcile-error'].includes(
      params.get('state') ?? '',
    )
      ? (params.get('state') as 'offline' | 'lost-response' | 'reconcile-error')
      : undefined,
  appearance: appearanceFromSearch(params.toString()).preference,
  latency: Math.min(10000, Math.max(0, Number(params.get('latency')) || 0)),
  failure: failure === 'reads' || failure === 'writes' ? failure : 'none',
  shouldFailRead: (path) =>
    transactionRefreshFailure && path === '/transaction',
})
