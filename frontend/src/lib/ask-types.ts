import type { UIMessage } from 'ai'

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

export type AskAnswer = {
  answerText: string
  confidence: AskConfidence
  queryScope: AskQueryScope
  followups: string[]
}

export type AskMessageMetadata = {
  ask?: AskAnswer
}

export type AskUIMessage = UIMessage<AskMessageMetadata>
