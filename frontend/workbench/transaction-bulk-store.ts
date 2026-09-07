import { AxiosError, AxiosHeaders } from 'axios'
import { FIXTURE_NOW } from './fixtures'
import type {
  BulkTransactionCategoryUpdateDto,
  BulkTransactionCategoryUpdateResponse,
  Category,
  Transaction,
} from '../src/api/models'

type Snapshot = Pick<
  Transaction,
  | 'id'
  | 'categoryId'
  | 'categoryUpdatedAt'
  | 'categoryAssignmentSource'
  | 'categoryAssignmentRuleId'
>

export function createTransactionBulkStore(
  transactions: Array<Transaction>,
  categories: Array<Category>,
) {
  const undos = new Map<string, Array<Snapshot>>()
  let sequence = 1
  function invalid(): never {
    throw new AxiosError(
      'Selection or undo is unavailable in this fixture.',
      'ERR_BAD_RESPONSE',
      undefined,
      undefined,
      {
        status: 404,
        statusText: 'Not found',
        headers: {},
        config: { headers: new AxiosHeaders() },
        data: { message: 'Selection or undo is unavailable in this fixture.' },
      },
    )
  }
  function update(
    draft: BulkTransactionCategoryUpdateDto,
  ): BulkTransactionCategoryUpdateResponse {
    const ids = [...new Set(draft.transactionIds)]
    const selected = transactions.filter((item) => ids.includes(item.id))
    const category =
      categories.find(
        (item) => item.id === draft.categoryId && !item.archivedAt,
      ) ?? null
    if (
      !ids.length ||
      selected.length !== ids.length ||
      (draft.categoryId !== null && !category)
    )
      invalid()
    const affected = selected.filter((item) => item.source !== 'manual')
    const snapshots = affected.map(
      ({
        id,
        categoryId,
        categoryUpdatedAt,
        categoryAssignmentSource,
        categoryAssignmentRuleId,
      }) => ({
        id,
        categoryId,
        categoryUpdatedAt,
        categoryAssignmentSource,
        categoryAssignmentRuleId,
      }),
    )
    const token = `workbench-undo-${sequence++}`
    undos.set(token, snapshots)
    affected.forEach((item) =>
      Object.assign(item, {
        categoryId: draft.categoryId,
        category,
        categoryUpdatedAt: FIXTURE_NOW,
        categoryAssignmentSource: 'manual',
        categoryAssignmentRuleId: null,
      }),
    )
    return {
      count: affected.length,
      transactionIds: affected.map((item) => item.id),
      undo: token,
    }
  }
  function undo(token: string): BulkTransactionCategoryUpdateResponse {
    const snapshots = undos.get(token)
    if (!snapshots) return invalid()
    // Check the whole selection before restoring anything, as the real endpoint does.
    if (
      snapshots.some(
        (item) =>
          !transactions.some((transaction) => transaction.id === item.id) ||
          (item.categoryId !== null &&
            !categories.some(
              (category) =>
                category.id === item.categoryId && !category.archivedAt,
            )),
      )
    )
      invalid()
    for (const snapshot of snapshots) {
      const transaction = transactions.find((item) => item.id === snapshot.id)
      if (transaction)
        Object.assign(transaction, snapshot, {
          category:
            categories.find((item) => item.id === snapshot.categoryId) ?? null,
        })
    }
    return {
      count: snapshots.length,
      transactionIds: snapshots.map((item) => item.id),
      undo: '',
    }
  }
  return { update, undo }
}
