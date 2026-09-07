import { ExactDecimal, minorToMajorString } from '../src/lib/money'
import type {
  CategorizationRuleCondition,
  Transaction,
} from '../src/api/models'

const text = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase()

/** Match synthetic transaction features; never contacts a categorization service. */
export function matchesRule(
  transaction: Transaction,
  conditions: Array<CategorizationRuleCondition>,
) {
  return conditions.every((condition) => {
    if (condition.field === 'accountId')
      return Array.isArray(condition.value)
        ? condition.value.includes(transaction.accountId)
        : condition.value === transaction.accountId
    if (condition.field === 'amountSign')
      return condition.value === transaction.amount.sign
    if (condition.field === 'amount') {
      const amount = new ExactDecimal(
        minorToMajorString(
          transaction.amount.money.amount,
          transaction.amount.money.currency,
        ),
      )
      if (typeof condition.value === 'object')
        return (
          (condition.value.min === undefined ||
            amount.gte(condition.value.min)) &&
          (condition.value.max === undefined || amount.lte(condition.value.max))
        )
      if (condition.operator === 'greaterThan')
        return amount.gt(condition.value)
      if (condition.operator === 'lessThan') return amount.lt(condition.value)
      return amount.eq(condition.value)
    }
    const raw =
      condition.field === 'providerCategoryPrimary'
        ? transaction.providerCategoryHint?.primary
        : condition.field === 'providerCategoryDetailed'
          ? transaction.providerCategoryHint?.detailed
          : transaction[condition.field]
    if (raw == null) return false
    const value = text(raw),
      expected = text(condition.value)
    if (condition.operator === 'contains') return value.includes(expected)
    if (condition.operator === 'startsWith') return value.startsWith(expected)
    if (condition.operator === 'endsWith') return value.endsWith(expected)
    return value === expected
  })
}
