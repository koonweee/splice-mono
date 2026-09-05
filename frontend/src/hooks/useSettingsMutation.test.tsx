import {
  QueryClient,
  QueryClientProvider,
  dehydrate,
  hydrate,
} from '@tanstack/react-query'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { configureQueryPolicy } from '../lib/query-policy'
import { createMutationCache } from '../lib/query-invalidation'
import { clearPrivateCaches } from '../lib/auth-generation'
import { useSettingsMutation } from './useSettingsMutation'
import type { UpdateUserSettingsDto, UserSettings } from '../api/models'
import type { ReactNode } from 'react'

const mocks = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('../api/axios', () => ({ axios: mocks.request }))
const clients: Array<QueryClient> = []
const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve()
}
function renderControls() {
  const client: QueryClient = new QueryClient({
    mutationCache: createMutationCache(() => client),
    defaultOptions: { mutations: { retry: false } },
  })
  configureQueryPolicy(client)
  const server = new QueryClient()
  server.setQueryData(['/user/me'], {
    id: 'owner',
    email: 'owner@example.test',
    settings: {
      currency: 'USD',
      analysisSankeyEnabled: false,
      notifications: { transactions: { newSyncedTransactions: true } },
    },
  })
  hydrate(client, dehydrate(server))
  server.clear()
  clients.push(client)
  const hook = renderHook(
    () => ({
      general: useSettingsMutation(),
      notifications: useSettingsMutation(),
      sankey: useSettingsMutation(),
    }),
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    },
  )
  return { ...hook, client }
}
afterEach(() => {
  cleanup()
  clients.splice(0).forEach((client) => client.clear())
  vi.resetAllMocks()
})

describe('settings writes from independent controls', () => {
  it('serializes the backend read/merge/write and publishes full authoritative settings in order', async () => {
    const { result, client } = renderControls()
    let server: UserSettings = {
      currency: 'USD',
      analysisSankeyEnabled: false,
      notifications: { transactions: { newSyncedTransactions: true } },
    }
    const pending: Array<() => void> = []
    mocks.request.mockImplementation(
      ({ data }: { data: UpdateUserSettingsDto }) => {
        // The backend reads existing settings when the request is dispatched.
        const snapshot = { ...server, ...data }
        return new Promise<UserSettings>((resolve) =>
          pending.push(() => {
            server = snapshot
            resolve(server)
          }),
        )
      },
    )
    let general!: Promise<UserSettings>
    let notifications!: Promise<UserSettings>
    let sankey!: Promise<UserSettings>
    await act(async () => {
      general = result.current.general.mutateAsync({
        data: { currency: 'EUR' },
      })
      notifications = result.current.notifications.mutateAsync({
        data: {
          notifications: { transactions: { newSyncedTransactions: false } },
        },
      })
      await flush()
    })
    expect(mocks.request).toHaveBeenCalledTimes(1)
    await waitFor(() =>
      expect(result.current.notifications.isPaused).toBe(true),
    )
    await act(async () => {
      pending[0]()
      await general
      await flush()
    })
    expect(mocks.request).toHaveBeenCalledTimes(2)
    await act(async () => {
      sankey = result.current.sankey.mutateAsync({
        data: { analysisSankeyEnabled: true },
      })
      await flush()
    })
    expect(mocks.request).toHaveBeenCalledTimes(2)
    await waitFor(() => expect(result.current.sankey.isPaused).toBe(true))
    expect(
      client.getQueryData<{ settings: UserSettings }>(['/user/me'])?.settings
        .currency,
    ).toBe('EUR')
    await act(async () => {
      pending[1]()
      await notifications
      await flush()
    })
    expect(mocks.request).toHaveBeenCalledTimes(3)
    await act(async () => {
      pending[2]()
      await sankey
    })
    expect(client.getQueryData(['/user/me'])).toEqual({
      id: 'owner',
      email: 'owner@example.test',
      settings: {
        currency: 'EUR',
        analysisSankeyEnabled: true,
        notifications: { transactions: { newSyncedTransactions: false } },
      },
    })
  })

  it('does not dispatch a queued settings write after logout even when hook options rerender', async () => {
    const { result, rerender } = renderControls()
    let finish!: (settings: UserSettings) => void
    mocks.request.mockImplementationOnce(
      () =>
        new Promise<UserSettings>((resolve) => {
          finish = resolve
        }),
    )
    let first!: Promise<unknown>
    let queued!: Promise<unknown>
    await act(async () => {
      first = result.current.general
        .mutateAsync({ data: { currency: 'EUR' } })
        .catch((error: unknown) => error)
      queued = result.current.notifications
        .mutateAsync({
          data: {
            notifications: { transactions: { newSyncedTransactions: false } },
          },
        })
        .catch((error: unknown) => error)
      await flush()
    })
    rerender()
    clearPrivateCaches(false)
    await act(async () => {
      finish({ currency: 'EUR' })
      await first
      await queued
    })
    expect(await first).toMatchObject({ name: 'AbortError' })
    expect(await queued).toMatchObject({ name: 'AbortError' })
    expect(mocks.request).toHaveBeenCalledTimes(1)
  })
})
