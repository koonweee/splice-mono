import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { useDashboardControllerGetSummary } from '../api/clients/spliceAPI'
import type { AccountSummary } from '../api/models'
import { TimePeriod } from '../api/models'
import { tokenStorage, useLogout } from '../lib/auth'
import {
  formatMoneyWithSign,
  formatPercent,
  getChangeColor,
} from '../lib/format'

export const Route = createFileRoute('/home')({ component: HomePage })

const PERIOD_LABELS: Record<TimePeriod, string> = {
  [TimePeriod.day]: 'Day',
  [TimePeriod.week]: 'Week',
  [TimePeriod.month]: 'Month',
  [TimePeriod.year]: 'Year',
}

function AccountCard({
  account,
  isLiability,
}: {
  account: AccountSummary
  isLiability: boolean
}) {
  const changePercent = formatPercent(account.changePercent)

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex justify-between items-start">
        <div>
          <p className="font-medium text-gray-900">
            {account.name || 'Unnamed Account'}
          </p>
          <p className="text-sm text-gray-500 capitalize">
            {account.subType || account.type}
          </p>
        </div>
        <div className="text-right">
          <p className="font-semibold">
            {formatMoneyWithSign(account.currentBalance)}
          </p>
          {changePercent && (
            <p
              className={`text-sm ${getChangeColor(account.changePercent, isLiability)}`}
            >
              {changePercent}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function HomePage() {
  const [period, setPeriod] = useState<TimePeriod>(TimePeriod.month)
  const logoutMutation = useLogout()
  const {
    data: dashboard,
    isLoading,
    error,
  } = useDashboardControllerGetSummary({ period })

  const handleLogout = () => {
    const refreshToken = tokenStorage.getRefreshToken()
    if (refreshToken) {
      logoutMutation.mutate({ data: { refreshToken } })
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <div className="flex items-center gap-4">
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as TimePeriod)}
              className="border border-gray-300 rounded px-3 py-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-400"
            >
              {Object.values(TimePeriod).map((p) => (
                <option key={p} value={p}>
                  {PERIOD_LABELS[p]}
                </option>
              ))}
            </select>
            <button
              onClick={handleLogout}
              disabled={logoutMutation.isPending}
              className="bg-gray-800 text-white px-4 py-2 rounded hover:bg-gray-700 disabled:opacity-50"
            >
              {logoutMutation.isPending ? 'Logging out...' : 'Logout'}
            </button>
          </div>
        </div>

        {isLoading && <p>Loading dashboard...</p>}
        {error ? (
          <p className="text-red-500">
            Error loading dashboard:{' '}
            {error instanceof Error ? error.message : 'Unknown error'}
          </p>
        ) : null}

        {dashboard && (
          <>
            <div className="bg-white border border-gray-200 rounded-lg p-6 mb-8">
              <p className="text-sm text-gray-500 mb-1">Net Worth</p>
              <p className="text-3xl font-bold">
                {formatMoneyWithSign(dashboard.netWorth)}
              </p>
              {dashboard.changePercent !== null && (
                <p
                  className={`text-sm ${getChangeColor(dashboard.changePercent, false)}`}
                >
                  {formatPercent(dashboard.changePercent)} from last{' '}
                  {PERIOD_LABELS[dashboard.comparisonPeriod].toLowerCase()}
                </p>
              )}
            </div>

            <div className="grid md:grid-cols-2 gap-8">
              <div>
                <h2 className="text-lg font-semibold mb-4">Assets</h2>
                <div className="space-y-3">
                  {dashboard.assets.length === 0 ? (
                    <p className="text-gray-500">No assets</p>
                  ) : (
                    dashboard.assets.map((account) => (
                      <AccountCard
                        key={account.id}
                        account={account}
                        isLiability={false}
                      />
                    ))
                  )}
                </div>
              </div>

              <div>
                <h2 className="text-lg font-semibold mb-4">Liabilities</h2>
                <div className="space-y-3">
                  {dashboard.liabilities.length === 0 ? (
                    <p className="text-gray-500">No liabilities</p>
                  ) : (
                    dashboard.liabilities.map((account) => (
                      <AccountCard
                        key={account.id}
                        account={account}
                        isLiability={true}
                      />
                    ))
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
