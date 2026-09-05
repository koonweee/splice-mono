import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useState } from 'react'

// Dynamic imports keep each test's document identity isolated, as on a real reload.
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.resetModules()
})

function AccountEditor() {
  const { data } = useQuery({
    queryKey: ['/account'],
    queryFn: () => Promise.resolve('unexpected fetch'),
    enabled: false,
  })
  const [draft, setDraft] = useState('Alice private draft')
  return (
    <>
      <p>{data}</p>
      <input
        aria-label="Private notes"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
    </>
  )
}

describe('mounted private session boundary', () => {
  it('unmounts retained query results and local drafts immediately on logout', async () => {
    const { PrivateSessionBoundary } = await import('./PrivateSessionBoundary')
    const {
      bindBrowserQueryClient,
      clearPrivateCaches,
      acceptBrowserIdentity,
      authDocumentNavigation,
    } = await import('../lib/auth-generation')
    const replace = vi
      .spyOn(authDocumentNavigation, 'replace')
      .mockImplementation(() => {})
    const client = new QueryClient()
    bindBrowserQueryClient(client)
    client.setQueryData(['/user/me'], { id: 'alice' })
    client.setQueryData(['/account'], 'Alice balance $123')
    render(
      <QueryClientProvider client={client}>
        <PrivateSessionBoundary>
          <AccountEditor />
        </PrivateSessionBoundary>
      </QueryClientProvider>,
    )
    fireEvent.change(screen.getByLabelText('Private notes'), {
      target: { value: 'Unsaved secret' },
    })
    expect(screen.getByText('Alice balance $123')).toBeTruthy()
    // Logout response is intentionally still pending; clearing is the privacy boundary.
    act(() => clearPrivateCaches(false))
    expect(screen.queryByText('Alice balance $123')).toBeNull()
    expect(screen.queryByLabelText('Private notes')).toBeNull()
    expect(screen.getByRole('status').textContent).toBe('Updating session…')
    expect(replace).not.toHaveBeenCalled()
    act(() => {
      client.setQueryData(['/account'], 'Late Alice response')
      acceptBrowserIdentity('bob')
    })
    expect(screen.queryByText('Late Alice response')).toBeNull()
    expect(screen.queryByDisplayValue('Unsaved secret')).toBeNull()
    expect(replace).toHaveBeenCalledOnce()
    client.clear()
  })

  it('replaces the same-tab document on a verified identity mismatch without exposing old observers', async () => {
    const { PrivateSessionBoundary } = await import('./PrivateSessionBoundary')
    const {
      bindBrowserQueryClient,
      authDocumentNavigation,
      getAuthGeneration,
    } = await import('../lib/auth-generation')
    const replace = vi
      .spyOn(authDocumentNavigation, 'replace')
      .mockImplementation(() => {})
    const client = new QueryClient()
    bindBrowserQueryClient(client)
    client.setQueryData(['/user/me'], { id: 'alice' })
    client.setQueryData(['/account'], 'Alice balance $123')
    const generation = getAuthGeneration()
    render(
      <QueryClientProvider client={client}>
        <PrivateSessionBoundary>
          <AccountEditor />
        </PrivateSessionBoundary>
      </QueryClientProvider>,
    )
    act(() => client.setQueryData(['/user/me'], { id: 'bob' }))
    expect(getAuthGeneration()).toBeGreaterThan(generation)
    expect(screen.queryByText('Alice balance $123')).toBeNull()
    expect(screen.queryByLabelText('Private notes')).toBeNull()
    expect(client.getQueryData(['/account'])).toBeUndefined()
    expect(replace).toHaveBeenCalledOnce()
    client.clear()
  })
})
