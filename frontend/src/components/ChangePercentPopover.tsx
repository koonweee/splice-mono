import {
  HIDDEN_BALANCE_PLACEHOLDER,
  formatMoneyWithSign,
  formatPercent,
} from '../lib/format'
import { MoneyWithSignSign } from '../api/models'
import { PercentAmountPopover } from './PercentAmountPopover'
import type { MoneyWithSign } from '../api/models'

function formatChangeAmount(changeAmount: MoneyWithSign): string {
  const formattedAmount = formatMoneyWithSign({ value: changeAmount })
  return changeAmount.sign === MoneyWithSignSign.positive
    ? `+${formattedAmount}`
    : formattedAmount
}

export function ChangePercentPopover({
  changeAmount,
  changePercent,
  color,
  hidden = false,
  textRole = 'caption',
  testId,
}: {
  changeAmount?: MoneyWithSign
  changePercent?: number
  color: string
  hidden?: boolean
  textRole?: 'caption' | 'metadata'
  testId?: string
}) {
  const percent = formatPercent(changePercent)

  if (!percent) return null

  const amount = hidden
    ? HIDDEN_BALANCE_PLACEHOLDER
    : changeAmount
      ? formatChangeAmount(changeAmount)
      : undefined

  return (
    <PercentAmountPopover
      percent={percent}
      amount={amount}
      label={`Show absolute change ${amount}`}
      color={color}
      textRole={textRole}
      testId={testId}
    />
  )
}
