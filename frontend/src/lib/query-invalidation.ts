import { MutationCache } from '@tanstack/react-query'
import { assertAuthGeneration, getAuthGeneration } from './auth-generation'
import type { QueryClient, QueryKey } from '@tanstack/react-query'
import type { Account, User, UserSettings } from '../api/models'

export const queryFamilies = {
  accounts: ['/account'],
  dashboardSummary: ['/balance-query/dashboard-summary'],
  balances: ['/balance-query'],
  accountHistory: ['/balance-query/balances', '/balance-query/all-balances'],
  investments: ['/investment'],
  transactions: ['/transaction'],
  analysis: ['/transaction-analysis'],
  categories: ['/category'],
  analysisRules: ['/analysis-rules'],
  categorizationRules: [
    '/categorization-rules',
    '/categorization-rule-recommendations',
  ],
  schedules: ['/recurring-manual-transaction'],
  user: ['/user/me'],
  tokens: ['/user/tokens'],
} as const
export type QueryFamily = keyof typeof queryFamilies

// Match complete URL path segments, never accidental substrings.
export function belongsToFamily(
  key: QueryKey,
  families: ReadonlyArray<QueryFamily>,
) {
  const path = key[0]
  return (
    typeof path === 'string' &&
    families.some((family) =>
      queryFamilies[family].some(
        (prefix) => path === prefix || path.startsWith(`${prefix}/`),
      ),
    )
  )
}
export function invalidateFamilies(
  client: QueryClient,
  families: ReadonlyArray<QueryFamily>,
) {
  return client.invalidateQueries({
    predicate: (query) => belongsToFamily(query.queryKey, families),
  })
}
const transactionChanges: Array<QueryFamily> = [
  'transactions',
  'analysis',
  'categories',
  'categorizationRules',
]
const balanceChanges: Array<QueryFamily> = [
  'accounts',
  'balances',
  'investments',
]
export const mutationDependencies: Partial<
  Record<string, ReadonlyArray<QueryFamily>>
> = {
  accountControllerUpdate: ['accounts', 'dashboardSummary', 'accountHistory'],
  accountControllerCreate: balanceChanges,
  accountControllerRemove: [...balanceChanges, ...transactionChanges],
  accountControllerArchive: balanceChanges,
  accountControllerUpdateBalance: balanceChanges,
  balanceSnapshotControllerImportCsv: balanceChanges,
  bankLinkControllerSyncAllAccounts: [...balanceChanges, ...transactionChanges],
  bankLinkControllerSyncAllTransactions: [
    ...transactionChanges,
    'categorizationRules',
  ],
  bankLinkControllerSyncAllInvestmentHoldings: balanceChanges,
  bankLinkControllerSyncAllInvestmentTransactions: [
    ...balanceChanges,
    ...transactionChanges,
  ],
  bankLinkControllerInitiateLinking: ['accounts'],
  investmentControllerCreateManualBrokerageAccount: balanceChanges,
  investmentControllerReplaceManualBrokerageHoldings: balanceChanges,
  investmentControllerRefreshManualBrokeragePrices: balanceChanges,
  transactionControllerCreateManual: transactionChanges,
  transactionControllerUpdateManual: transactionChanges,
  transactionControllerRemoveManual: transactionChanges,
  transactionControllerUpdate: transactionChanges,
  transactionControllerUpdateCategory: transactionChanges,
  transactionControllerBulkUpdateCategories: transactionChanges,
  transactionControllerUndoBulkUpdateCategories: transactionChanges,
  categoryControllerCreateCustom: [
    ...transactionChanges,
    'categorizationRules',
    'analysisRules',
  ],
  categoryControllerUpdateCustom: [
    ...transactionChanges,
    'categorizationRules',
    'analysisRules',
  ],
  categoryControllerBulkUpdateCustom: [
    ...transactionChanges,
    'categorizationRules',
    'analysisRules',
  ],
  analysisRuleControllerCreate: ['analysisRules', 'analysis'],
  analysisRuleControllerUpdate: ['analysisRules', 'analysis'],
  categorizationRuleControllerCreate: ['categorizationRules'],
  categorizationRuleControllerUpdate: ['categorizationRules'],
  categorizationRuleControllerApply: [
    'categorizationRules',
    ...transactionChanges,
  ],
  categorizationRuleRecommendationControllerGenerate: ['categorizationRules'],
  categorizationRuleRecommendationControllerRegenerate: ['categorizationRules'],
  categorizationRuleRecommendationControllerAccept: ['categorizationRules'],
  categorizationRuleRecommendationControllerDismiss: ['categorizationRules'],
  // Creation can immediately generate its first due transaction; later edits do not.
  recurringManualTransactionControllerCreate: [
    'schedules',
    ...transactionChanges,
  ],
  recurringManualTransactionControllerUpdate: ['schedules'],
  recurringManualTransactionControllerArchive: ['schedules'],
  recurringManualTransactionControllerPause: ['schedules'],
  recurringManualTransactionControllerResume: ['schedules'],
  userControllerCreateToken: ['tokens'],
  userControllerRevokeToken: ['tokens'],
}

