import { Stack } from '@mantine/core'
import type { FormEventHandler, ReactNode } from 'react'

export const manualTransactionLabels = {
  account: 'Account',
  amount: 'Amount',
  currency: 'Currency',
  date: 'Date',
  merchant: 'Merchant',
  category: 'Category',
  recurring: 'Repeat monthly',
} as const

export function ManualTransactionFormFrame({
  children,
  onSubmit,
  pending = false,
}: {
  children: ReactNode
  onSubmit?: FormEventHandler<HTMLFormElement>
  pending?: boolean
}) {
  return (
    <form onSubmit={onSubmit} inert={pending || undefined}>
      <Stack gap="md">{children}</Stack>
    </form>
  )
}
