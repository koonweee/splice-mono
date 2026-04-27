import { MantineProvider } from '@mantine/core'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { McpConnectionSection } from './McpConnectionSection'
import type * as ApiAxios from '../../api/axios'

const mockFns = vi.hoisted(() => ({
  resolveApiBaseUrlMock: vi.fn(),
}))

vi.mock('../../api/axios', async () => {
  const actual: typeof ApiAxios = await vi.importActual('../../api/axios')

  return {
    ...actual,
    resolveApiBaseUrl: mockFns.resolveApiBaseUrlMock,
  }
})

function renderSection() {
  return render(
    <MantineProvider>
      <McpConnectionSection />
    </MantineProvider>,
  )
}

beforeEach(() => {
  mockFns.resolveApiBaseUrlMock.mockReturnValue('https://splice-api.example.com')

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
      writeText: vi.fn().mockResolvedValue(undefined),
    },
    configurable: true,
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('McpConnectionSection', () => {
  it('renders the MCP endpoint and bearer-token config snippet', () => {
    renderSection()

    expect(screen.getByTestId('mcp-endpoint').textContent).toContain(
      'https://splice-api.example.com/mcp',
    )
    expect(screen.getByTestId('mcp-config').textContent).toContain(
      '"url": "https://splice-api.example.com/mcp"',
    )
    expect(screen.getByTestId('mcp-config').textContent).toContain(
      '"Authorization": "Bearer splice_pat_..."',
    )
  })

  it('copies the endpoint', async () => {
    renderSection()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /copy endpoint/i }))
    })

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      'https://splice-api.example.com/mcp',
    )
    expect(screen.getByTestId('mcp-copy-feedback').textContent).toBe(
      'Endpoint copied.',
    )
  })

  it('copies the config snippet', async () => {
    renderSection()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /copy config/i }))
    })

    expect(
      String(vi.mocked(navigator.clipboard.writeText).mock.calls[0][0]),
    ).toContain('"Authorization": "Bearer splice_pat_..."')
    expect(screen.getByTestId('mcp-copy-feedback').textContent).toBe(
      'Config copied.',
    )
  })
})