type Metadata = Pick<Account, 'name' | 'customName' | 'notes'>
const metadataFields = ['name', 'customName', 'notes'] as const
const metadataFamilies: Array<QueryFamily> = [
  'accounts',
  'dashboardSummary',
  'accountHistory',
]
const managedClients = new WeakSet<QueryClient>()

/** Standalone consumers reconcile locally; the app's MutationCache does this once. */
export function invalidateMutationFamilies(
  client: QueryClient,
  families: ReadonlyArray<QueryFamily>,
) {
  if (managedClients.has(client)) return Promise.resolve()
  return invalidateFamilies(client, families)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function readMetadata(value: unknown, id: string): Metadata | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = readMetadata(item, id)
      if (found) return found
    }
  } else if (isRecord(value)) {
    if (value.id === id && 'type' in value) {
      return {
        name: value.name as Account['name'],
        customName: value.customName as Account['customName'],
        notes: value.notes as Account['notes'],
      }
    }
    for (const item of Object.values(value)) {
      const found = readMetadata(item, id)
      if (found) return found
    }
  }
  return undefined
}
function patchMetadata(
  value: unknown,
  id: string,
  metadata: Partial<Metadata>,
): unknown {
  if (Array.isArray(value))
    return value.map((item) => patchMetadata(item, id, metadata))
  if (!isRecord(value)) return value
  if (value.id === id && 'type' in value) return { ...value, ...metadata }
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      patchMetadata(item, id, metadata),
    ]),
  )
}
function reconcileMetadata(
  client: QueryClient,
  id: string,
  metadata: Partial<Metadata>,
) {
  client.setQueriesData(
    { predicate: (query) => belongsToFamily(query.queryKey, metadataFamilies) },
    (previous: unknown) => patchMetadata(previous, id, metadata),
  )
}
export function reconcileAccount(client: QueryClient, account: Account) {
  // Preserve filtered list membership and derived balances until authoritative refetch.
  reconcileMetadata(client, account.id, {
    name: account.name,
    customName: account.customName,
    notes: account.notes,
  })
  client.setQueriesData<Array<Account>>(
    { predicate: (query) => query.queryKey[0] === '/account' },
    (previous) =>
      previous?.map((item) => (item.id === account.id ? account : item)),
  )
  if (client.getQueryData([`/account/${account.id}`]))
    client.setQueryData([`/account/${account.id}`], account)
}

