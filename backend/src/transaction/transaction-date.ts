import type { TransactionEntity } from './transaction.entity';

export const TRANSACTION_ACTIVITY_DATE_EXPRESSION =
  'COALESCE(transaction."reportingDateOverride", transaction."authorizedDate", activity."providerDate")';

export const TRANSACTION_ACTIVITY_DATETIME_EXPRESSION =
  'COALESCE(transaction."authorizedDatetime", activity."providerDatetime")';

export function getTransactionActivityDate(
  transaction: TransactionEntity,
): string {
  return (
    transaction.reportingDateOverride ??
    transaction.authorizedDate ??
    transaction.providerDate
  );
}
