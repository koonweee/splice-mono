import {
  ActionIcon,
  Button,
  Group,
  Modal,
  NumberInput,
  Stack,
  Text,
  TextInput,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconPlus, IconTrash } from '@tabler/icons-react'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { getAccountControllerFindAllQueryKey } from '../../api/clients/spliceAPI'
import {
  manualInvestmentQueryKeys,
  useReplaceManualInvestmentSnapshot,
  type ManualInvestmentSnapshot,
} from '../../api/manualInvestment'
import { getBalanceQueryControllerGetAllBalancesQueryKey, getBalanceQueryControllerGetBalancesQueryKey } from '../../api/clients/spliceAPI'
import { MoneyWithSignSign } from '../../api/models'
import type { Account } from '../../api/models'

interface HoldingRow {
  symbol: string
  displayName: string
  quantity: number | string
}

interface UpdateHoldingsModalProps {
  opened: boolean
  onClose: () => void
  account: Account
  snapshot?: ManualInvestmentSnapshot
}

function makeEmptyHolding(): HoldingRow {
  return {
    symbol: '',
    displayName: '',
    quantity: 1,
  }
}

export function UpdateHoldingsModal({
  opened,
  onClose,
  account,
  snapshot,
}: UpdateHoldingsModalProps) {
  const queryClient = useQueryClient()
  const replaceSnapshot = useReplaceManualInvestmentSnapshot()
  const [snapshotDate, setSnapshotDate] = useState('')
  const [cashBalance, setCashBalance] = useState<number | string>(0)
  const [holdings, setHoldings] = useState<Array<HoldingRow>>([makeEmptyHolding()])

  useEffect(() => {
    if (!opened) {
      return
    }

    const fallbackDate = new Date().toISOString().split('T')[0]
    setSnapshotDate(snapshot?.snapshotDate ?? fallbackDate)

    const signedCash =
      snapshot?.cashBalance.sign === MoneyWithSignSign.negative
        ? -(snapshot.cashBalance.money.amount / 100)
        : (snapshot?.cashBalance.money.amount ?? 0) / 100
    setCashBalance(signedCash)

    setHoldings(
      snapshot?.holdings.length
        ? snapshot.holdings.map((holding) => ({
            symbol: holding.symbol,
            displayName: holding.displayName ?? '',
            quantity: holding.quantity,
          }))
        : [makeEmptyHolding()],
    )
  }, [opened, snapshot])

  const updateHolding = (
    index: number,
    field: keyof HoldingRow,
    value: HoldingRow[keyof HoldingRow],
  ) => {
    setHoldings((current) =>
      current.map((holding, currentIndex) =>
        currentIndex === index ? { ...holding, [field]: value } : holding,
      ),
    )
  }

  const handleSubmit = () => {
    const amountInCents = Math.round(Number(cashBalance) * 100)

    replaceSnapshot.mutate(
      {
        accountId: account.id,
        date: snapshotDate,
        data: {
          cashBalance: {
            money: {
              amount: Math.abs(amountInCents),
              currency: account.currentBalance.money.currency,
            },
            sign:
              amountInCents < 0
                ? MoneyWithSignSign.negative
                : MoneyWithSignSign.positive,
          },
          holdings: holdings
            .filter((holding) => holding.symbol.trim())
            .map((holding) => ({
              symbol: holding.symbol.trim(),
              displayName: holding.displayName.trim() || null,
              quantity: Number(holding.quantity),
            })),
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
          queryClient.invalidateQueries({
            queryKey: manualInvestmentQueryKeys.all(account.id),
          })
          notifications.show({
            title: 'Holdings Updated',
            message: 'The dated holdings snapshot was saved successfully.',
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
      title={snapshot ? 'Edit Holdings Snapshot' : 'Add Holdings Snapshot'}
      centered
      size="lg"
    >
      <Stack>
        <TextInput
          label="Snapshot Date"
          type="date"
          value={snapshotDate}
          onChange={(event) => setSnapshotDate(event.currentTarget.value)}
        />
        <NumberInput
          label="Cash Balance"
          decimalScale={2}
          fixedDecimalScale
          prefix={account.currentBalance.money.currency === 'USD' ? '$' : ''}
          value={cashBalance}
          onChange={setCashBalance}
        />

        <Stack gap="xs">
          <Group justify="space-between">
            <Text fw={500}>Holdings</Text>
            <Button
              variant="light"
              size="xs"
              leftSection={<IconPlus size={14} />}
              onClick={() =>
                setHoldings((current) => [...current, makeEmptyHolding()])
              }
            >
              Add Holding
            </Button>
          </Group>
          {holdings.map((holding, index) => (
            <Group key={`${holding.symbol}-${index}`} align="end" wrap="nowrap">
              <TextInput
                label="Symbol"
                placeholder="VOO"
                value={holding.symbol}
                onChange={(event) =>
                  updateHolding(index, 'symbol', event.currentTarget.value)
                }
              />
              <TextInput
                label="Display Name"
                placeholder="Vanguard S&P 500 ETF"
                value={holding.displayName}
                onChange={(event) =>
                  updateHolding(index, 'displayName', event.currentTarget.value)
                }
              />
              <NumberInput
                label="Quantity"
                decimalScale={4}
                value={holding.quantity}
                onChange={(value) => updateHolding(index, 'quantity', value)}
              />
              <ActionIcon
                color="red"
                variant="light"
                mb={2}
                onClick={() =>
                  setHoldings((current) =>
                    current.length === 1
                      ? [makeEmptyHolding()]
                      : current.filter((_, currentIndex) => currentIndex !== index),
                  )
                }
              >
                <IconTrash size={16} />
              </ActionIcon>
            </Group>
          ))}
        </Stack>

        <Button
          onClick={handleSubmit}
          loading={replaceSnapshot.isPending}
          disabled={!snapshotDate}
        >
          Save Snapshot
        </Button>
      </Stack>
    </Modal>
  )
}
