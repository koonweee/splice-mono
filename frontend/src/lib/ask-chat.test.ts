import { describe, expect, it } from 'vitest'
import {
  buildAccountEvidenceLink,
  buildTransactionEvidenceLink,
  getAskMessageText,
  getAskMetadata,
  getAskUiState,
  selectEvidenceMessageId,
  shouldRenderAskMessage,
} from './ask-chat'

describe('ask chat helpers', () => {
  it('extracts Ask metadata from the assistant message', () => {
    const message = {
      id: 'assistant-1',
      role: 'assistant',
      metadata: {
        ask: {
          answerText: 'Your outflows are up 14%',
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
            matchedCount: 4,
            truncated: false,
          },
          followups: [],
          confidence: 'high',
        },
      },
    }

    expect(getAskMetadata(message)?.queryScope.startDate).toBe('2026-03-01')
  })

  it('tracks which assistant message drives the evidence panel', () => {
    const selectedId = selectEvidenceMessageId([
      { id: 'u1', role: 'user' },
      {
        id: 'a1',
        role: 'assistant',
        metadata: { ask: { evidence: { matchedCount: 1 } } },
      },
    ])

    expect(selectedId).toBe('a1')
  })

  it('marks Ask messages with retryable error state when streaming fails', () => {
    expect(getAskUiState({ error: new Error('network') })).toMatchObject({
      status: 'error',
      canRetry: true,
    })
  })

  it('extracts visible text from Ask message parts', () => {
    expect(
      getAskMessageText({
        role: 'assistant',
        parts: [
          { type: 'text', text: 'Hello' },
          { type: 'text', text: ' world' },
        ],
      }),
    ).toBe('Hello world')
  })

  it('does not render empty assistant shell messages', () => {
    expect(
      shouldRenderAskMessage({
        id: 'assistant-empty',
        role: 'assistant',
        parts: [],
      }),
    ).toBe(false)
  })

  it('renders assistant messages when Ask metadata contains the answer', () => {
    expect(
      shouldRenderAskMessage({
        id: 'assistant-answer',
        role: 'assistant',
        metadata: {
          ask: {
            answerText: 'Largest spend was rent.',
            queryScope: {
              accountIds: [],
              includePending: false,
              truncated: false,
            },
            evidence: {
              accounts: [],
              transactions: [],
              aggregates: [],
              matchedCount: 1,
              truncated: false,
            },
            followups: [],
            confidence: 'high',
          },
        },
      }),
    ).toBe(true)
  })

  it('builds transaction links into the existing Transactions page filters', () => {
    expect(
      buildTransactionEvidenceLink({
        accountId: 'account-1',
        queryScope: {
          startDate: '2026-03-01',
          endDate: '2026-03-22',
        },
      }),
    ).toBe('/transactions?accountId=account-1&startDate=2026-03-01&endDate=2026-03-22')
  })

  it('builds account links into the existing Accounts page when possible', () => {
    expect(
      buildAccountEvidenceLink({
        accountId: 'account-1',
      }),
    ).toBe('/accounts?accountId=account-1')
  })
})
