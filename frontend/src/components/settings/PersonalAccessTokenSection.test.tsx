import { MantineProvider } from '@mantine/core'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PersonalAccessTokenSection } from './PersonalAccessTokenSection'
import type * as SpliceAPI from '../../api/clients/spliceAPI'
import type * as ReactQuery from '@tanstack/react-query'
import type { PersonalAccessToken } from '../../api/models'

type ListTokensState = {
  data?: Array<PersonalAccessToken>
  isPending: boolean
  isError: boolean
  error: Error | null
  refetch: ReturnType<typeof vi.fn>
}

type MutationState = {
  mutate: ReturnType<typeof vi.fn>
  isPending: boolean
  isError: boolean
  error: Error | null
}

type QueryClientState = {
  setQueryData: ReturnType<typeof vi.fn>
  invalidateQueries: ReturnType<typeof vi.fn>
}

const mockFns = vi.hoisted(() => ({
  listTokensHook: vi.fn(),
  createTokenHook: vi.fn(),
  revokeTokenHook: vi.fn(),
  useQueryClientMock: vi.fn(),
}))

let listTokensState: ListTokensState
let createTokenState: MutationState
let revokeTokenState: MutationState
let queryClientState: QueryClientState

vi.mock('../../api/clients/spliceAPI', async () => {
  const actual: typeof SpliceAPI = await vi.importActual(
    '../../api/clients/spliceAPI',
  )

  return {
    ...actual,
    useUserControllerListTokens: mockFns.listTokensHook,
    useUserControllerCreateToken: mockFns.createTokenHook,
    useUserControllerRevokeToken: mockFns.revokeTokenHook,
    getUserControllerListTokensQueryKey:
      actual.getUserControllerListTokensQueryKey,
  }
})

vi.mock('@tanstack/react-query', async () => {
  const actual: typeof ReactQuery = await vi.importActual(
    '@tanstack/react-query',
  )

  return {
    ...actual,
    useQueryClient: mockFns.useQueryClientMock,
  }
})

function makeToken(
  overrides: Partial<PersonalAccessToken> & Pick<PersonalAccessToken, 'id' | 'name'>,
): PersonalAccessToken {
  return {
    id: overrides.id,
    name: overrides.name,
    tokenPreview: overrides.tokenPreview ?? 'splic...abcd',
    lastUsedAt: overrides.lastUsedAt ?? null,
    expiresAt: overrides.expiresAt ?? null,
    revokedAt: overrides.revokedAt ?? null,
    createdAt: overrides.createdAt ?? '2026-03-22T00:00:00.000Z',
  }
}

function makeCreateResponse(
  overrides: {
    id: string
    name: string
    token: string
  } & Partial<{ tokenPreview: string; expiresAt: string | null; createdAt: string }>,
) {
  return {
    id: overrides.id,
    name: overrides.name,
    token: overrides.token,
    tokenPreview: overrides.tokenPreview ?? 'splic...new1',
    expiresAt: overrides.expiresAt ?? null,
    createdAt: overrides.createdAt ?? '2026-03-22T00:00:00.000Z',
  }
}

function renderSection() {
  return render(
    <MantineProvider>
      <PersonalAccessTokenSection />
    </MantineProvider>,
  )
}