export function createMutationCache(getClient: () => QueryClient) {
  const generations = new WeakMap<object, number>()
  const userIds = new WeakMap<object, string>()
  let editGeneration = getAuthGeneration()
  const edits = new Map<
    string,
    { base: Metadata; patches: Map<number, Partial<Metadata>> }
  >()
  const editedAccounts = new WeakMap<object, string>()
  const settleEdit = (
    client: QueryClient,
    mutation: { mutationId: number },
    account?: Account,
  ) => {
    const id = editedAccounts.get(mutation)
    if (!id) return false
    const state = edits.get(id)
    if (!state) return false
    if (account)
      state.base = {
        name: account.name,
        customName: account.customName,
        notes: account.notes,
      }
    state.patches.delete(mutation.mutationId)
    reconcileMetadata(
      client,
      id,
      Object.assign(
        {},
        state.base,
        ...[...state.patches.entries()]
          .sort(([a], [b]) => a - b)
          .map(([, patch]) => patch),
      ),
    )
    if (state.patches.size === 0) edits.delete(id)
    return state.patches.size > 0
  }
  const isLogout = (mutation: { options: { mutationKey?: QueryKey } }) =>
    ['userControllerLogout', 'userControllerLogoutAll'].includes(
      String(mutation.options.mutationKey?.[0]),
    )
  const cache = new MutationCache({
    onMutate: async (variables, mutation) => {
      managedClients.add(getClient())
      // Logout deliberately advances the generation in its own onMutate.
      if (isLogout(mutation)) return
      const generation = getAuthGeneration()
      if (editGeneration !== generation) {
        edits.clear()
        editGeneration = generation
      }
      generations.set(mutation, generation)
      const userId = getClient().getQueryData<User>(['/user/me'])?.id
      if (userId) userIds.set(mutation, userId)
      // Paused entity mutations must never start using a replacement identity.
      const execute = mutation.options.mutationFn
      if (execute)
        mutation.options.mutationFn = (...args) => {
          assertAuthGeneration(generation)
          return execute(...args)
        }
      if (
        mutation.options.mutationKey?.[0] !== 'accountControllerUpdate' ||
        !isRecord(variables) ||
        typeof variables.id !== 'string' ||
        !isRecord(variables.data)
      )
        return
      if (
        Object.keys(variables.data).some(
          (key) =>
            !metadataFields.includes(key as (typeof metadataFields)[number]),
        )
      )
        return
      const client = getClient()
      await client.cancelQueries({
        predicate: (query) => belongsToFamily(query.queryKey, metadataFamilies),
      })
      assertAuthGeneration(generation)
      const id = variables.id
      let state = edits.get(id)
      if (!state) {
        let base: Metadata | undefined
        for (const cached of client
          .getQueryCache()
          .findAll({
            predicate: (query) =>
              belongsToFamily(query.queryKey, metadataFamilies),
          })
          .sort((a, b) => a.state.dataUpdatedAt - b.state.dataUpdatedAt)) {
          const candidate = readMetadata(cached.state.data, id)
          if (candidate) {
            base ??= candidate
            for (const key of metadataFields) {
              if (candidate[key] !== undefined)
                Object.assign(base, { [key]: candidate[key] })
            }
          }
        }
        if (base) {
          state = { base, patches: new Map() }
          edits.set(id, state)
        }
      }
      if (!state) return
      state.patches.set(
        mutation.mutationId,
        variables.data as Partial<Metadata>,
      )
      editedAccounts.set(mutation, id)
      reconcileMetadata(
        client,
        id,
        Object.assign(
          {},
          state.base,
          ...[...state.patches.entries()]
            .sort(([a], [b]) => a - b)
            .map(([, patch]) => patch),
        ),
      )
    },
    onError: async (_error, _variables, _context, mutation) => {
      if (isLogout(mutation)) return
      assertAuthGeneration(generations.get(mutation) ?? getAuthGeneration())
      const client = getClient()
      if (editedAccounts.has(mutation) && !settleEdit(client, mutation))
        await invalidateFamilies(client, metadataFamilies)
    },
    onSettled: (_data, _error, _variables, _context, mutation) => {
      if (isLogout(mutation)) return
      assertAuthGeneration(generations.get(mutation) ?? getAuthGeneration())
    },
    onSuccess: async (data, _variables, _context, mutation) => {
      if (isLogout(mutation)) return
      assertAuthGeneration(generations.get(mutation) ?? getAuthGeneration())
      const client = getClient()
      const name = mutation.options.mutationKey?.[0]
      if (typeof name !== 'string') return
      if (name === 'userControllerUpdateSettings') {
        const ownerId = userIds.get(mutation)
        const previous = client.getQueryData<User>(['/user/me'])
        if (!ownerId) {
          // A detached consumer without a verified user cannot merge private data.
          await invalidateFamilies(client, [
            'user',
            'balances',
            'transactions',
            'analysis',
            'investments',
          ])
          return
        }
        if (previous?.id !== ownerId)
          throw new DOMException('Session changed', 'AbortError')
        // The endpoint returns UserSettings, not a User wrapper.
        const settings = data as UserSettings
        const currencyChanged = previous.settings.currency !== settings.currency
        const affected: Array<QueryFamily> = currencyChanged
          ? ['balances', 'transactions', 'analysis', 'investments']
          : previous.settings.neutralizationLookaroundDays !==
              settings.neutralizationLookaroundDays
            ? ['analysis']
            : []
        await client.cancelQueries({
          predicate: (query) =>
            belongsToFamily(query.queryKey, ['user', ...affected]),
        })
        assertAuthGeneration(generations.get(mutation) ?? getAuthGeneration())
        const current = client.getQueryData<User>(['/user/me'])
        if (current?.id !== ownerId)
          throw new DOMException('Session changed', 'AbortError')
        if (currencyChanged) {
          // Reset mounted observers before any render can attach new units to old values.
          for (const cached of client.getQueryCache().findAll({
            predicate: (query) => belongsToFamily(query.queryKey, affected),
          })) {
            cached.setState({
              data: undefined,
              dataUpdatedAt: 0,
              error: null,
              errorUpdatedAt: 0,
              status: 'pending',
              fetchStatus: 'idle',
              isInvalidated: true,
            })
          }
        }
        client.setQueryData(['/user/me'], { ...current, settings })
        if (affected.length) await invalidateFamilies(client, affected)
        return
      }
      const families = mutationDependencies[name]
      if (!families) return
      await client.cancelQueries({
        predicate: (query) => belongsToFamily(query.queryKey, families),
      })
      assertAuthGeneration(generations.get(mutation) ?? getAuthGeneration())
      if (
        name === 'accountControllerUpdate' &&
        isRecord(data) &&
        typeof data.id === 'string'
      ) {
        reconcileAccount(client, data as unknown as Account)
        if (settleEdit(client, mutation, data as unknown as Account)) return
      }
      await invalidateFamilies(client, families)
    },
  })
  return cache
}
