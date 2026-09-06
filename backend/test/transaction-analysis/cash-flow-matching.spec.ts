import { CashFlowRuleEvaluator } from '../../src/transaction-analysis/cash-flow-rules';
import type { TransactionEntity } from '../../src/transaction/transaction.entity';
import { MoneySign } from '../../src/types/MoneyWithSign';
import {
  matchingFixture,
  referenceMatching,
} from './cash-flow-matching.reference';

const evaluator = new CashFlowRuleEvaluator({} as any);
const identities = (result: ReturnType<typeof referenceMatching>) => ({
  pairs: result.pairs.map(({ outflow, inflow }) => [outflow.id, inflow.id]),
  unmatched: result.unmatchedTransactions.map((transaction) => transaction.id),
});

describe('Indexed neutralization parity', () => {
  it('matches the prior algorithm across randomized dates, same-day IDs and partial pools', () => {
    let seed = 937;
    const random = () => {
      seed = (seed * 48271) % 2147483647;
      return seed;
    };
    for (let sample = 0; sample < 250; sample++) {
      const rows = Array.from(
        { length: 60 },
        (_, index) =>
          ({
            id: `row-${String(random()).padStart(12, '0')}-${index}`,
            providerDate: `2026-09-${String(1 + (random() % 8)).padStart(2, '0')}`,
            reportingDateOverride: null,
            authorizedDate: null,
            amount: {
              currency: random() % 2 ? 'USD' : 'EUR',
              amount: String(random() % 4),
              sign: random() % 2 ? MoneySign.POSITIVE : MoneySign.NEGATIVE,
            },
          }) as TransactionEntity,
      );
      expect(identities(evaluator.neutralizeTransactions(rows))).toEqual(
        identities(referenceMatching(rows)),
      );
    }
  });

  it('keeps adjacent large exact amounts in distinct buckets', () => {
    const rows = matchingFixture(4);
    rows[0].amount.amount = '10000000000000000001';
    rows[1].amount.amount = '10000000000000000002';
    rows[2].amount.amount = '10000000000000000002';
    rows[3].amount.amount = '10000000000000000001';
    expect(identities(evaluator.neutralizeTransactions(rows))).toEqual({
      pairs: [
        ['row-000000', 'row-000003'],
        ['row-000002', 'row-000001'],
      ],
      unmatched: [],
    });
  });
});
