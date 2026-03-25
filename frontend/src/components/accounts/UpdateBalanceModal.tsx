import {
  Alert,
  Button,
  Modal,
  NumberInput,
  Stack,
  TextInput,
} from '@mantine/core'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { useEffect, useState } from 'react'
import {
  getAccountControllerFindAllQueryKey,
  getAccountControllerFindOneQueryKey,
  getBalanceQueryControllerGetAllBalancesQueryKey,
  getBalanceQueryControllerGetBalancesQueryKey,
  getTransactionAnalysisControllerGetAnalysisQueryKey,
  getTransactionAnalysisControllerGetTransactionsQueryKey,
  getTransactionControllerFindAllQueryKey,
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
  const [confirmationRequired, setConfirmationRequired] = useState(false)

  const resetForm = () => {
    form.setValues({
      amount: account.currentBalance.money.amount / 100,
      effectiveDate: dayjs().format('YYYY-MM-DD'),
    })
    setConfirmationRequired(false)
  }

  const form = useForm({
    initialValues: {
      amount: account.currentBalance.money.amount / 100,
      effectiveDate: dayjs().format('YYYY-MM-DD'),
    },
  })

  useEffect(() => {
    if (opened) {
      resetForm()
    }
  }, [account, opened])

  const requiresHistoryReset =
    !!account.latestSnapshotDate &&
    form.values.effectiveDate < account.latestSnapshotDate

  useEffect(() => {
    if (!requiresHistoryReset && confirmationRequired) {
      setConfirmationRequired(false)
    }
  }, [confirmationRequired, requiresHistoryReset])

  const handleSubmit = (values: typeof form.values) => {
    if (requiresHistoryReset && !confirmationRequired) {
      setConfirmationRequired(true)
      return
    }

    const signedAmountInCents = Math.round((values.amount ?? 0) * 100)
    const amountInCents = Math.abs(signedAmountInCents)

    updateBalance.mutate(
      {
        id: account.id,
        data: {
          balance: {
            money: {
              amount: amountInCents,
              currency: account.currentBalance.money.currency || 'USD',
            },
            sign: signedAmountInCents >= 0 ? 'positive' : 'negative',
          },
          effectiveDate: values.effectiveDate,
          confirmHistoryReset: requiresHistoryReset,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: getAccountControllerFindAllQueryKey(),
          })
          queryClient.invalidateQueries({
            queryKey: getAccountControllerFindOneQueryKey(account.id),
          })
          queryClient.invalidateQueries({
            queryKey: getBalanceQueryControllerGetBalancesQueryKey(),
          })
          queryClient.invalidateQueries({
            queryKey: getBalanceQueryControllerGetAllBalancesQueryKey(),
          })
          queryClient.invalidateQueries({
            queryKey: getTransactionControllerFindAllQueryKey(),
          })
          queryClient.invalidateQueries({
            queryKey: getTransactionAnalysisControllerGetAnalysisQueryKey(),
          })
          queryClient.invalidateQueries({
            queryKey: getTransactionAnalysisControllerGetTransactionsQueryKey(),
          })
          notifications.show({
            title: 'Balance Updated',
            message: 'Account balance has been updated successfully',
            color: 'green',
          })
          resetForm()
          onClose()
        },
      },
    )
  }

  const handleClose = () => {
    resetForm()
    onClose()
  }

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
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
            {...form.getInputProps('amount')}
          />
          <TextInput
            label="Effective date"
            type="date"
            {...form.getInputProps('effectiveDate')}
          />
          {requiresHistoryReset && (
            <Alert color="yellow" title="This will reset later history">
              Saving this backdated balance will remove all later balance
              history for this account.
              {confirmationRequired ? ' Click save again to confirm.' : ''}
            </Alert>
          )}
          <Button type="submit" loading={updateBalance.isPending}>
            {requiresHistoryReset && confirmationRequired
              ? 'Confirm reset and save'
              : 'Save'}
          </Button>
        </Stack>
      </form>
    </Modal>
  )
}