beforeEach(() => {
  listTokensState = {
    data: [],
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }
  createTokenState = {
    mutate: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
  }
  revokeTokenState = {
    mutate: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
  }
  queryClientState = {
    setQueryData: vi.fn(),
    invalidateQueries: vi.fn(),
  }

  mockFns.listTokensHook.mockImplementation(() => listTokensState)
  mockFns.createTokenHook.mockImplementation(() => createTokenState)
  mockFns.revokeTokenHook.mockImplementation(() => revokeTokenState)
  mockFns.useQueryClientMock.mockImplementation(() => queryClientState)

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

  Object.defineProperty(navigator, 'clipboard', {
    value: {
      writeText: vi.fn(),
    },
    configurable: true,
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('PersonalAccessTokenSection', () => {
  it('shows a section loader while the PAT query is pending', () => {
    listTokensState.isPending = true

    renderSection()

    expect(screen.getByTestId('pat-section-loader')).toBeTruthy()
    expect(screen.queryByText(/personal access tokens/i)).toBeNull()
  })

  it('shows a retryable section error when the token list fetch fails', () => {
    listTokensState.isError = true
    listTokensState.error = new Error('fetch failed')

    renderSection()

    expect(
      screen.getByText(/failed to load active tokens/i),
    ).toBeTruthy()
    expect(screen.getByLabelText(/token name/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /create token/i })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /retry/i }))

    expect(listTokensState.refetch).toHaveBeenCalledTimes(1)
  })

  it('shows an empty state when the active token list is empty', () => {
    listTokensState.data = []

    renderSection()

    expect(
      screen.getByText(/no active personal access tokens/i),
    ).toBeTruthy()
  })

  it('shows a one-time reveal panel after a successful create', () => {
    listTokensState.data = []

    renderSection()

    fireEvent.change(screen.getByLabelText(/token name/i), {
      target: { value: 'Integration token' },
    })
    fireEvent.click(screen.getByRole('button', { name: /create token/i }))

    expect(createTokenState.mutate).toHaveBeenCalledTimes(1)
    expect(createTokenState.mutate.mock.calls[0][0]).toEqual({
      data: { name: 'Integration token' },
    })

    act(() => {
      createTokenState.mutate.mock.calls[0][1].onSuccess?.(
        makeCreateResponse({
          id: 'pat-new',
          name: 'Integration token',
          token: 'raw-token-value',
        }),
      )
    })

    expect(screen.getByText(/raw-token-value/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /copy token/i })).toBeTruthy()
  })

  it('keeps the create form and reveal panel visible when the token list fetch fails', () => {
    listTokensState.isError = true
    listTokensState.error = new Error('fetch failed')

    renderSection()

    fireEvent.change(screen.getByLabelText(/token name/i), {
      target: { value: 'Integration token' },
    })
    fireEvent.click(screen.getByRole('button', { name: /create token/i }))

    act(() => {
      createTokenState.mutate.mock.calls[0][1].onSuccess?.(
        makeCreateResponse({
          id: 'pat-new',
          name: 'Integration token',
          token: 'raw-token-value',
        }),
      )
    })

    expect(screen.getByTestId('pat-section-error')).toBeTruthy()
    expect(screen.getByTestId('pat-reveal-panel')).toBeTruthy()
    expect(screen.getByText(/raw-token-value/)).toBeTruthy()
  })

  it('shows a card-level alert on create failure and preserves the token name', () => {
    listTokensState.data = []

    renderSection()

    const input = screen.getByTestId('pat-name-input')
    fireEvent.change(input, { target: { value: '  Integration token  ' } })
    fireEvent.click(screen.getByRole('button', { name: /create token/i }))

    act(() => {
      createTokenState.mutate.mock.calls[0][1].onError?.(new Error('boom'))
    })

    expect(screen.getByText(/unable to create token/i)).toBeTruthy()
    expect(screen.getByTestId('pat-name-input')).toHaveProperty(
      'value',
      '  Integration token  ',
    )
  })

  it('disables the token name input and create button while create is pending', () => {
    listTokensState.data = []
    createTokenState.isPending = true

    renderSection()

    expect(screen.getByTestId('pat-name-input')).toHaveProperty('disabled', true)
    expect(screen.getByRole('button', { name: /create token/i })).toHaveProperty(
      'disabled',
      true,
    )
  })

  it('disables create for blank or whitespace-only token names', () => {
    listTokensState.data = []

    renderSection()

    const createButton = screen.getByRole('button', { name: /create token/i })
    expect(createButton).toHaveProperty('disabled', true)

    fireEvent.change(screen.getByLabelText(/token name/i), {
      target: { value: '   ' },
    })

    expect(screen.getByRole('button', { name: /create token/i })).toHaveProperty(
      'disabled',
      true,
    )
  })

  it('renders each token usage line with the shared last-used helper', () => {
    const recentToken = makeToken({
      id: 'pat-1',
      name: 'Build token',
      lastUsedAt: '2026-03-21T00:00:00.000Z',
    })
    const unusedToken = makeToken({
      id: 'pat-2',
      name: 'Deploy token',
      lastUsedAt: null,
    })
    listTokensState.data = [recentToken, unusedToken]

    renderSection()

    expect(screen.getByText(/last used/i)).toBeTruthy()
    expect(screen.getByText(/never used/i)).toBeTruthy()
  })

  it('shows an error feedback message when copying the revealed token fails', async () => {
    listTokensState.data = []

    renderSection()

    fireEvent.change(screen.getByLabelText(/token name/i), {
      target: { value: 'Integration token' },
    })
    fireEvent.click(screen.getByRole('button', { name: /create token/i }))

    act(() => {
      createTokenState.mutate.mock.calls[0][1].onSuccess?.(
        makeCreateResponse({
          id: 'pat-new',
          name: 'Integration token',
          token: 'raw-token-value',
        }),
      )
    })

    vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(
      new Error('clipboard blocked'),
    )

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /copy token/i }))
    })

    expect(screen.getByText(/unable to copy token/i)).toBeTruthy()
    expect(screen.queryByText(/copied to clipboard/i)).toBeNull()
    expect(screen.queryByText(/copied token text/i)).toBeNull()
  })

  it('wraps the revealed token text to avoid horizontal overflow', () => {
    listTokensState.data = []

    renderSection()

    fireEvent.change(screen.getByLabelText(/token name/i), {
      target: { value: 'Integration token' },
    })
    fireEvent.click(screen.getByRole('button', { name: /create token/i }))

    act(() => {
      createTokenState.mutate.mock.calls[0][1].onSuccess?.(
        makeCreateResponse({
          id: 'pat-new',
          name: 'Integration token',
          token: 'raw-token-value-with-a-long-preview-that-should-wrap-on-small-screens',
        }),
      )
    })

    expect(screen.getByTestId('pat-revealed-token').getAttribute('style')).toContain(
      'overflow-wrap: anywhere',
    )
    expect(screen.getByTestId('pat-revealed-token').getAttribute('style')).toContain(
      'white-space: pre-wrap',
    )
    expect(screen.getByTestId('pat-revealed-token').getAttribute('style')).toContain(
      'word-break: break-word',
    )
  })

  it('removes a token from the visible list after a successful revoke', () => {
    const token = makeToken({ id: 'pat-1', name: 'Build token' })
    listTokensState.data = [token]

    const view = renderSection()

    fireEvent.click(screen.getByRole('button', { name: /revoke build token/i }))

    expect(revokeTokenState.mutate).toHaveBeenCalledTimes(1)
    expect(revokeTokenState.mutate.mock.calls[0][0]).toEqual({ id: 'pat-1' })

    act(() => {
      revokeTokenState.mutate.mock.calls[0][1].onSuccess?.()
      listTokensState.data = []
    })

    view.rerender(
      <MantineProvider>
        <PersonalAccessTokenSection />
      </MantineProvider>,
    )

    expect(screen.queryByTestId('pat-token-row-pat-1')).toBeNull()
    expect(queryClientState.setQueryData).toHaveBeenCalled()
  })

  it('keeps a revoked token visible and shows inline feedback on revoke failure', () => {
    const token = makeToken({ id: 'pat-1', name: 'Build token' })
    listTokensState.data = [token]

    renderSection()

    fireEvent.click(screen.getByRole('button', { name: /revoke build token/i }))

    act(() => {
      revokeTokenState.mutate.mock.calls[0][1].onError?.(new Error('nope'))
    })

    expect(screen.getByTestId('pat-token-row-pat-1')).toBeTruthy()
    expect(screen.getByTestId('pat-revoke-error-pat-1')).toBeTruthy()
  })

  it('renders a stackable action container for mobile-friendly layout', () => {
    listTokensState.data = []

    renderSection()

    const actionContainer = screen.getByTestId('pat-form-actions')
    expect(actionContainer).toBeTruthy()
    expect(actionContainer.textContent).toContain('Create token')
  })
})
