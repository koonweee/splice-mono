import type { UIMessage } from 'ai'
import type { MoneyWithSign } from '@/api/models'

export type AskConfidence = 'high' | 'medium' | 'low'

export type AskQueryScope = {
  startDate?: string
  endDate?: string
  comparisonStartDate?: string
  comparisonEndDate?: string
  accountIds: string[]
  includePending: boolean
  truncated: boolean
}

export type AskEvidenceAccount = {
  id: string
  displayName: string
  institutionName: string | null
  grouping: 'cash' | 'credit' | 'investment' | 'liability'
  balance: MoneyWithSign
}

export type AskEvidenceTransaction = {
  id: string
  accountId: string
  accountName: string
  merchantName: string | null
  pending: boolean
  date: string
  categoryPrimary: string | null
  amount: MoneyWithSign
  convertedAmount?: MoneyWithSign
}

export type AskEvidenceAggregate = {
  label: string
  amount: number // major units
  currency: string
  kind: 'category' | 'merchant' | 'account' | 'summary'
}

export type AskAnswer = {
  answerText: string
  confidence: AskConfidence
  queryScope: AskQueryScope
  evidence: {
    accounts: AskEvidenceAccount[]
    transactions: AskEvidenceTransaction[]
    aggregates: AskEvidenceAggregate[]
    matchedCount: number
    truncated: boolean
  }
  followups: string[]
}

export type AskMessageMetadata = {
  ask?: AskAnswer
}

export type AskUIMessage = UIMessage<AskMessageMetadata>
