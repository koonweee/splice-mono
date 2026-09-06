import { validateSettingsSearch } from './route-search'
import type { SettingsTab } from './route-search'

/** Code only: share imports between intent preparation and React.lazy. A failed
 * speculative import must not poison a later navigation attempt. */
export function sharedImport<T>(load: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | undefined
  return () => {
    pending ??= load().catch((error: unknown) => {
      pending = undefined
      throw error
    })
    return pending
  }
}
export const loadChart = sharedImport(() =>
  import('../components/Chart').then((module) => ({ default: module.Chart })),
)
export const loadDonutChart = sharedImport(() =>
  import('@mantine/charts').then((module) => ({ default: module.DonutChart })),
)
export const loadAnalysisSankeyChart = sharedImport(() =>
  import('../components/analysis/AnalysisSankeyChart').then((module) => ({
    default: module.AnalysisSankeyChart,
  })),
)
export const loadAnalysisAuditDrawer = sharedImport(() =>
  import('../components/analysis/AnalysisAuditDrawer').then((module) => ({
    default: module.AnalysisAuditDrawer,
  })),
)
export const loadCategoryTransactionsModal = sharedImport(() =>
  import('../components/CategoryTransactionsModal').then((module) => ({
    default: module.CategoryTransactionsModal,
  })),
)
export const settingsFeatureLoaders = {
  analysis: sharedImport(() =>
    import('../components/settings/AnalysisRulesSection').then((module) => ({
      default: module.AnalysisRulesSection,
    })),
  ),
  categorization: sharedImport(() =>
    import('../components/settings/CategorizationRulesSection').then(
      (module) => ({ default: module.CategorizationRulesSection }),
    ),
  ),
  categories: sharedImport(() =>
    import('../components/settings/CustomCategoriesSection').then((module) => ({
      default: module.CustomCategoriesSection,
    })),
  ),
  access: sharedImport(() =>
    import('../components/settings/PersonalAccessTokenSection').then(
      (module) => ({ default: module.PersonalAccessTokenSection }),
    ),
  ),
  recurring: sharedImport(() =>
    import('../components/settings/RecurringManualTransactionsSection').then(
      (module) => ({ default: module.RecurringManualTransactionsSection }),
    ),
  ),
}

export function prepareSettingsCode(tab: SettingsTab): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  if (tab in settingsFeatureLoaders) {
    return settingsFeatureLoaders[
      tab as keyof typeof settingsFeatureLoaders
    ]().then(
      () => undefined,
      () => undefined,
    )
  }
  return Promise.resolve()
}
export function prepareChartCode(page: 'home' | 'analysis'): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  return Promise.allSettled(
    page === 'home'
      ? [loadChart()]
      : [loadDonutChart(), loadAnalysisSankeyChart()],
  ).then(() => undefined)
}

/** Readiness of the actual nested code needed by the selected page. The caller
 * can defer speculation until this settles without blocking navigation or SSR.
 * Only module promises live here; no query data or session state is retained. */
export function preparePageFeatureCode(
  pathname: string,
  search: Record<string, unknown>,
): Promise<void> {
  if (pathname === '/home') return prepareChartCode('home')
  if (pathname === '/analysis') return prepareChartCode('analysis')
  if (pathname === '/settings')
    return prepareSettingsCode(validateSettingsSearch(search).tab ?? 'general')
  return Promise.resolve()
}

export const loadAddAccountModal = sharedImport(() =>
  import('../components/accounts/AddAccountModal').then((module) => ({
    default: module.AddAccountModal,
  })),
)
export const loadBackfillModal = sharedImport(() =>
  import('../components/accounts/BackfillModal').then((module) => ({
    default: module.BackfillModal,
  })),
)
export const loadManualTransactionModal = sharedImport(() =>
  import('../components/transactions/ManualTransactionModal').then(
    (module) => ({ default: module.ManualTransactionModal }),
  ),
)

export function featureIntent(load: () => Promise<unknown>) {
  const prepare = () => {
    void load().catch(() => undefined)
  }
  return { onPointerEnter: prepare, onFocus: prepare, onTouchStart: prepare }
}

export const loadManualBrokerageHoldingsModal = sharedImport(() =>
  import('../components/investments/ManualBrokerageHoldingsModal').then(
    (module) => ({ default: module.ManualBrokerageHoldingsModal }),
  ),
)
