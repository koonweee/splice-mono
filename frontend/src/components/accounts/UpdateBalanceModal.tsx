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
      amount: account.currentBalance.money.amount / 100,
    },
  })

  const handleSubmit = (values: typeof form.values) => {
    const amountInCents = Math.round(values.amount * 100)

    updateBalance.mutate(
      {
        id: account.id,
        data: {
          balance: {
            money: {
              amount: amountInCents,
              currency: account.currentBalance.money.currency || 'USD',
            },
            sign: amountInCents >= 0 ? 'positive' : 'negative',
          },
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
            decimalScale={2}
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
