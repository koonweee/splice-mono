import { MantineProvider, Title } from '@mantine/core'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SettingsPage } from './settings'
import type * as ReactQuery from '@tanstack/react-query'
import type * as SpliceAPI from '../../api/clients/spliceAPI'

const mockFns = vi.hoisted(() => ({
  useQueryClientMock: vi.fn(),
  useUserControllerMeMock: vi.fn(),
  useUserControllerUpdateSettingsMock: vi.fn(),
  personalAccessTokenSectionMock: vi.fn(),
  mcpConnectionSectionMock: vi.fn(),
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
      currency: string | null
      timezone: string | null
      hideZeroBalanceAccounts?: boolean | null
    }
  } | null
  isLoading: boolean
  error: Error | null
}

let updateSettingsState: {
  mutate: ReturnType<typeof vi.fn>
  isPending: boolean
  isError: boolean
  isSuccess: boolean
}

function renderSettingsPage() {
  return render(
    <MantineProvider>
      <SettingsPage />
    </MantineProvider>,
  )
}

beforeEach(() => {
  queryClientState = {
    invalidateQueries: vi.fn(),
  }

  meState = {
    data: {
      settings: {
        currency: 'USD',
        timezone: 'UTC',
        hideZeroBalanceAccounts: false,
      },
    },
    isLoading: false,
    error: null,
  }

  updateSettingsState = {
    mutate: vi.fn(),
    isPending: false,
    isError: false,
    isSuccess: false,
  }

  mockFns.useQueryClientMock.mockImplementation(() => queryClientState)
  mockFns.useUserControllerMeMock.mockImplementation(() => meState)
  mockFns.useUserControllerUpdateSettingsMock.mockImplementation(
    () => updateSettingsState,
  )

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
  it('keeps the PAT and MCP sections after the existing settings card', () => {
    renderSettingsPage()

    expect(
      screen.getByRole('heading', { name: /^settings$/i, level: 1 }),
    ).toBeTruthy()
    expect(
      screen.getByRole('heading', { name: /personal access tokens/i, level: 3 }),
    ).toBeTruthy()
    expect(
      screen.getByRole('heading', { name: /mcp connection/i, level: 3 }),
    ).toBeTruthy()

    const settingsCard = screen.getByTestId('settings-card')
    const patSection = screen.getByTestId('pat-section')
    const mcpSection = screen.getByTestId('mcp-section')

    expect(
      settingsCard.compareDocumentPosition(patSection) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(
      patSection.compareDocumentPosition(mcpSection) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
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
        currency: 'USD',
        timezone: 'UTC',
        hideZeroBalanceAccounts: true,
      },
    })
  })
})
