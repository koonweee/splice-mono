import type { TransactionEntity } from '../../src/transaction/transaction.entity';
import { MoneySign } from '../../src/types/MoneyWithSign';
import { getTransactionActivityDate } from '../../src/transaction/transaction-date';

/** Frozen pre-refactor matching algorithm, retained only to prove selection and ordering parity. */
export function referenceMatching(transactions: TransactionEntity[]) {
  const compare = (left: TransactionEntity, right: TransactionEntity) =>
    getTransactionActivityDate(left).localeCompare(
      getTransactionActivityDate(right),
    ) || left.id.localeCompare(right.id);
  const buckets = new Map<
    string,
    {
      currency: string;
      amount: bigint;
      positives: TransactionEntity[];
      negatives: TransactionEntity[];
    }
  >();
  for (const transaction of transactions) {
    const key = `${transaction.amount.currency}:${transaction.amount.amount}`;
    const bucket = buckets.get(key) ?? {
      currency: transaction.amount.currency,
      amount: BigInt(transaction.amount.amount),
      positives: [],
      negatives: [],
    };
    (transaction.amount.sign === MoneySign.POSITIVE
      ? bucket.positives
      : bucket.negatives
    ).push(transaction);
    buckets.set(key, bucket);
  }
  const unmatchedTransactions: TransactionEntity[] = [];
  const pairs: Array<{
    outflow: TransactionEntity;
    inflow: TransactionEntity;
  }> = [];
  for (const bucket of [...buckets.values()].sort(
    (a, b) =>
      a.currency.localeCompare(b.currency) ||
      (a.amount < b.amount ? -1 : a.amount > b.amount ? 1 : 0),
  )) {
    const positives = [...bucket.positives].sort(compare);
    const negatives = [...bucket.negatives].sort(compare);
    const matchedPositiveIds = new Set<string>();
    const matchedNegativeIds = new Set<string>();
    for (const positive of positives) {
      const match = negatives
        .filter(
          (negative) =>
            !matchedNegativeIds.has(negative.id) &&
            getTransactionActivityDate(negative) <=
              getTransactionActivityDate(positive),
        )
        .sort((left, right) => {
          const difference = (date: string) =>
            Math.floor(
              (Date.parse(`${getTransactionActivityDate(positive)}T00:00:00Z`) -
                Date.parse(`${date}T00:00:00Z`)) /
                86400000,
            );
          return (
            difference(getTransactionActivityDate(left)) -
              difference(getTransactionActivityDate(right)) ||
            compare(left, right)
          );
        })[0];
      if (!match) continue;
      matchedPositiveIds.add(positive.id);
      matchedNegativeIds.add(match.id);
      pairs.push({ outflow: match, inflow: positive });
    }
    unmatchedTransactions.push(
      ...positives.filter((row) => !matchedPositiveIds.has(row.id)),
      ...negatives.filter((row) => !matchedNegativeIds.has(row.id)),
    );
  }
  return { unmatchedTransactions, pairs };
}

export function matchingFixture(count: number): TransactionEntity[] {
  return Array.from(
    { length: count },
    (_, index) =>
      ({
        id: `row-${String(index).padStart(6, '0')}`,
        providerDate: index % 2 ? '2026-09-02' : '2026-09-01',
        authorizedDate: null,
        reportingDateOverride: null,
        amount: {
          currency: 'USD',
          amount: '100',
          sign: index % 2 ? MoneySign.POSITIVE : MoneySign.NEGATIVE,
        },
      }) as TransactionEntity,
  );
}
