import { MantineProvider } from '@mantine/core'
import { act } from '@testing-library/react'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { beforeEach, expect, it, vi } from 'vitest'
import { TimePeriod } from '../lib/types'
import { NetWorthCard } from './NetWorthCard'
import type { ComponentProps } from 'react'

vi.mock('./LazyChart', () => ({
  LazyChart: () => <div aria-label="Loaded chart">Chart ready</div>,
}))

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  })
})

const money = {
  money: { amount: '12345', currency: 'USD' },
  sign: 'positive' as const,
}
const ready = {
  chartLoading: false,
  chartData: [{ date: '2026-09-05', label: 'Sep 5', value: 123.45, money }],
}
function card(props: Partial<ComponentProps<typeof NetWorthCard>>) {
  return (
    <MantineProvider>
      <NetWorthCard
        balancesHidden={false}
        netWorth={money}
        onToggleBalancesHidden={() => {}}
        comparisonPeriod={TimePeriod.month}
        {...props}
      />
    </MantineProvider>
  )
}

it.each(['pending', 'ready', 'failed'])(
  'preserves the server-rendered summary when chart state changes from %s before hydration',
  async (serverState) => {
    const container = document.createElement('div')
    document.body.append(container)
    container.innerHTML = renderToString(
      card(
        serverState === 'pending'
          ? { chartLoading: true }
          : serverState === 'ready'
            ? ready
            : { chartError: true },
      ),
    )
    const summaryNode = container.querySelector('h2')
    expect(summaryNode?.textContent).toBe('$123.45')
    const onRecoverableError = vi.fn()
    let root: ReturnType<typeof hydrateRoot> | undefined
    try {
      await act(async () => {
        root = hydrateRoot(container, card(ready), { onRecoverableError })
        await Promise.resolve()
      })
      expect(onRecoverableError).not.toHaveBeenCalled()
      expect(container.querySelector('h2')).toBe(summaryNode)
      expect(
        container.querySelector('[aria-label="Loaded chart"]'),
      ).toBeTruthy()
    } finally {
      act(() => root?.unmount())
      container.remove()
    }
  },
)
