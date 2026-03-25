/* @vitest-environment jsdom */

import { MantineProvider } from '@mantine/core'
import { cleanup, render, screen } from '@testing-library/react'
import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { MoneyWithSignSign } from '@/api/models'
import { AskEvidencePanel } from './AskEvidencePanel'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    ...props
  }: {
    children: ReactNode
    to: string
  } & AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}))

describe('AskEvidencePanel', () => {
  beforeAll(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
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
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('renders balance-history evidence in user-facing terms', () => {
    render(
      <MantineProvider>
        <AskEvidencePanel
          answer={{
            answerText: 'Net worth is up this month.',
            confidence: 'high',
            queryScope: {
              startDate: '2026-03-01',
              endDate: '2026-03-22',
              accountIds: ['account-1'],
              includePending: false,
              truncated: false,
            },
            evidence: {
              accounts: [],
              transactions: [],
              aggregates: [],
              matchedCount: 4,
              truncated: false,
              balanceHistory: {
                matchedCount: 4,
                truncated: false,
                currentTotal: {
                  money: { amount: 95_000, currency: 'USD' },
                  sign: MoneyWithSignSign.positive,
                },
                previousTotal: {
                  money: { amount: 90_000, currency: 'USD' },
                  sign: MoneyWithSignSign.positive,
                },
                deltaPercent: 5.56,
                pointCount: 2,
                semanticMetadata: {
                  pendingIncluded: false,
                  reconciliationApplied: true,
                  comparisonIncluded: true,
                },
              },
            },
            followups: [],
          }}
        />
      </MantineProvider>,
    )

    expect(screen.getByText('Balance history')).toBeTruthy()
    expect(screen.getByText('Current total: $950.00')).toBeTruthy()
    expect(screen.getByText('Previous total: $900.00')).toBeTruthy()
    expect(screen.getByText('Change: +5.56%')).toBeTruthy()
    expect(screen.getByText('Points: 2')).toBeTruthy()
    expect(screen.getByText('Comparison included')).toBeTruthy()
    expect(screen.getByText('Posted only')).toBeTruthy()
  })

  it('hides the balance-history change row when the delta is exactly zero', () => {
    render(
      <MantineProvider>
        <AskEvidencePanel
          answer={{
            answerText: 'Net worth is flat.',
            confidence: 'high',
            queryScope: {
              startDate: '2026-03-01',
              endDate: '2026-03-22',
              accountIds: [],
              includePending: false,
              truncated: false,
            },
            evidence: {
              accounts: [],
              transactions: [],
              aggregates: [],
              matchedCount: 2,
              truncated: false,
              balanceHistory: {
                matchedCount: 2,
                truncated: false,
                currentTotal: {
                  money: { amount: 95_000, currency: 'USD' },
                  sign: MoneyWithSignSign.positive,
                },
                previousTotal: {
                  money: { amount: 95_000, currency: 'USD' },
                  sign: MoneyWithSignSign.positive,
                },
                deltaPercent: 0,
                pointCount: 2,
                semanticMetadata: {
                  pendingIncluded: false,
                  reconciliationApplied: true,
                  comparisonIncluded: false,
                },
              },
            },
            followups: [],
          }}
        />
      </MantineProvider>,
    )

    expect(screen.queryByText(/^Change:/)).toBeNull()
  })
})
