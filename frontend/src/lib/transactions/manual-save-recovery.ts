import {
  recurringManualTransactionControllerFindAll,
  transactionControllerFindAll,
  transactionControllerFindOne,
} from '../../api/clients/spliceAPI'
import { assertAuthGeneration, getAuthGeneration } from '../auth-generation'
import type {
  CreateManualTransactionDto,
  MoneyWithSign,
} from '../../api/models'

export type ManualSaveAttempt = {
  payload: CreateManualTransactionDto
  transactionId?: string
  recurrenceDay?: number
}

/** Bounded reads give evidence for an uncertain write; they never automatically retry it. */
export async function checkManualSave(
  attempt: ManualSaveAttempt,
): Promise<number> {
  const generation = getAuthGeneration()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)
  const { payload } = attempt
  const sameAmount = (amount: MoneyWithSign) =>
    amount.money.currency === payload.amount.money.currency &&
    amount.money.amount === payload.amount.money.amount &&
    amount.sign === payload.amount.sign
  const commonMatch = (item: {
    accountId: string
    merchantName: string | null
    categoryId: string | null
    amount: MoneyWithSign
  }) =>
    item.accountId === payload.accountId &&
    item.merchantName === payload.merchantName &&
    item.categoryId === payload.categoryId &&
    sameAmount(item.amount)
  try {
    let count: number
    if (attempt.recurrenceDay !== undefined) {
      const schedules = await recurringManualTransactionControllerFindAll(
        controller.signal,
      )
      count = schedules.filter(
        (item) =>
          !item.archivedAt &&
          commonMatch(item) &&
          item.startDate === payload.providerDate &&
          item.dayOfMonth === attempt.recurrenceDay,
      ).length
    } else {
      const transactions = attempt.transactionId
        ? [
            await transactionControllerFindOne(
              attempt.transactionId,
              controller.signal,
            ),
          ]
        : (
            await transactionControllerFindAll(
              {
                accountId: payload.accountId,
                startDate: payload.providerDate,
                endDate: payload.providerDate,
                pageSize: '50',
                includeTotal: false,
                sortBy: 'activityDate',
                sortOrder: 'DESC',
              },
              controller.signal,
            )
          ).data
      count = transactions.filter(
        (item) =>
          item.source === 'manual' &&
          commonMatch(item) &&
          item.providerDate === payload.providerDate,
      ).length
    }
    assertAuthGeneration(generation)
    return count
  } finally {
    clearTimeout(timer)
  }
}
