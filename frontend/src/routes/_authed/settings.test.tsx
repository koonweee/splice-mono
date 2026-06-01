import { MantineProvider, Title } from '@mantine/core'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SettingsPage } from './settings'
import type * as ReactQuery from '@tanstack/react-query'
import type * as SpliceAPI from '../../api/clients/spliceAPI'

const mockFns = vi.hoisted(() => ({
  useQueryClientMock: vi.fn(),
  useUserControllerMeMock: vi.fn(),
  useUserControllerUpdateSettingsMock: vi.fn(),
  analysisRulesSectionMock: vi.fn(),
  categorizationRulesSectionMock: vi.fn(),
  customCategoriesSectionMock: vi.fn(),
  personalAccessTokenSectionMock: vi.fn(),
  mcpConnectionSectionMock: vi.fn(),
  loadCurrentDeviceNotificationStateMock: vi.fn(),
  enableCurrentDeviceNotificationsMock: vi.fn(),
  disableCurrentDeviceNotificationsMock: vi.fn(),
  updateNewSyncedTransactionsPreferenceMock: vi.fn(),
}))

vi.mock('@tanstack/react-query', async () => {
  const actual: typeof ReactQuery = await vi.importActual(
    '@tanstack/react-query',
  )

  return {
    ...actual,
    useQueryClient: mockFns.useQueryClientMock,
  }
})

vi.mock('../../api/clients/spliceAPI', async () => {
  const actual: typeof SpliceAPI = await vi.importActual(
    '../../api/clients/spliceAPI',
  )

  return {
    ...actual,
    useUserControllerMe: mockFns.useUserControllerMeMock,
    useUserControllerUpdateSettings:
      mockFns.useUserControllerUpdateSettingsMock,
  }
})

vi.mock('../../lib/notifications/browser-push', () => ({
  loadCurrentDeviceNotificationState:
    mockFns.loadCurrentDeviceNotificationStateMock,
  enableCurrentDeviceNotifications:
    mockFns.enableCurrentDeviceNotificationsMock,
  disableCurrentDeviceNotifications:
    mockFns.disableCurrentDeviceNotificationsMock,
  updateNewSyncedTransactionsPreference:
    mockFns.updateNewSyncedTransactionsPreferenceMock,
}))

vi.mock('../../components/settings/PersonalAccessTokenSection', () => ({
  PersonalAccessTokenSection: () => {
    mockFns.personalAccessTokenSectionMock()

    return (
      <div data-testid="pat-section">
        <Title order={3}>Personal access tokens</Title>
      </div>
    )
  },
}))

vi.mock('../../components/settings/CustomCategoriesSection', () => ({
  CustomCategoriesSection: () => {
    mockFns.customCategoriesSectionMock()

    return <div data-testid="custom-categories-section">Custom categories</div>
  },
}))

vi.mock('../../components/settings/AnalysisRulesSection', () => ({
  AnalysisRulesSection: (props: unknown) => {
    mockFns.analysisRulesSectionMock(props)

    return <div data-testid="analysis-rules-section">Analysis rules</div>
  },
}))

vi.mock('../../components/settings/CategorizationRulesSection', () => ({
  CategorizationRulesSection: () => {
    mockFns.categorizationRulesSectionMock()

    return (
      <div data-testid="categorization-rules-section">Categorization rules</div>
    )
  },
}))

vi.mock('../../components/settings/McpConnectionSection', () => ({
  McpConnectionSection: () => {
    mockFns.mcpConnectionSectionMock()

    return (
      <div data-testid="mcp-section">
        <Title order={3}>MCP connection</Title>
      </div>
    )
  },
}))

let queryClientState: {
  invalidateQueries: ReturnType<typeof vi.fn>
}

let meState: {
  data: {
    settings: {
      theme?: string | null
      currency: string | null
      timezone: string | null
      hideZeroBalanceAccounts?: boolean | null
      neutralizationLookaroundDays?: number | null
      analysisSankeyEnabled?: boolean | null
      notifications?: {
        transactions?: {
          newSyncedTransactions?: boolean | null
        } | null
      } | null
    }
  } | null
  isLoading: boolean
  error: Error | null
}

