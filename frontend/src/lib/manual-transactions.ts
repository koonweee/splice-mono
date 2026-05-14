import { TransactionSource } from '../api/models'
import type { Transaction } from '../api/models'

export function isManualTransaction(transaction: Transaction) {
  return transaction.source === TransactionSource.manual
}
