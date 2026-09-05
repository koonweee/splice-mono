import { ActionIcon, Group, NumberInput, Tooltip } from '@mantine/core'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { useQueryClient } from '@tanstack/react-query'
import { Check, X } from 'lucide-react'
import { useCoarsePointer } from '../../lib/responsive'
import {
  getAccountControllerFindAllQueryKey,
  getBalanceQueryControllerGetAllBalancesQueryKey,
  getBalanceQueryControllerGetBalancesQueryKey,
  useAccountControllerUpdateBalance,
} from '../../api/clients/spliceAPI'
import { createMoneyWithSign, getSignedAmount } from '../../lib/balance-utils'
import { getDecimalPlaces } from '../../lib/format'
import type { Account, MoneyWithSign } from '../../api/models'

interface InlineBalanceEditorProps {
  account: Account
  balance: MoneyWithSign
  onCancel: () => void
  onSaved: () => void
}

export function InlineBalanceEditor({
  account,
  balance,
  onCancel,
  onSaved,
}: InlineBalanceEditorProps) {
  const queryClient = useQueryClient()
  const updateBalance = useAccountControllerUpdateBalance()
  const isTouch = useCoarsePointer()
  const currency = balance.money.currency || 'USD'
  const form = useForm({
    initialValues: {
      amount: getSignedAmount(balance),
    },
  })

  const handleSubmit = (values: typeof form.values) => {
    updateBalance.mutate(
      {
        id: account.id,
        data: {
          balance: createMoneyWithSign(values.amount, currency),
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: getAccountControllerFindAllQueryKey(),
          })
          queryClient.invalidateQueries({
            queryKey: getBalanceQueryControllerGetBalancesQueryKey(),
          })
          queryClient.invalidateQueries({
            queryKey: getBalanceQueryControllerGetAllBalancesQueryKey(),
          })
          notifications.show({
            title: 'Balance updated',
            message: 'Account balance has been updated successfully',
            color: 'green',
          })
          onSaved()
        },
        onError: () => {
          notifications.show({
            title: 'Update failed',
            message: 'Unable to update the account balance. Please try again.',
            color: 'red',
          })
        },
      },
    )
  }

  return (
    <form
      aria-label="Edit balance"
      onSubmit={form.onSubmit(handleSubmit)}
      style={{ alignItems: 'center', display: 'flex', minHeight: 44 }}
    >
      <Group gap={4} justify="flex-end" wrap="nowrap">
        <NumberInput
          aria-label="Current balance"
          decimalScale={getDecimalPlaces(currency)}
          fixedDecimalScale
          hideControls
          prefix={currency === 'USD' ? '$' : undefined}
          size={isTouch ? 'md' : 'sm'}
          style={{ width: isTouch ? '8rem' : '7.5rem' }}
          styles={{ input: { minHeight: isTouch ? 44 : 36 } }}
          suffix={currency === 'USD' ? undefined : ` ${currency}`}
          {...form.getInputProps('amount')}
        />
        <Tooltip label="Save balance">
          <ActionIcon
            aria-label="Save balance"
            color="green"
            loading={updateBalance.isPending}
            size={isTouch ? 44 : 'md'}
            type="submit"
            variant="subtle"
          >
            <Check size={18} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Cancel">
          <ActionIcon
            aria-label="Cancel balance edit"
            disabled={updateBalance.isPending}
            onClick={onCancel}
            size={isTouch ? 44 : 'md'}
            type="button"
            variant="subtle"
          >
            <X size={18} />
          </ActionIcon>
        </Tooltip>
      </Group>
    </form>
  )
}
