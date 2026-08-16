import { Button, Modal, NumberInput, Stack } from '@mantine/core'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { useQueryClient } from '@tanstack/react-query'
import {
  getAccountControllerFindAllQueryKey,
  getBalanceQueryControllerGetAllBalancesQueryKey,
  getBalanceQueryControllerGetBalancesQueryKey,
  useAccountControllerUpdateBalance,
} from '../../api/clients/spliceAPI'
import {
  createMoneyWithSign,
  getSignedAmount,
} from '../../lib/balance-utils'
import { getDecimalPlaces } from '../../lib/format'
import type { Account } from '../../api/models'

interface UpdateBalanceModalProps {
  opened: boolean
  onClose: () => void
  account: Account
}

export function UpdateBalanceModal({
  opened,
  onClose,
  account,
}: UpdateBalanceModalProps) {
  const queryClient = useQueryClient()
  const updateBalance = useAccountControllerUpdateBalance()

  const form = useForm({
    initialValues: {
      amount: getSignedAmount(account.currentBalance),
    },
  })

  const handleSubmit = (values: typeof form.values) => {
    const currency = account.currentBalance.money.currency || 'USD'

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
            title: 'Balance Updated',
            message: 'Account balance has been updated successfully',
            color: 'green',
          })
          onClose()
        },
      },
    )
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Update Balance"
      centered
      size="sm"
    >
      <form onSubmit={form.onSubmit(handleSubmit)}>
        <Stack>
          <NumberInput
            label="Current Balance"
            placeholder="0.00"
            decimalScale={getDecimalPlaces(
              account.currentBalance.money.currency,
            )}
            fixedDecimalScale
            prefix={account.currentBalance.money.currency === 'USD' ? '$' : ''}
            size="md"
            {...form.getInputProps('amount')}
          />
          <Button type="submit" loading={updateBalance.isPending}>
            Save
          </Button>
        </Stack>
      </form>
    </Modal>
  )
}