let updateSettingsState: {
  mutate: ReturnType<typeof vi.fn>
  mutateAsync: ReturnType<typeof vi.fn>
  isPending: boolean
  isError: boolean
  isSuccess: boolean
}

let updateAnalysisSankeyState: {
  mutate: ReturnType<typeof vi.fn>
  mutateAsync: ReturnType<typeof vi.fn>
  isPending: boolean
  isError: boolean
  isSuccess: boolean
}

let updateSettingsHookCallCount = 0

let localStorageState: {
  getItem: ReturnType<typeof vi.fn>
  setItem: ReturnType<typeof vi.fn>
  removeItem: ReturnType<typeof vi.fn>
  clear: ReturnType<typeof vi.fn>
}

function renderSettingsPage() {
  return render(
    <MantineProvider>
      <SettingsPage />
    </MantineProvider>,
  )
}

function installMockLocalStorage() {
  const store = new Map<string, string>()
  localStorageState = {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value)
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key)
    }),
    clear: vi.fn(() => {
      store.clear()
    }),
  }

  Object.defineProperty(window, 'localStorage', {
    value: localStorageState,
    configurable: true,
  })
}

beforeEach(() => {
  window.history.replaceState(null, '', '/settings')
  installMockLocalStorage()

  queryClientState = {
    invalidateQueries: vi.fn(),
  }

  meState = {
    data: {
      settings: {
        theme: 'splice-dark',
        currency: 'USD',
        timezone: 'UTC',
        hideZeroBalanceAccounts: false,
        neutralizationLookaroundDays: 60,
        analysisSankeyEnabled: false,
        notifications: {
          transactions: {
            newSyncedTransactions: true,
          },
        },
      },
    },
    isLoading: false,
    error: null,
  }

  updateSettingsState = {
    mutate: vi.fn(),
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false,
    isError: false,
    isSuccess: false,
  }
  updateAnalysisSankeyState = {
    mutate: vi.fn(),
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false,
    isError: false,
    isSuccess: false,
  }
  updateSettingsHookCallCount = 0

  mockFns.useQueryClientMock.mockImplementation(() => queryClientState)
  mockFns.useUserControllerMeMock.mockImplementation(() => meState)
  mockFns.useUserControllerUpdateSettingsMock.mockImplementation(() => {
    const mutation =
      updateSettingsHookCallCount % 2 === 0
        ? updateSettingsState
        : updateAnalysisSankeyState
    updateSettingsHookCallCount += 1
    return mutation
  })
  mockFns.loadCurrentDeviceNotificationStateMock.mockResolvedValue({
    supported: 'supported',
    subscribed: false,
  })
  mockFns.enableCurrentDeviceNotificationsMock.mockResolvedValue(undefined)
  mockFns.disableCurrentDeviceNotificationsMock.mockResolvedValue(undefined)
  mockFns.updateNewSyncedTransactionsPreferenceMock.mockResolvedValue(undefined)

  Object.defineProperty(window, 'matchMedia', {
    value: vi.fn().mockImplementation(() => ({
      matches: false,
      media: '',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
    configurable: true,
  })

  Object.defineProperty(window, 'ResizeObserver', {
    value: vi.fn().mockImplementation(() => ({
      observe: vi.fn(),
      unobserve: vi.fn(),
      disconnect: vi.fn(),
    })),
    configurable: true,
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('SettingsPage', () => {
  it('shows settings sections in separate tabs', () => {
    renderSettingsPage()

    expect(
      screen.getByRole('heading', { name: /^settings$/i, level: 1 }),
    ).toBeTruthy()
    expect(
      screen
        .getByRole('tab', { name: /general/i })
        .getAttribute('aria-selected'),
    ).toBe('true')
    expect(screen.getByTestId('settings-card')).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: /access/i }))
    expect(
      screen
        .getByRole('tab', { name: /access/i })
        .getAttribute('aria-selected'),
    ).toBe('true')
    expect(
      screen.getByRole('heading', {
        name: /personal access tokens/i,
        level: 3,
      }),
    ).toBeTruthy()
    expect(window.location.search).toBe('?tab=access')

    fireEvent.click(screen.getByRole('tab', { name: /notifications/i }))
    expect(
      screen
        .getByRole('tab', { name: /notifications/i })
        .getAttribute('aria-selected'),
    ).toBe('true')
    expect(
      screen.getByRole('switch', {
        name: /enable notifications on this device/i,
      }),
    ).toBeTruthy()
    expect(
      screen.getByRole('switch', { name: /new uncategorized transactions/i }),
    ).toBeTruthy()
    expect(window.location.search).toBe('?tab=notifications')

    fireEvent.click(screen.getByRole('tab', { name: /categories/i }))
    expect(
      screen
        .getByRole('tab', { name: /categories/i })
        .getAttribute('aria-selected'),
    ).toBe('true')
    expect(screen.getByTestId('custom-categories-section')).toBeTruthy()
    expect(window.location.search).toBe('?tab=categories')

    fireEvent.click(screen.getByRole('tab', { name: /analysis/i }))
    expect(
      screen
        .getByRole('tab', { name: /analysis/i })
        .getAttribute('aria-selected'),
    ).toBe('true')
    expect(screen.getByTestId('analysis-rules-section')).toBeTruthy()
    expect(
      screen.getByRole('switch', {
        name: /use sankey diagram on analysis/i,
      }),
    ).toBeTruthy()
    expect(mockFns.analysisRulesSectionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        lookaroundSetting: expect.objectContaining({
          value: 60,
          onSave: expect.any(Function),
        }),
      }),
    )
    expect(window.location.search).toBe('?tab=analysis')

    fireEvent.click(screen.getByRole('tab', { name: /categorization/i }))
    expect(
      screen
        .getByRole('tab', { name: /categorization/i })
        .getAttribute('aria-selected'),
    ).toBe('true')
    expect(screen.getByTestId('categorization-rules-section')).toBeTruthy()
    expect(window.location.search).toBe('?tab=categorization')

    fireEvent.click(screen.getByRole('tab', { name: /mcp/i }))
    expect(
      screen.getByRole('tab', { name: /mcp/i }).getAttribute('aria-selected'),
    ).toBe('true')
    expect(
      screen.getByRole('heading', { name: /mcp connection/i, level: 3 }),
    ).toBeTruthy()
    expect(window.location.search).toBe('?tab=mcp')
  })

  it('saves the hide zero balance accounts setting', () => {
    renderSettingsPage()

    fireEvent.click(
      screen.getByRole('switch', { name: /hide 0 balance accounts/i }),
    )
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))

    expect(updateSettingsState.mutate).toHaveBeenCalledTimes(1)
    expect(updateSettingsState.mutate.mock.calls[0][0]).toEqual({
      data: {
        theme: 'splice-dark',
        currency: 'USD',
        timezone: 'UTC',
        hideZeroBalanceAccounts: true,
      },
    })
  })

  it('saves the selected theme setting', () => {
    renderSettingsPage()

    localStorageState.setItem.mockClear()
    fireEvent.click(screen.getByRole('radio', { name: /dracula/i }))

    expect(localStorageState.setItem).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))

    expect(updateSettingsState.mutate).toHaveBeenCalledTimes(1)
    expect(updateSettingsState.mutate.mock.calls[0][0]).toEqual({
      data: {
        theme: 'dracula',
        currency: 'USD',
        timezone: 'UTC',
        hideZeroBalanceAccounts: false,
      },
    })
  })

  it('saves the analysis Sankey setting immediately and invalidates user data', async () => {
    renderSettingsPage()

    fireEvent.click(screen.getByRole('tab', { name: /analysis/i }))
    fireEvent.click(
      screen.getByRole('switch', {
        name: /use sankey diagram on analysis/i,
      }),
    )

    await waitFor(() => {
      expect(updateAnalysisSankeyState.mutateAsync).toHaveBeenCalledWith({
        data: { analysisSankeyEnabled: true },
      })
    })
    expect(queryClientState.invalidateQueries).toHaveBeenCalledTimes(1)
  })

  it('initializes the analysis Sankey switch from user settings', async () => {
    meState.data = {
      settings: {
        ...meState.data!.settings,
        analysisSankeyEnabled: true,
      },
    }
    renderSettingsPage()

    fireEvent.click(screen.getByRole('tab', { name: /analysis/i }))
    const sankeySwitch = screen.getByRole('switch', {
      name: /use sankey diagram on analysis/i,
    })

    await waitFor(() => {
      expect((sankeySwitch as HTMLInputElement).checked).toBe(true)
    })
  })

  it('disables the analysis Sankey switch while its save is pending', () => {
    updateAnalysisSankeyState.isPending = true
    renderSettingsPage()

    fireEvent.click(screen.getByRole('tab', { name: /analysis/i }))

    const sankeySwitch = screen.getByRole('switch', {
      name: /use sankey diagram on analysis/i,
    })

    expect((sankeySwitch as HTMLInputElement).disabled).toBe(true)
  })

  it('rolls back the analysis Sankey switch when save fails', async () => {
    updateAnalysisSankeyState.mutateAsync.mockRejectedValue(
      new Error('Save failed'),
    )
    renderSettingsPage()

    fireEvent.click(screen.getByRole('tab', { name: /analysis/i }))
    const sankeySwitch = screen.getByRole('switch', {
      name: /use sankey diagram on analysis/i,
    })

    fireEvent.click(sankeySwitch)

    await screen.findByText('Failed to save Sankey diagram setting')
    expect((sankeySwitch as HTMLInputElement).checked).toBe(false)
  })

  it('enables notifications on the current device and refreshes user data', async () => {
    renderSettingsPage()

    fireEvent.click(screen.getByRole('tab', { name: /notifications/i }))
    fireEvent.click(
      screen.getByRole('switch', {
        name: /enable notifications on this device/i,
      }),
    )

    await waitFor(() => {
      expect(
        mockFns.enableCurrentDeviceNotificationsMock,
      ).toHaveBeenCalledTimes(1)
    })
    expect(queryClientState.invalidateQueries).toHaveBeenCalled()
  })

  it('updates the new uncategorized transactions notification preference', async () => {
    meState.data = {
      settings: {
        ...meState.data!.settings,
        notifications: {
          transactions: {
            newSyncedTransactions: false,
          },
        },
      },
    }
    renderSettingsPage()

    fireEvent.click(screen.getByRole('tab', { name: /notifications/i }))
    fireEvent.click(
      screen.getByRole('switch', { name: /new uncategorized transactions/i }),
    )

    await waitFor(() => {
      expect(
        mockFns.updateNewSyncedTransactionsPreferenceMock,
      ).toHaveBeenCalledWith(true)
    })
    expect(queryClientState.invalidateQueries).toHaveBeenCalled()
  })

  it('shows unsupported notification state without breaking settings', async () => {
    mockFns.loadCurrentDeviceNotificationStateMock.mockResolvedValueOnce({
      supported: 'unsupported',
      subscribed: false,
    })
    renderSettingsPage()

    fireEvent.click(screen.getByRole('tab', { name: /notifications/i }))

    await screen.findByText('This browser does not support push notifications.')
    expect(
      screen
        .getByRole('switch', {
          name: /enable notifications on this device/i,
        })
        .hasAttribute('disabled'),
    ).toBe(true)
  })

  it('persists the selected theme after save succeeds', () => {
    updateSettingsState.mutate.mockImplementation((_variables, options) => {
      options?.onSuccess?.({}, undefined, undefined)
    })
    renderSettingsPage()

    localStorageState.setItem.mockClear()
    fireEvent.click(screen.getByRole('radio', { name: /oled black/i }))
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))

    expect(localStorageState.setItem).toHaveBeenCalledWith(
      'splice_theme_preset',
      'oled-black',
    )
  })

  it('reverts the theme preview when save fails', () => {
    const dispatchEventSpy = vi.spyOn(window, 'dispatchEvent')
    updateSettingsState.mutate.mockImplementation((_variables, options) => {
      options?.onError?.(new Error('Save failed'), undefined, undefined)
    })
    renderSettingsPage()

    dispatchEventSpy.mockClear()
    localStorageState.setItem.mockClear()
    fireEvent.click(screen.getByRole('radio', { name: /dracula/i }))
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))

    expect(localStorageState.setItem).not.toHaveBeenCalled()
    expect(
      dispatchEventSpy.mock.calls
        .map(([event]) => event)
        .filter(
          (event): event is CustomEvent<{ theme: string }> =>
            event instanceof CustomEvent,
        )
        .map((event) => event.detail.theme),
    ).toEqual(['dracula', 'splice-dark'])
  })
})
